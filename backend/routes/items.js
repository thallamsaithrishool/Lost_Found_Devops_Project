const express = require('express');
const router = express.Router();
const multer = require('multer');
const nodemailer = require('nodemailer');
const Item = require('../models/Item');

// ===== MULTER SETUP (image upload) =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});
const upload = multer({ storage });

// ===== NODEMAILER SETUP =====
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ===== SEND EMAIL FUNCTION =====
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

          <p style="color: #888; font-size: 12px;">This is an automated message from Lost & Found Portal.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${lostItem.email}`);
  } catch (err) {
    // Email failed but don't crash the app
    console.log('⚠️ Email not sent (check EMAIL_USER and EMAIL_PASS in .env):', err.message);
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

// ===== ADD ITEM + PIPELINE MATCH + SEND EMAIL =====
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { itemName, description, location, contact, email, type } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : '';

    // Save new item to MongoDB
    const newItem = new Item({ itemName, description, location, contact, email, type, image });
    await newItem.save();

    // ===== AGGREGATION PIPELINE =====
    // If found item submitted → check if any lost item matches by name
    if (type === 'found') {
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
          },
        },
      ]);

      // Send email to each matched lost item owner (won't crash if email fails)
      if (matches.length > 0) {
        for (const lostItem of matches) {
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