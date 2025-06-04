const express = require("express");
const axios = require("axios");
const Parking = require("../models/Parking");
const verifyToken = require("../middlewares/verifyToken");
const sharp = require("sharp");

const router = express.Router();

const pricePerHour = 10000; // Giá theo giờ
const pricePerMonth = 100000; // Giá theo tháng

// Thông tin tài khoản (Khai báo trên cùng)
const accountNo = "9367521391";
const accountName = "CONG TY GUI XE ABC";
const bankId = "970436";

router.post("/get-qr",verifyToken, async (req, res) => {
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

router.post("/get-qr2", async (req, res) => {
  try {
    const { carPlate, hours } = req.body;

    if (!carPlate || !hours || isNaN(hours) || hours < 1) {
      return res
        .status(400)
        .json({ error: "Thiếu dữ liệu đầu vào hoặc dữ liệu không hợp lệ" });
    }

    const totalAmount = hours * pricePerHour;
    const content = `Giu xe ${carPlate} ${hours} gio`;

    // Gọi VietQR API
    const response = await axios.post("https://api.vietqr.io/v2/generate", {
      accountNo,
      accountName,
      acqId: bankId,
      amount: totalAmount,
      addInfo: content,
      template: "qr_only",
    });

    const { data: apiResponse } = response;
    const { qrDataURL: qrImageBase64 } = apiResponse.data;

    if (!qrImageBase64) {
      return res
        .status(500)
        .json({ error: "Không thể tạo mã QR từ VietQR API" });
    }

    // Bỏ prefix data:image/png;base64,...
    const base64Data = qrImageBase64.replace(/^data:image\/png;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    // Resize ảnh về 128x128 và chuyển thành grayscale raw
    const resizedBuffer = await sharp(imageBuffer)
      .resize(150, 150)
      .greyscale() // hoặc .toColourspace("b-w") nếu bạn dùng RGB565 thì dùng .raw() không cần greyscale
      .raw()
      .toBuffer();

    // Gửi về dạng Base64 hoặc Uint8Array để ESP32 nhận (tùy client bạn cần gì)
    const rawImageBase64 = resizedBuffer.toString("base64");

    // Response về
    res.status(200).json(rawImageBase64);
  } catch (error) {
    console.error("Lỗi khi tạo mã QR:", error.response?.data || error.message);
    res.status(500).json({ error: "Lỗi server khi tạo mã QR" });
  }
});
module.exports = router;
