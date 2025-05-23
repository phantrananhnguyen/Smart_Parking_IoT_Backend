const express = require("express");
const router = express.Router();
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
const NodeWebcam = require("node-webcam");

const monthTicket = require("../models/month_ticket"); // Đường dẫn đúng với model
const Parking = require("../models/Parking");

let lastCommand = "none";

const opts = {
  width: 1280,
  height: 720,
  quality: 100,
  output: "jpeg",
  callbackReturn: "location",
  verbose: false,
};

// Route: ESP32 gửi tín hiệu khi phát hiện vật
router.post("/detect", async (req, res) => {
  console.log("ESP32 báo có vật cản - bắt đầu chụp và nhận diện");

  try {
    const imagePath = await new Promise((resolve, reject) => {
      NodeWebcam.capture("plate", opts, (err, path) =>
        err ? reject(err) : resolve(path)
      );
    });

    console.log("Ảnh đã chụp:", imagePath);
    console.log("Đang gửi đến model Flask...");

    const form = new FormData();
    form.append("image", fs.createReadStream(imagePath));

    const response = await axios.post("http://localhost:5001/recognize", form, {
      headers: form.getHeaders(),
      timeout: 10000,
    });

    const plateNumber = response.data.plate;

    // Kiểm tra plate có tồn tại
    if (!plateNumber || plateNumber.trim() === "") {
      console.error("Không nhận diện được biển số hợp lệ.");
      return res.status(400).send("Không nhận diện được biển số.");
    }

    const normalizedPlate = plateNumber.replace(/[-.\s]/g, "").toUpperCase();
    console.log("Biển số nhận diện:", normalizedPlate);

    const isMonthVehicle = await monthTicket.findOne({
      licensePlate: normalizedPlate,
    });

    if (isMonthVehicle) {
      lastCommand = "rotate";
      console.log("Xe tháng. Đặt lệnh: rotate");
    } else {
      const existing = await Parking.findOne({
        licensePlate: normalizedPlate,
        checkOutTime: null,
      });

      if (!existing) {
        const newEntry = new Parking({ licensePlate: normalizedPlate });
        await newEntry.save();
        console.log("Xe ngày. Đã thêm mới vào DB.");
      } else {
        console.log("Xe ngày. Đã có bản ghi chưa check-out.");
      }

      lastCommand = "rotate";
    }

    res.send("Xử lý xong. Đã cập nhật lệnh.");
  } catch (error) {
    console.error("Lỗi xử lý /detect:", error.message);
    res.status(500).send("Lỗi khi xử lý ảnh hoặc truy vấn DB");
  }
});

// Route: ESP32 truy vấn lệnh
router.get("/command", (req, res) => {
  console.log("ESP32 truy vấn lệnh:", lastCommand);
  res.send({ command: lastCommand });
  lastCommand = "none";
});

module.exports = router;
