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
    const { licensePlate, car_company, owner, email, amount, start, end } =
      req.body;

    console.log(req.body);
    if (!email) {
      return res
        .status(400)
        .json({ error: "Email và thông tin vé tháng là bắt buộc" });
    }

    const missingFields = [];
    if (!licensePlate) missingFields.push("licensePlate");
    if (!car_company) missingFields.push("car_company");
    if (!owner) missingFields.push("owner");
    if (!amount) missingFields.push("amount");
    if (!start) missingFields.push("start");
    if (!end) missingFields.push("end");

    if (missingFields.length > 0) {
      return res
        .status(400)
        .json({ error: `Thiếu thông tin: ${missingFields.join(", ")}` });
    }

    const cleanedCarPlate = licensePlate.replace(/[^a-zA-Z0-9]/g, "");

    const expiredAt = dayjs().add(amount, "month").toISOString();

    const otp = generateOTP();
    const expire = new Date(Date.now() + 5 * 60 * 1000);

    const newTicket = new otpModel({
      email,
      otp,
      expiresAt: expire,
      licensePlate: cleanedCarPlate,
      car_company,
      owner,
      amount,
      start,
      end,
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
      amount: otpDoc.amount,
      start: otpDoc.start,
      end: otpDoc.end,
    });

    await newTicket.save();
    await otpModel.deleteOne({ _id: otpDoc._id }); // xóa đúng bản ghi

    res.status(200).json({ message: "success" });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ error: "Không thể xác minh OTP, vui lòng thử lại" });
  }
});

router.get("/history", async (req, res) => {
  const { email } = req.query;
  console.log(email);
  try {
    const tickets = await monthTicket.find({ email });
    if (!tickets || tickets.length === 0) {
      return res
        .status(404)
        .json({ message: "No tickets found for this email" });
    }
    console.log(tickets);
    res.status(200).json(tickets);
  } catch (error) {
    console.error("Error retrieving ticket history:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});
module.exports = router;
