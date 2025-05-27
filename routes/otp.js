const express = require("express");
const nodemailer = require("nodemailer");
const OTP = require("../models/otp");
const user_otp = require("../models/user_otp");
const router = express.Router();

// Cấu hình gửi email với Nodemailer
const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.EMAIL_USER, // Lấy từ file .env
    pass: process.env.EMAIL_PASS, // Lấy từ file .env
  },
});

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// API gửi OTP
router.post("/send-otp", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email là bắt buộc" });
  }

  try {
    // Tạo mã OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // Hết hạn sau 5 phút

    // Lưu OTP vào MongoDB
    await OTP.findOneAndUpdate(
      { email },
      { email, otp, expiresAt },
      { upsert: true, new: true }
    );

    // Gửi email chứa OTP
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Mã OTP Xác Nhận",
      text: `Mã OTP của bạn là: ${otp}. Mã này có hiệu lực trong 5 phút.`,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: "OTP đã được gửi đến email của bạn" });
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({ error: "Không thể gửi OTP, vui lòng thử lại" });
  }
});

// API xác minh OTP
router.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: "Email và OTP là bắt buộc" });
  }

  try {
    // Tìm OTP trong MongoDB
    const otpDoc = await OTP.findOne({
      email,
      otp,
      expiresAt: { $gt: new Date() },
    });

    if (!otpDoc) {
      return res
        .status(400)
        .json({ error: "OTP không hợp lệ hoặc đã hết hạn" });
    }

    // Xóa OTP sau khi xác minh thành công
    await OTP.deleteOne({ _id: otpDoc._id });

    // Cập nhật trạng thái xác minh trong collection `users` (nếu cần)
    const user_otp = require("../models/user_otp"); // Đảm bảo bạn đã có model User
    await user_otp.updateOne({ email }, { isVerified: true }, { upsert: true });

    res.status(200).json({ message: "Xác minh OTP thành công" });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ error: "Không thể xác minh OTP, vui lòng thử lại" });
  }
});

module.exports = router;
