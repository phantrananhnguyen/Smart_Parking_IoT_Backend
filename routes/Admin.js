const express = require("express");
const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin"); // đường dẫn đúng
const router = express.Router();
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

// Tạo tài khoản admin
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Thiếu email hoặc mật khẩu." });

  try {
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin)
      return res.status(400).json({ message: "Email đã tồn tại." });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = new Admin({
      name,
      email,
      password: hashedPassword,
    });

    await newAdmin.save();
    res.status(201).json({ message: "Tạo tài khoản admin thành công." });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server khi tạo admin." });
  }
});

router.post("/SignIn", async (req, res) => {
  const { name, password } = req.body;
  console.log(name + password);
  if (!name || !password) {
    return res.status(400).json({ message: "Thiếu username hoặc mật khẩu." });
  }

  try {
    const admin = await Admin.findOne({ name });
    if (!admin) {
      return res.status(400).json({ message: "Admin không tồn tại." });
    }
    const isMatch = await bcrypt.compare(password, admin.password); // Sửa ở đây
    if (!isMatch) {
      return res.status(400).json({ message: "Sai mật khẩu." });
    }
    const token = jwt.sign({ userId: admin._id }, JWT_SECRET, {
      expiresIn: "1h",
    });
    res.json({
      message: "Đăng nhập thành công.",
      token,
      user: {
        name: admin.name,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server." });
  }
});
module.exports = router;
