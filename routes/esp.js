const WebSocket = require("ws");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
const NodeWebcam = require("node-webcam");

const monthTicket = require("../models/month_ticket");
const Parking = require("../models/Parking");
const ParkingSlot = require("../models/ParkingSlot");

const opts = {
  width: 1280,
  height: 720,
  quality: 100,
  output: "jpeg",
  callbackReturn: "location",
  verbose: false,
};

let lastCommand = "none";

async function recognizeWithRetry(imagePath, maxRetries = 5) {
  let retries = 0;
  while (retries < maxRetries) {
    const form = new FormData();
    form.append("image", fs.createReadStream(imagePath));
    try {
      const response = await axios.post(
        "http://localhost:5001/recognize",
        form,
        { headers: form.getHeaders(), timeout: 10000 }
      );
      const plateNumber = response.data.plate || "";
      console.log(`Lần thử ${retries + 1}: Nhận được biển:`, plateNumber);
      if (plateNumber.trim() !== "") {
        return plateNumber.toUpperCase().replace(/[-.\s]/g, "");
      }
    } catch (err) {
      console.log("Lỗi gọi API nhận diện:", err.message);
    }
    retries++;
    await new Promise((res) => setTimeout(res, 500)); // Delay giữa các lần thử
  }
  return null;
}

function setupEspWebSocket(server) {
  const wss = new WebSocket.Server({ server });
  const dashboardClients = new Set();
  const espClients = new Set(); // Quản lý kết nối ESP

  wss.on("connection", (ws) => {
    console.log("[WS] Một client mới kết nối");

    ws.on("message", async (message) => {
      try {
        const data = JSON.parse(message);

        if (data.event === "register") {
          if (data.type === "dashboard") {
            dashboardClients.add(ws);
            console.log("[WS] Dashboard client registered");
            ws.on("close", () => dashboardClients.delete(ws));
          } else if (data.type === "esp") {
            espClients.add(ws);
            console.log("[WS] ESP client registered");
            ws.on("close", () => espClients.delete(ws));
          }
          return;
        }

        if (data.event === "detection") {
          console.log("[WS] ESP yêu cầu nhận diện biển số");
          const imagePath = await new Promise((res, rej) => {
            NodeWebcam.capture("plate", opts, (err, path) =>
              err ? rej(err) : res(path)
            );
          });
          const normalizedPlate = await recognizeWithRetry(imagePath, 1);
          if (!normalizedPlate) {
            console.log("Không nhận diện được biển hợp lệ sau nhiều lần thử.");
            ws.send(
              JSON.stringify({
                event: "error",
                message: "Không nhận diện được biển số hợp lệ",
              })
            );
            return;
          }

          console.log("Biển số nhận diện:", normalizedPlate);
          const isMonthVehicle = await monthTicket.findOne({
            licensePlate: normalizedPlate,
          });
          if (isMonthVehicle) {
            lastCommand = "rotate";
            console.log("Xe tháng. Gửi lệnh rotate.");
          } else {
            const existing = await Parking.findOne({
              licensePlate: normalizedPlate,
              checkOutTime: null,
            });
            if (!existing) {
              await new Parking({ licensePlate: normalizedPlate }).save();
              console.log("Xe ngày. Đã thêm mới vào DB.");

              // Gửi lệnh rotate ngay cho ESP
              ws.send(
                JSON.stringify({
                  event: "command_response",
                  command: "rotate",
                  target: "in",
                })
              );

              console.log(
                "[WS] Đã gửi lệnh 'rotate' đến ESP ngay sau thêm xe ngày"
              );
            } else {
              console.log("Xe ngày đã có bản ghi chưa check-out.");
              // Nếu muốn, cũng có thể gửi lệnh rotate cho ESP
              ws.send(
                JSON.stringify({ event: "command_response", command: "rotate" })
              );
              console.log(
                "[WS] Đã gửi lệnh 'rotate' đến ESP cho xe đã có bản ghi"
              );
            }

            // Đặt lại lastCommand = "none" vì đã gửi lệnh trực tiếp
            lastCommand = "none";
          }

          broadcastToDashboard({
            event: "plate_detected",
            plate: normalizedPlate,
          });
          sendToESP({ event: "command_response", command: lastCommand });
          lastCommand = "none";
        }

        if (data.event === "detection_out") {
          console.log("[WS] ESP yêu cầu nhận diện xe ra");
          const imagePath = await new Promise((res, rej) => {
            NodeWebcam.capture("plate_out", opts, (err, path) =>
              err ? rej(err) : res(path)
            );
          });
          const normalizedPlate = await recognizeWithRetry(imagePath, 5);
          if (!normalizedPlate) {
            console.log("Không nhận diện được biển hợp lệ sau nhiều lần thử.");
            ws.send(
              JSON.stringify({
                event: "error",
                message: "Không nhận diện được biển số hợp lệ",
              })
            );
            return;
          }

          console.log("Biển số nhận diện (ra):", normalizedPlate);
          const isMonthVehicle = await monthTicket.findOne({
            licensePlate: normalizedPlate,
          });
          if (isMonthVehicle) {
            lastCommand = "rotate";
            console.log("Xe tháng. Gửi lệnh rotate.");
          } else {
            const existing = await Parking.findOne({
              licensePlate: normalizedPlate,
              checkOutTime: null,
            });
            if (existing) {
              const now = new Date();
              const durationHours = Math.ceil(
                (now - existing.checkInTime) / (1000 * 60 * 60)
              );
              const fee = durationHours * 5000;
              existing.checkOutTime = now;
              existing.fee = fee;
              await existing.save();
              console.log(
                `Xe ngày. Tính phí: ${fee} VND (${durationHours} giờ).`
              );
              broadcastToDashboard({
                event: "vehicle_checked_out",
                plate: normalizedPlate,
                checkIn: existing.checkInTime,
                checkOut: now,
                fee: fee,
              });
              lastCommand = "rotate";
            } else {
              console.log("Không tìm thấy bản ghi xe ngày phù hợp.");
              ws.send(
                JSON.stringify({
                  event: "error",
                  message: "Không tìm thấy xe trong cơ sở dữ liệu",
                })
              );
              return;
            }
          }
          sendToESP({ event: "command_response", command: lastCommand });
          lastCommand = "none";
        }

        if (data.event === "command_request") {
          console.log("[WS] ESP yêu cầu lệnh hiện tại:", lastCommand);
          ws.send(
            JSON.stringify({ event: "command_response", command: lastCommand })
          );
          lastCommand = "none";
        }

        if (data.event === "slot_status") {
          const { slot, in_use } = data;
          const status = in_use ? "inUse" : "Free";
          await ParkingSlot.findOneAndUpdate(
            { slotId: slot },
            { status, updatedAt: new Date() },
            { upsert: true, new: true }
          );
          broadcastToDashboard({ event: "slot_update", slot, status });
        }

        if (data.event === "block_slot") {
          const { slot, status } = data;
          await ParkingSlot.findOneAndUpdate(
            { slotId: slot },
            { status, updatedAt: new Date() },
            { upsert: true, new: true }
          );
        }

        if (data.event === "get_tickets") {
          const tickets = await Parking.find({ checkOutTime: null });
          broadcastToDashboard({ event: "tickets_data", tickets });
        }

        if (
          data.event === "get_month_tickets" ||
          data.event === "get_month_infor"
        ) {
          const tickets = await monthTicket.find({});
          broadcastToDashboard({ event: "month_tickets_data", tickets });
        }

        if (data.event === "payment_confirmed") {
          const { plate } = data;
          const now = new Date();
          const existing = await Parking.findOne({
            licensePlate: plate,
            checkOutTime: null,
          });
          if (existing) {
            const durationHours = Math.ceil(
              (now - existing.checkInTime) / (1000 * 60 * 60)
            );
            const fee = durationHours * 5000;
            existing.checkOutTime = now;
            existing.fee = fee;
            await existing.save();
            await Parking.deleteOne({ _id: existing._id });
            console.log(`Xóa xe ${plate} khỏi DB sau khi thanh toán.`);
            lastCommand = "rotate";
            sendToESP({ event: "command_response", command: "rotate" });
          } else {
            broadcastToDashboard({
              event: "error",
              message: `Không tìm thấy xe ${plate} trong hệ thống.`,
            });
          }
        }
      } catch (err) {
        console.error("Lỗi khi xử lý WebSocket:", err.message);
      }
    });
  });

  function broadcastToDashboard(message) {
    const json = JSON.stringify(message);
    dashboardClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    });
  }

  function sendToESP(message) {
    const json = JSON.stringify(message);
    espClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    });
  }
}

module.exports = setupEspWebSocket;
