const mongoose = require("mongoose");

const ParkingSchema = new mongoose.Schema({
  licensePlate: { type: String, required: true },
  owner: { type: String, required: true },
  car_company: { type: String, required: true },
  outdateat: { type: Date },
});

const month_ticket = mongoose.model("month_ticket", ParkingSchema);

module.exports = month_ticket;
