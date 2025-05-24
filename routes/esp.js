const WebSocket = require("ws");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
const NodeWebcam = require("node-webcam");

const monthTicket = require("../models/month_ticket");
const Parking = require("../models/Parking");
const ParkingSlot = require("../models/ParkingSlot"); // Model lưu trạng thái bãi

const opts = {
  width: 1280,
  height: 720,
  quality: 100,
  output: "jpeg",
  callbackReturn: "location",
  verbose: false,
};

let lastCommand = "none";

function setupEspWebSocket(server) {
  const wss = new WebSocket.Server({ server });
  const dashboardClients = new Set();

  wss.on("connection", (ws) => {
    console.log("[WS] ESP hoặc dashboard đã kết nối");

    ws.on("message", async (message) => {
      try {
        const data = JSON.parse(message);
        if (data.event === "register") {
          if (data.type === "dashboard") {
            dashboardClients.add(ws);
            console.log("[WS] Dashboard client registered");

            ws.on("close", () => {
              dashboardClients.delete(ws);
              console.log("[WS] Dashboard client disconnected");
            });
          }
        }
        // ESP gửi yêu cầu nhận diện
        if (data.event === "detection") {
          console.log("[WS] ESP yêu cầu nhận diện biển số");

          const imagePath = await new Promise((resolve, reject) => {
            NodeWebcam.capture("plate", opts, (err, path) =>
              err ? reject(err) : resolve(path)
            );
          });

          const form = new FormData();
          form.append("image", fs.createReadStream(imagePath));

          const response = await axios.post(
            "http://localhost:5001/recognize",
            form,
            {
              headers: form.getHeaders(),
              timeout: 10000,
            }
          );

          const plateNumber = response.data.plate;

          if (!plateNumber || plateNumber.trim() === "") {
            console.log("Không nhận diện được biển.");
            ws.send(
              JSON.stringify({
                event: "error",
                message: "Không nhận diện được biển số",
              })
            );
            return;
          }

          const normalizedPlate = plateNumber
            .replace(/[-.\s]/g, "")
            .toUpperCase();
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

          // Gửi kết quả về dashboard
          broadcastToDashboard({
            event: "plate_detected",
            plate: normalizedPlate,
          });
        }

        // ESP gửi trạng thái chỗ đỗ
        if (data.event === "slot_status") {
          const { slot, in_use } = data;
          const status = in_use ? "inUse" : "Free";

          // Cập nhật DB
          await ParkingSlot.findOneAndUpdate(
            { slotId: slot },
            { status: status, updatedAt: new Date() },
            { upsert: true, new: true }
          );

          broadcastToDashboard({
            event: "slot_update",
            slot,
            status, // key đồng bộ lowercase
          });
        }

        // ESP yêu cầu lệnh
        if (data.event === "command_request") {
          console.log("[WS] ESP yêu cầu lệnh hiện tại:", lastCommand);
          ws.send(
            JSON.stringify({ event: "command_response", command: lastCommand })
          );
          lastCommand = "none";
        }
        if (data.event === "block_slot") {
          const { slot, status } = data;

          // Cập nhật DB
          await ParkingSlot.findOneAndUpdate(
            { slotId: slot },
            { status: status, updatedAt: new Date() },
            { upsert: true, new: true }
          );
        }
      } catch (err) {
        console.error("Lỗi khi xử lý WebSocket:", err.message);
      }
    });
  });

  function broadcastToDashboard(message) {
    const json = JSON.stringify(message);
    console.log(`[WS] Gửi đến ${dashboardClients.size} dashboard(s):`, json);

    dashboardClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json, (err) => {
          if (err) {
            console.error("[WS] Gửi thất bại:", err.message);
          }
        });
      } else {
        console.warn("[WS] Dashboard client không còn mở kết nối");
      }
    });
  }
}

module.exports = setupEspWebSocket;
