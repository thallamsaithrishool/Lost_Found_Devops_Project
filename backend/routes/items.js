const express = require("express");
const router = express.Router();
const multer = require("multer");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const Item = require("../models/Item");

// ===== GEMINI SAFE IMPORT =====
let GoogleGenerativeAI;
try {
  ({ GoogleGenerativeAI } = require("@google/generative-ai"));
} catch {}

let genAI;
if (process.env.GEMINI_API_KEY && GoogleGenerativeAI) {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

// ===== MULTER =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// ===== EMAIL =====
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ===== AI COMPARE =====
const compareImagesWithAI = async (img1, img2) => {
  if (!genAI) return true;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const img1Base = fs.readFileSync(img1).toString("base64");
    const img2Base = fs.readFileSync(img2).toString("base64");

    const result = await model.generateContent([
      { inlineData: { mimeType: "image/jpeg", data: img1Base } },
      { inlineData: { mimeType: "image/jpeg", data: img2Base } },
      "Reply ONLY YES or NO: Are these the same item?",
    ]);

    return result.response.text().trim().toUpperCase() === "YES";
  } catch (err) {
    console.log("AI error:", err.message);
    return true;
  }
};

// ===== GET ALL ITEMS =====
router.get("/", async (req, res) => {
  try {
    const items = await Item.find().sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ===== ADD ITEM =====
router.post("/", upload.single("image"), async (req, res) => {
  try {
    const { itemName, description, location, contact, email, type } =
      req.body;

    // Ensure uploads folder exists
    if (!fs.existsSync("uploads")) {
      fs.mkdirSync("uploads");
    }

    const image = req.file ? `/uploads/${req.file.filename}` : "";

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

    // ===== AGGREGATION PIPELINE MATCH =====
    if (type === "found") {
      const matches = await Item.aggregate([
        {
          $match: {
            type: "lost",
            itemName: { $regex: new RegExp(itemName, "i") },
          },
        },
        {
          $lookup: {
            from: "items",
            localField: "itemName",
            foreignField: "itemName",
            as: "matchedFoundItems",
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

      console.log(`🔍 Found ${matches.length} possible matches`);

      for (const lostItem of matches) {
        let match = true;

        if (lostItem.image && image) {
          const p1 = path.join(__dirname, "..", lostItem.image);
          const p2 = path.join(__dirname, "..", image);

          if (fs.existsSync(p1) && fs.existsSync(p2)) {
            console.log("🤖 Comparing images with Gemini AI...");
            match = await compareImagesWithAI(p1, p2);
            console.log(`🤖 AI Result: ${match ? "YES ✅" : "NO ❌"}`);
          }
        }

        if (match) {
          try {
            await transporter.sendMail({
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
                    <p><b>Description:</b> ${lostItem.description || "N/A"}</p>
                  </div>
                  <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 15px 0;">
                    <h3 style="color: #3ecf8e;">Found By:</h3>
                    <p><b>Email:</b> ${newItem.email}</p>
                    <p><b>Phone:</b> ${newItem.contact || "N/A"}</p>
                    <p><b>Found At:</b> ${newItem.location}</p>
                  </div>
                  <p style="color: #888; font-size: 12px;">This is an automated message from Lost & Found Portal.</p>
                </div>
              `,
            });
            console.log(`✅ Email sent to ${lostItem.email}`);
          } catch (mailErr) {
            console.log("⚠️ Email error:", mailErr.message);
          }
        }
      }
    }

    res.status(201).json({ message: "Item added ✅" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ===== DELETE ITEM =====
router.delete("/:id", async (req, res) => {
  try {
    await Item.findByIdAndDelete(req.params.id);
    res.json({ message: "Item deleted ✅" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ===== GET MATCHED ITEMS (pipeline) =====
router.get("/matches", async (req, res) => {
  try {
    const matches = await Item.aggregate([
      { $match: { type: "lost" } },
      {
        $lookup: {
          from: "items",
          let: { lostName: "$itemName" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$type", "found"] },
                    {
                      $regexMatch: {
                        input: "$itemName",
                        regex: "$$lostName",
                        options: "i",
                      },
                    },
                  ],
                },
              },
            },
          ],
          as: "foundMatches",
        },
      },
      { $match: { "foundMatches.0": { $exists: true } } },
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
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;