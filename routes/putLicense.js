const express = require("express");
const router = express.Router();
const MonthTicket = require("../models/month_ticket");

router.post("/month_ticket", async (req, res) => {
  try {
    const { licensePlate, owner, car_company } = req.body;

    const newTicket = new MonthTicket({ licensePlate, owner, car_company });
    await newTicket.save();

    res.status(201).json({ message: "Đã thêm xe tháng", data: newTicket });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Thêm thất bại", message: err.message });
  }
});

module.exports = router;
