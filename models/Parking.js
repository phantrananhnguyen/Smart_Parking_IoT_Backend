const mongoose = require("mongoose");

const ParkingSchema = new mongoose.Schema({
  licensePlate: { type: String, required: true },
  checkInTime: { type: Date, default: Date.now },
  checkOutTime: { type: Date },
});

const Parking = mongoose.model("Parking", ParkingSchema);

module.exports = Parking;
