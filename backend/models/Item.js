const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
  itemName:    { type: String, required: true },
  description: { type: String },
  location:    { type: String, required: true },
  contact:     { type: String },
  email:       { type: String, required: true },
  type:        { type: String, enum: ['lost', 'found'], required: true },
  image:       { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Item', ItemSchema);