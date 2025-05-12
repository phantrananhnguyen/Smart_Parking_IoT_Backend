const express = require("express");
const axios = require("axios");
const Parking = require("../models/Parking"); // Import model Parking

const router = express.Router();
const pricePerHour = 10000; // Giá giữ xe theo giờ (VNĐ)

router.post("/checkout", async (req, res) => {
  try {
    const { license_num } = req.body;
    if (!license_num) {
      return res.status(400).json({ error: "Vui lòng nhập biển số xe" });
    }

    // Tìm xe theo biển số
    const vehicle = await Parking.findOne({ licensePlate: license_num });
    if (!vehicle) {
      return res
        .status(404)
        .json({ error: "Không tìm thấy xe trong hệ thống" });
    }

    if (vehicle.checkoutTime) {
      return res.status(400).json({ error: "Xe đã được checkout trước đó" });
    }

    // Lấy thời gian check-in
    const checkInTime = new Date(vehicle.checkInTime);
    const currentTime = new Date();
    const durationHours = Math.ceil(
      (currentTime - checkInTime) / (1000 * 60 * 60)
    ); // Tính số giờ

    if (durationHours <= 0) {
      return res.status(400).json({ error: "Thời gian không hợp lệ" });
    }

    const totalAmount = durationHours * pricePerHour;

    // Thông tin thanh toán
    const accountNo = "9367521391"; // Số tài khoản
    const accountName = "CONG TY GUI XE ABC"; // Tên chủ tài khoản (tùy chỉnh)
    const bankId = "970436"; // Mã ngân hàng theo chuẩn VietQR (ví dụ: VietinBank)

    const content = `Giu xe ${license_num} ${durationHours} gio`;

    // Gọi API VietQR để tạo mã QR
    const response = await axios.post("https://api.vietqr.io/v2/generate", {
      accountNo: accountNo,
      accountName: accountName,
      acqId: bankId,
      amount: totalAmount,
      addInfo: content,
      template: "compact",
    });

    const { data } = response;
    if (!data || !data.data || !data.data.qrDataURL) {
      return res
        .status(500)
        .json({ error: "Không thể tạo mã QR từ VietQR API" });
    }

    const qrImage = data.data.qrDataURL;
    const qrData = data.data.qrData;

    // Cập nhật checkoutTime
    vehicle.checkoutTime = currentTime;
    await vehicle.save();

    res.json({
      license_num,
      checkInTime,
      durationHours,
      totalAmount,
      qrData,
      qrImage,
    });
  } catch (error) {
    console.error("Lỗi khi tạo mã QR:", error);
    res.status(500).json({ error: "Lỗi khi tạo mã QR" });
  }
});

module.exports = router;
