const express = require("express");
const router = express.Router();
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET;

// --- ĐĂNG KÝ ---
router.post("/SignUp", async (req, res) => {
  const { Name, email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email và mật khẩu là bắt buộc." });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email đã được sử dụng." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      Name,
      email,
      password: hashedPassword,
    });

    await newUser.save();

    res.status(201).json({ message: "Đăng ký thành công." });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server." });
  }
});

// --- ĐĂNG NHẬP ---
router.post("/SignIn", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Thiếu email hoặc mật khẩu." });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Email không tồn tại." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Sai mật khẩu." });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
      expiresIn: "1h",
    });

    res.json({
      message: "Đăng nhập thành công.",
      token,
      user: {
        id: user._id,
        name: user.Name,
        email: user.email,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server." });
  }
});
router.post("/updateName", async (req, res) => {
  const { Name, email } = req.body;

  if (!email || !Name) {
    return res.status(400).json({ message: "Thiếu tên hoặc email." });
  }

  try {
    const updatedUser = await User.findOneAndUpdate(
      { email },
      { $set: { Name: Name } },
      { new: true } // trả về dữ liệu đã cập nhật
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "Không tìm thấy người dùng." });
    }
    res.json({
      message: "Cập nhật tên thành công.",
      user: updatedUser,
    });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server." });
  }
});

module.exports = router;
