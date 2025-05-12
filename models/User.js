const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  Name: { type: String, required: false },
  email: { type: String, required: true },
  password: { type: String, required: true },
  JoinTime: { type: Date, default: Date.now },
});

const User = mongoose.model("User", UserSchema);

module.exports = User;
