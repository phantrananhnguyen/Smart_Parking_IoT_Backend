const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const connectDB = require("./config/db");
require("dotenv").config();
const http = require("http");

const mongoose = require("mongoose");

// Import routes
const qrRoutes = require("./routes/qr");
const License_plate = require("./routes/putLicense");
const Admin = require("./routes/Admin");
const Authen = require("./routes/Authen");
const Client = require("./routes/handleClient");

const app = express(); // <-- Khởi tạo app TRƯỚC khi sử dụng
const server = http.createServer(app);

// Connect to DB
connectDB();

// Middlewares
app.use(morgan("dev")); // <-- Gọi sau khi có app
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use("/api/qr", qrRoutes);
app.use("/api/put", License_plate);
app.use("/api/admin", Admin);
app.use("/api/user", Authen);
app.use("/api/otp", Client);

// Default error handlers (tuỳ chọn)
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Server error" });
});
const setupEspWebSocket = require("./routes/esp");
setupEspWebSocket(server);

server.listen(3000, () => {
  console.log("Server đang chạy tại http://localhost:3000");
});
