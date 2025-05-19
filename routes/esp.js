const express = require("express");
const router = express.Router();
const NodeWebcam = require("node-webcam");
const Tesseract = require("tesseract.js");

let lastCommand = "none";

// Route: ESP32 gửi tín hiệu khi phát hiện vật
router.post("/detect", async (req, res) => {
  console.log("ESP32 báo có vật cản");

  // Chụp ảnh biển số
  NodeWebcam.capture(
    "plate",
    { width: 1280, height: 720 },
    async function (err, data) {
      if (err) {
        console.error("Lỗi khi chụp ảnh:", err);
        return res.status(500).send("Lỗi khi chụp ảnh");
      }

      console.log("Đang xử lý ảnh...");

      // OCR để đọc biển số
      const result = await Tesseract.recognize("plate.png", "eng");
      const text = result.data.text.trim();
      console.log("Biển số đọc được:", text);

      // Xử lý logic (ví dụ biển số hợp lệ)
      if (text.includes("ABC123")) {
        lastCommand = "rotate";
      } else {
        lastCommand = "none";
      }

      res.send("Xử lý xong");
    }
  );
});

// Route: ESP32 truy vấn lệnh cần thực hiện
router.get("/command", (req, res) => {
  res.send({ command: lastCommand });
  lastCommand = "none"; // reset sau khi gửi
});

module.exports = router;
