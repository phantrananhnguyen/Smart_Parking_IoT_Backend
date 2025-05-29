const express = require("express");
const axios = require("axios");
const Parking = require("../models/Parking");
const router = express.Router();

const pricePerHour = 10000; // Giá theo giờ
const pricePerMonth = 100000; // Giá theo tháng

// Thông tin tài khoản (Khai báo trên cùng)
const accountNo = "9367521391";
const accountName = "CONG TY GUI XE ABC";
const bankId = "970436";

// Route checkout theo giờ
router.post("/checkout", async (req, res) => {
  try {
    const { license_num } = req.body;
    if (!license_num) {
      return res.status(400).json({ error: "Vui lòng nhập biển số xe" });
    }

    const vehicle = await Parking.findOne({ licensePlate: license_num });
    if (!vehicle) {
      return res
        .status(404)
        .json({ error: "Không tìm thấy xe trong hệ thống" });
    }

    if (vehicle.checkoutTime) {
      return res.status(400).json({ error: "Xe đã được checkout trước đó" });
    }

    const checkInTime = new Date(vehicle.checkInTime);
    const currentTime = new Date();
    const durationHours = Math.ceil(
      (currentTime - checkInTime) / (1000 * 60 * 60)
    );

    if (durationHours <= 0) {
      return res.status(400).json({ error: "Thời gian không hợp lệ" });
    }

    const totalAmount = durationHours * pricePerHour;
    const content = `Giu xe ${license_num} ${durationHours} gio`;

    const response = await axios.post("https://api.vietqr.io/v2/generate", {
      accountNo,
      accountName,
      acqId: bankId,
      amount: totalAmount,
      addInfo: content,
      template: "compact",
    });

    const { data } = response;
    if (!data || !data.data?.qrDataURL) {
      return res
        .status(500)
        .json({ error: "Không thể tạo mã QR từ VietQR API" });
    }

    const qrImage = data.data.qrDataURL;
    const qrData = data.data.qrData;

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

// Route QR thanh toán vé tháng
router.post("/get-qr", async (req, res) => {
  try {
    const { carPlate, months, email } = req.body;

    if (!carPlate || !months || !email || isNaN(months) || months < 1) {
      return res
        .status(400)
        .json({ error: "Thiếu dữ liệu đầu vào hoặc dữ liệu không hợp lệ" });
    }

    const totalAmount = months * pricePerMonth;
    const content = `Giu xe ${carPlate} ${months} thang`;

    const response = await axios.post("https://api.vietqr.io/v2/generate", {
      accountNo,
      accountName,
      acqId: bankId,
      amount: totalAmount,
      addInfo: content,
      template: "compact",
    });

    const { data: apiResponse } = response;
    if (!apiResponse?.data?.qrDataURL) {
      return res
        .status(500)
        .json({ error: "Không thể tạo mã QR từ VietQR API" });
    }

    const { qrDataURL: qrImage, qrData } = apiResponse.data;

    res.status(200).json({
      message: "Tạo QR thành công, thông tin đã được lưu",
      data: {
        carPlate,
        months,
        totalAmount,
        qrData,
        qrImage,
        paymentInfo: {
          accountNo,
          accountName,
          content,
        },
      },
    });
  } catch (error) {
    console.error("Lỗi khi tạo mã QR:", error);
    res.status(500).json({ error: "Lỗi server khi tạo mã QR" });
  }
});

module.exports = router;
