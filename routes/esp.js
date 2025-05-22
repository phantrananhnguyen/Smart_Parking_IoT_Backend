const express = require("express");
const router = express.Router();
const { exec } = require("child_process");
const NodeWebcam = require("node-webcam");

let lastCommand = "none";

// Route: ESP32 gửi tín hiệu khi phát hiện vật
router.post("/detect", (req, res) => {
  console.log("ESP32 báo có vật cản - bắt đầu chụp và nhận diện");

  // Trả lời ngay để tránh ESP32 timeout
  res.send("Đã nhận lệnh, đang xử lý ảnh");

  const opts = {
    width: 1280,
    height: 720,
    quality: 100,
    output: "jpeg",
    callbackReturn: "location",
    verbose: false,
  };

  NodeWebcam.capture("plate", opts, function (err, data) {
    if (err) {
      return console.error("Lỗi khi chụp ảnh:", err);
    }

    console.log("Ảnh đã chụp, đang gọi Python model...");

    exec("python recognize_plate.py plate.jpg", (error, stdout, stderr) => {
      if (error) {
        return console.error("Lỗi khi chạy model Python:", stderr);
      }

      // Lấy dòng cuối cùng trong stdout
      const lines = stdout.trim().split("\n");
      const plateNumber = lines[lines.length - 1].trim();

      console.log("Biển số nhận diện:", plateNumber);

      const normalizedPlate = plateNumber.replace(/[-.\s]/g, "").toUpperCase();
      if (normalizedPlate === "51F97022") {
        lastCommand = "rotate";
        console.log("Lệnh rotate đã được đặt.");
      } else {
        lastCommand = "none";
        console.log("Không khớp biển số, không đặt lệnh.");
      }
    });
  });
});

// Route: ESP32 truy vấn lệnh
router.get("/command", (req, res) => {
  console.log("ESP32 truy vấn lệnh:", lastCommand);
  res.send({ command: lastCommand });
  lastCommand = "none";
});

module.exports = router;
