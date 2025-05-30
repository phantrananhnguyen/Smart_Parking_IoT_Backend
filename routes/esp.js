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
// Thêm hàm nhận diện có retry
async function recognizeWithRetry(imagePath, maxRetries = 5) {
  let retries = 0;
  while (retries < maxRetries) {
    const form = new FormData();
    form.append("image", fs.createReadStream(imagePath));

    try {
      const response = await axios.post(
        "http://localhost:5001/recognize",
        form,
        {
          headers: form.getHeaders(),
          timeout: 10000,
        }
      );

      const plateNumber = response.data.plate || "";

      console.log(`Lần thử ${retries + 1}: Nhận được biển:`, plateNumber);

      if (plateNumber.trim() !== "") {
        return plateNumber.toUpperCase().replace(/[-.\s]/g, "");
      } else {
        console.log("Biển không hợp lệ (rỗng), thử lại...");
      }
    } catch (err) {
      console.log("Lỗi gọi API nhận diện:", err.message);
    }

    retries++;
    await new Promise((res) => setTimeout(res, 500)); // delay 500ms
  }
  return null; // Không nhận được biển hợp lệ sau maxRetries
}

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

          try {
            const imagePath = await new Promise((resolve, reject) => {
              NodeWebcam.capture("plate", opts, (err, path) =>
                err ? reject(err) : resolve(path)
              );
            });

            // Gọi hàm nhận diện với retry
            const normalizedPlate = await recognizeWithRetry(imagePath, 5);

            if (!normalizedPlate) {
              console.log(
                "Không nhận diện được biển hợp lệ sau nhiều lần thử."
              );
              ws.send(
                JSON.stringify({
                  event: "error",
                  message: "Không nhận diện được biển số hợp lệ",
                })
              );
              return;
            }

            console.log("Biển số nhận diện:", normalizedPlate);

            // Phần xử lý database như cũ
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
          } catch (error) {
            console.error("Lỗi xử lý nhận diện:", error);
            ws.send(
              JSON.stringify({
                event: "error",
                message: "Lỗi server khi nhận diện biển số",
              })
            );
          }
        }
        if (data.event === "detection_out") {
          console.log("[WS] ESP yêu cầu nhận diện xe ra");

          try {
            // Chụp ảnh biển số
            const imagePath = await new Promise((resolve, reject) => {
              NodeWebcam.capture("plate_out", opts, (err, path) =>
                err ? reject(err) : resolve(path)
              );
            });

            // Gọi hàm nhận diện với retry
            const normalizedPlate = await recognizeWithRetry(imagePath, 5);

            if (!normalizedPlate) {
              console.log(
                "Không nhận diện được biển hợp lệ sau nhiều lần thử."
              );
              ws.send(
                JSON.stringify({
                  event: "error",
                  message: "Không nhận diện được biển số hợp lệ",
                })
              );
              return;
            }

            console.log("Biển số nhận diện (ra):", normalizedPlate);

            // Kiểm tra nếu là xe tháng
            const isMonthVehicle = await monthTicket.findOne({
              licensePlate: normalizedPlate,
            });

            if (isMonthVehicle) {
              lastCommand = "rotate";
              console.log("Xe tháng. Cho xe ra.");
            } else {
              // Tìm bản ghi check-in chưa check-out
              const existing = await Parking.findOne({
                licensePlate: normalizedPlate,
                checkOutTime: null,
              });

              if (existing) {
                const now = new Date();
                const checkInTime = new Date(existing.checkInTime);
                const durationMs = now - checkInTime;
                const durationHours = Math.ceil(durationMs / (1000 * 60 * 60)); // Làm tròn lên

                const feePerHour = 5000; // phí mỗi giờ
                const totalFee = durationHours * feePerHour;

                existing.checkOutTime = now;
                existing.fee = totalFee;
                await existing.save();

                console.log(
                  `Xe ngày. Tính phí: ${totalFee} VND (${durationHours} giờ)`
                );

                // Gửi thông tin về dashboard
                broadcastToDashboard({
                  event: "vehicle_checked_out",
                  plate: normalizedPlate,
                  checkIn: checkInTime,
                  checkOut: now,
                  fee: totalFee,
                });
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
          } catch (error) {
            console.error("Lỗi xử lý xe ra:", error);
            ws.send(
              JSON.stringify({
                event: "error",
                message: "Lỗi server khi xử lý xe ra",
              })
            );
          }
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
          broadcastToDashboard({
            event: "slot_update",
            slot,
            status, // key đồng bộ lowercase
          });
        }
        // Xử lý các sự kiện từ Dashboard
        if (data.event === "get_tickets") {
          const tickets = await Parking.find({ checkOutTime: null });
          broadcastToDashboard({
            event: "tickets_data",
            tickets,
          });
        }

        if (data.event === "get_month_tickets") {
          const tickets = await monthTicket.find({});
          broadcastToDashboard({
            event: "month_tickets_data",
            tickets,
          });
        }

        if (data.event === "get_month_infor") {
          const tickets = await monthTicket.find({});
          broadcastToDashboard({
            event: "month_info_data",
            tickets,
          });
        }

        if (data.event === "payment_confirmed") {
          const { plate } = data;
          const now = new Date();
          const existing = await Parking.findOne({
            licensePlate: plate,
            checkOutTime: null,
          });

          if (existing) {
            const durationMs = now - existing.checkInTime;
            const durationHours = Math.ceil(durationMs / (1000 * 60 * 60));
            const feePerHour = 5000;
            const totalFee = durationHours * feePerHour;

            // Cập nhật thông tin thanh toán trước khi xóa (nếu cần log)
            existing.checkOutTime = now;
            existing.fee = totalFee;
            await existing.save();

            // Xóa bản ghi sau khi thanh toán xong
            await Parking.deleteOne({ _id: existing._id });

            console.log(`Xóa xe ${plate} khỏi DB sau khi thanh toán.`);
            // Gửi lệnh rotate cho ESP
            lastCommand = "rotate";
            ws.send(
              JSON.stringify({ event: "command_response", command: "rotate" })
            );
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
    console.log("[WS] Gửi đến dashboard:", json);
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
