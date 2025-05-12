const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
require("dotenv").config();
const mongoose = require("mongoose");
const qrRoutes = require("./routes/qr"); // Import router đúng cách
const License_plate = require("./routes/putLicense");
const Admin = require("./routes/Admin");
const Authen = require("./routes/Authen");
const app = express();
connectDB();
app.use(express.json());
app.use(cors());

app.use("/api/qr", qrRoutes); // Đặt route đúng cách
app.use("/api/put", License_plate);
app.use("/api/admin", Admin);
app.use("/api/user", Authen);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
