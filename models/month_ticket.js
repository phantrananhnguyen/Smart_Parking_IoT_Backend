const mongoose = require("mongoose");

const ParkingSchema = new mongoose.Schema({
  licensePlate: { type: String, required: true },
  owner: { type: String, required: true },
  email: { type: String, required: true },
  car_company: { type: String, required: true },
  timeIn: Date,
  timeOut: Date,
  amount: { type: Number, required: true },
  start: { type: String, required: true },
  end: { type: String, required: true },
  isPaid: Boolean,
  createdAt: { type: Date, default: Date.now },
});

const month_ticket = mongoose.model("month_ticket", ParkingSchema);

module.exports = month_ticket;
