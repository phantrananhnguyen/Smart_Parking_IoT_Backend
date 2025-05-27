const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  otp: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
  licensePlate: { type: String, required: true },
  owner: { type: String, required: true },
  car_company: { type: String, required: true },
  timein: { type: Date },
  outdateat: { type: Date },
});

// Tạo TTL index để tự động xóa OTP hết hạn
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("OTP", otpSchema);
