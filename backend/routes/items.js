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

    // 🔥 FIX: ensure uploads folder exists
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

    // ===== MATCH LOGIC =====
    if (type === "found") {
      const lostItems = await Item.find({
        type: "lost",
        itemName: { $regex: itemName, $options: "i" },
      });

      console.log(`Found ${lostItems.length} possible matches`);

      for (const lostItem of lostItems) {
        let match = true;

        if (lostItem.image && image) {
          const p1 = path.join(__dirname, "..", lostItem.image);
          const p2 = path.join(__dirname, "..", image);

          if (fs.existsSync(p1) && fs.existsSync(p2)) {
            match = await compareImagesWithAI(p1, p2);
          }
        }

        if (match) {
          try {
            await transporter.sendMail({
              from: process.env.EMAIL_USER,
              to: lostItem.email,
              subject: "Item Match Found 🎉",
              text: `Your lost item "${lostItem.itemName}" may be found.`,
            });

            console.log(`Email sent to ${lostItem.email}`);
          } catch (mailErr) {
            console.log("Email error:", mailErr.message);
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

module.exports = router;