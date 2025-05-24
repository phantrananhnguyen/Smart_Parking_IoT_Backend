// models/ParkingSlot.js
const mongoose = require("mongoose");

const parkingSlotSchema = new mongoose.Schema({
  slotId: { type: String, required: true, unique: true },
  status: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("ParkingSlot", parkingSlotSchema);
