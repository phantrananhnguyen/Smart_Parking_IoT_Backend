const express = require("express");
const router = express.Router();
const otpModel = require("../models/otp");
const User = require("../models/User");
const monthTicket = require("../models/month_ticket");
const dayjs = require("dayjs");
const nodemailer = require("nodemailer");

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

router.post("/month_ticket", async (req, res) => {
  try {
    const { email, monthTicket } = req.body;
    if (!email || !monthTicket) {
      return res
        .status(400)
        .json({ error: "Email và thông tin vé tháng là bắt buộc" });
    }
    console.log(email, monthTicket);
    const { carPlate, carBrand, ownerName, timeIn, MonthAmount } = monthTicket;
    const missingFields = [];
    if (!carPlate) missingFields.push("carPlate");
    if (!carBrand) missingFields.push("carBrand");
    if (!ownerName) missingFields.push("ownerName");
    if (!MonthAmount) missingFields.push("MonthAmount");

    if (missingFields.length > 0) {
      return res
        .status(400)
        .json({ error: `Thiếu thông tin: ${missingFields.join(", ")}` });
    }

    const cleanedCarPlate = carPlate.replace(/[^a-zA-Z0-9]/g, "");
    const now = dayjs();
    const expiredAt = now.add(MonthAmount, "month").toISOString();

    const otp = generateOTP();
    const expire = new Date(Date.now() + 5 * 60 * 1000);

    const newTicket = new otpModel({
      email,
      otp, // nên hash nếu cần bảo mật cao hơn
      expiresAt: expire,
      licensePlate: cleanedCarPlate,
      car_company: carBrand,
      owner: ownerName,
      timein: timeIn,
      outdateat: expiredAt,
    });

    await newTicket.save();

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Mã OTP Xác Nhận",
      text: `Mã OTP của bạn là: ${otp}. Mã này có hiệu lực trong 5 phút.`,
    };

    await transporter.sendMail(mailOptions);

    res.status(201).json({
      message: "Đã thêm xe tháng và gửi OTP thành công",
    });
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({ error: "Không thể gửi OTP, vui lòng thử lại" });
  }
});

router.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  try {
    const otpDoc = await otpModel.findOne({
      email,
      otp,
      expiresAt: { $gt: new Date() },
    });

    if (!otpDoc) {
      return res
        .status(400)
        .json({ error: "OTP không hợp lệ hoặc đã hết hạn" });
    }

    const newTicket = new monthTicket({
      licensePlate: otpDoc.licensePlate,
      car_company: otpDoc.car_company,
      email: otpDoc.email,
      owner: otpDoc.owner,
      timein: otpDoc.timein,
      outdateat: otpDoc.outdateat,
    });

    await newTicket.save();
    await otpModel.deleteOne({ _id: otpDoc._id }); // xóa đúng bản ghi

    res.status(200).json({ message: "Xác minh OTP thành công" });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ error: "Không thể xác minh OTP, vui lòng thử lại" });
  }
});

module.exports = router;
