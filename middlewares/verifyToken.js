const jwt = require("jsonwebtoken");

module.exports = function (req, res, next) {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).json({ message: "No token provided" });
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(400).json({ message: "Token format is Bearer <token>" });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // chứa thông tin người dùng đã mã hóa trong token
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
