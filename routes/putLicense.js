const express = require("express");
const Parking = require("../models/Parking");

const router = express.Router();

router.post("/checkin", async (req, res) => {
  try {
    const { licensePlate } = req.body;
    if (!licensePlate) {
      return res.status(400).json({ error: "Cần nhập biển số xe" });
    }

    // Kiểm tra xem biển số xe đã có trong database chưa, và chưa có checkoutTime
    const existingCar = await Parking.findOne({
      licensePlate,
      checkoutTime: { $exists: false },
    });

    if (existingCar) {
      return res
        .status(400)
        .json({ error: "Xe này đã vào bãi và chưa rời đi" });
    }

    // Nếu xe chưa có trong bãi hoặc đã checkout, cho phép check-in
    const newParking = new Parking({
      licensePlate,
      checkinTime: new Date(),
    });

    await newParking.save();
    res.status(201).json({
      message: "Xe vào bãi thành công",
      data: newParking,
    });
  } catch (error) {
    console.error("Lỗi khi lưu dữ liệu:", error);
    res.status(500).json({ error: "Lỗi khi lưu dữ liệu" });
  }
});

router.get("/get-all", async (req, res) => {
  try {
    const allParkingData = await Parking.find(); // Lấy tất cả dữ liệu từ collection
    res.json(allParkingData);
  } catch (error) {
    res.status(500).json({ error: "Lỗi khi lấy dữ liệu" });
  }
});

module.exports = router;
