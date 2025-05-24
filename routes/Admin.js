const express = require("express");
const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");
const Parking = require("../models/Parking");
const month_Parking = require("../models/month_ticket");
const ParkingSlot = require("../models/ParkingSlot");

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
router.get("/tickets/day", async (req, res) => {
  try {
    // Lấy đầu và cuối ngày hôm nay
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const tickets = await Parking.find();

    // Định dạng lại cho frontend (nếu cần)
    const formatted = tickets.map((t) => ({
      plate: t.licensePlate,
      timeIn: t.checkInTime,
      timeOut: t.checkOutTime,
      paymentStatus: t.checkOutTime ? "Chưa thanh toán" : "-", // Hoặc sửa theo logic riêng
    }));

    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi lấy danh sách vé." });
  }
});
router.get("/tickets/month", async (req, res) => {
  try {
    // Lấy đầu và cuối ngày hôm nay
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const tickets = await month_Parking.find();

    // Định dạng lại cho frontend (nếu cần)
    const formatted = tickets.map((t) => ({
      plate: t.licensePlate,
      owner: t.owner,
      company: t.car_company,
      timeIn: t.timein,
      outdateat: t.outdateat,
    }));

    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi lấy danh sách vé." });
  }
});

// GET /api/parking-status
router.get("/parking-status", async (req, res) => {
  try {
    const slots = await ParkingSlot.find({});

    const status = slots.map((slot) => ({
      slotId: slot.slotId,
      status: slot.status,
    }));

    res.json(status);
  } catch (error) {
    console.error("Lỗi khi lấy trạng thái bãi đỗ:", error);
    res.status(500).json({ error: "Lỗi máy chủ" });
  }
});

module.exports = router;
