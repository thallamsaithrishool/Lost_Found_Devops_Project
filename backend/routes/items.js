const express = require('express');
const router = express.Router();
const multer = require('multer');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Item = require('../models/Item');

// ===== MULTER SETUP =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});
const upload = multer({ storage });

// ===== GEMINI AI SETUP =====
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ===== NODEMAILER SETUP =====
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ===== COMPARE IMAGES WITH GEMINI AI =====
const compareImagesWithAI = async (lostImagePath, foundImagePath) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Read both images as base64
    const lostImageData = fs.readFileSync(lostImagePath);
    const foundImageData = fs.readFileSync(foundImagePath);

    const lostBase64 = lostImageData.toString('base64');
    const foundBase64 = foundImageData.toString('base64');

    const lostMime = 'image/jpeg';
    const foundMime = 'image/jpeg';

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: lostMime,
          data: lostBase64,
        },
      },
      {
        inlineData: {
          mimeType: foundMime,
          data: foundBase64,
        },
      },
      `Compare these two images carefully. 
       Are they showing the same item or very similar item? 
       Consider color, shape, type, and general appearance.
       Ignore background differences.
       Reply with ONLY one word: YES or NO.`,
    ]);

    const response = result.response.text().trim().toUpperCase();
    console.log(`🤖 AI Image Comparison Result: ${response}`);
    return response === 'YES';
  } catch (err) {
    console.log('⚠️ AI comparison failed:', err.message);
    // If AI fails, fall back to name matching only
    return true;
  }
};

// ===== SEND EMAIL =====
const sendMatchEmail = async (lostItem, foundItem) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: lostItem.email,
      subject: `🎉 Your lost item "${lostItem.itemName}" may have been found!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <h2 style="color: #3ecf8e;">Great News! 🎉</h2>
          <p>Someone reported finding an item that matches your lost item.</p>
          <p style="background:#fff3cd; padding:10px; border-radius:8px;">
            ✅ <b>Our AI verified the images match!</b>
          </p>

          <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <h3 style="color: #ff5f6d;">Your Lost Item:</h3>
            <p><b>Item:</b> ${lostItem.itemName}</p>
            <p><b>Location:</b> ${lostItem.location}</p>
            <p><b>Description:</b> ${lostItem.description || 'N/A'}</p>
          </div>

          <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <h3 style="color: #3ecf8e;">Matching Found Item:</h3>
            <p><b>Item:</b> ${foundItem.itemName}</p>
            <p><b>Found At:</b> ${foundItem.location}</p>
            <p><b>Description:</b> ${foundItem.description || 'N/A'}</p>
          </div>

          <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <h3>Contact the Finder:</h3>
            <p><b>Email:</b> ${foundItem.email}</p>
            <p><b>Phone:</b> ${foundItem.contact || 'N/A'}</p>
          </div>

          <p style="color: #888; font-size: 12px;">
            This is an automated message from Lost & Found Portal.<br/>
            AI image verification was used to confirm this match.
          </p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${lostItem.email}`);
  } catch (err) {
    console.log('⚠️ Email not sent:', err.message);
  }
};

// ===== GET ALL ITEMS =====
router.get('/', async (req, res) => {
  try {
    const items = await Item.find().sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== ADD ITEM + AI IMAGE MATCH + SEND EMAIL =====
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { itemName, description, location, contact, email, type } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : '';

    // Save new item to MongoDB
    const newItem = new Item({
      itemName,
      description,
      location,
      contact,
      email,
      type,
      image,
    });
    await newItem.save();

    // ===== IF FOUND ITEM → CHECK MATCHES =====
    if (type === 'found') {

      // AGGREGATION PIPELINE → find lost items with same name
      const matches = await Item.aggregate([
        {
          $match: {
            type: 'lost',
            itemName: { $regex: new RegExp(itemName, 'i') },
          },
        },
        {
          $lookup: {
            from: 'items',
            localField: 'itemName',
            foreignField: 'itemName',
            as: 'matchedFoundItems',
          },
        },
        {
          $project: {
            itemName: 1,
            location: 1,
            description: 1,
            email: 1,
            contact: 1,
            image: 1,
          },
        },
      ]);

      console.log(`🔍 Found ${matches.length} name matches`);

      // For each name match → compare images with AI
      for (const lostItem of matches) {
        let shouldSendEmail = false;

        // Both items have images → use AI comparison
        if (lostItem.image && image) {
          const lostImagePath = path.join(__dirname, '..', lostItem.image);
          const foundImagePath = path.join(__dirname, '..', image);

          console.log(`🤖 Comparing images with Gemini AI...`);
          const imagesMatch = await compareImagesWithAI(lostImagePath, foundImagePath);

          if (imagesMatch) {
            console.log(`✅ AI confirmed images match!`);
            shouldSendEmail = true;
          } else {
            console.log(`❌ AI says images do NOT match — skipping email`);
            shouldSendEmail = false;
          }
        } else {
          // No images → just name match is enough
          console.log(`⚠️ No images to compare — sending email based on name match only`);
          shouldSendEmail = true;
        }

        if (shouldSendEmail) {
          await sendMatchEmail(lostItem, newItem);
        }
      }
    }

    res.status(201).json({ message: 'Item added successfully ✅', item: newItem });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== DELETE ITEM =====
router.delete('/:id', async (req, res) => {
  try {
    await Item.findByIdAndDelete(req.params.id);
    res.json({ message: 'Item deleted ✅' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== GET MATCHED ITEMS (pipeline) =====
router.get('/matches', async (req, res) => {
  try {
    const matches = await Item.aggregate([
      {
        $match: { type: 'lost' },
      },
      {
        $lookup: {
          from: 'items',
          let: { lostName: '$itemName' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$type', 'found'] },
                    {
                      $regexMatch: {
                        input: '$itemName',
                        regex: '$$lostName',
                        options: 'i',
                      },
                    },
                  ],
                },
              },
            },
          ],
          as: 'foundMatches',
        },
      },
      {
        $match: { 'foundMatches.0': { $exists: true } },
      },
      {
        $project: {
          itemName: 1,
          location: 1,
          description: 1,
          email: 1,
          contact: 1,
          foundMatches: 1,
        },
      },
    ]);

    res.json(matches);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;