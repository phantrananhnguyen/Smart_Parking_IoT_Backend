function updateCounts() {
  const allSpots = document.querySelectorAll(".parking-spot:not(.locked)");
  const inUseCount = [...allSpots].filter((spot) =>
    spot.classList.contains("occupied")
  ).length;
  const availableCount = [...allSpots].filter((spot) =>
    spot.classList.contains("available")
  ).length;

  document.getElementById("count-in-use").textContent = inUseCount;
  document.getElementById("count-available").textContent = availableCount;
}
async function fetchParkingStatus() {
  try {
    const res = await fetch("/api/admin/parking-status");
    const data = await res.json(); // [{ slotId: "A1", status: "inUse" }, ...]

    data.forEach(({ slotId, status }) => {
      const spot = document.querySelector(
        `.parking-spot[data-spot="${slotId}"]`
      );
      if (!spot) return;

      if (status === "inUse") {
        spot.classList.add("occupied");
        spot.classList.remove("available", "locked");

        if (!spot.querySelector(".car-icon")) {
          const carIcon = document.createElement("div");
          carIcon.className = "car-icon";
          spot.appendChild(carIcon);
        }
      } else if (status === "Free") {
        spot.classList.add("available");
        spot.classList.remove("occupied", "locked");

        const carIcon = spot.querySelector(".car-icon");
        if (carIcon) carIcon.remove();
      } else {
        spot.classList.remove("available", "occupied");
        spot.classList.add("locked");
      }
    });

    updateCounts();
  } catch (error) {
    console.error("Lỗi khi tải trạng thái bãi xe:", error);
  }
}

const socket = new WebSocket("ws://localhost:3000");

socket.onopen = () => {
  console.log("[WS] Connected to server");
  socket.send(
    JSON.stringify({
      event: "register",
      type: "dashboard",
    })
  );
  socket.send(JSON.stringify({ event: "get_tickets" }));
  socket.send(JSON.stringify({ event: "get_month_tickets" }));
  socket.send(JSON.stringify({ event: "get_month_infor" }));
};

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.event === "slot_update") {
    const { slot, status } = data;
    const spot = document.querySelector(`.parking-spot[data-spot="${slot}"]`);
    if (spot) {
      if (status === "inUse") {
        spot.classList.add("occupied");
        spot.classList.remove("available", "locked");

        if (!spot.querySelector(".car-icon")) {
          const carIcon = document.createElement("div");
          carIcon.className = "car-icon";
          spot.appendChild(carIcon);
        }
      } else if (status === "Free") {
        spot.classList.add("available");
        spot.classList.remove("occupied", "locked");

        const carIcon = spot.querySelector(".car-icon");
        if (carIcon) carIcon.remove();
      } else {
        spot.classList.remove("available", "occupied");
        spot.classList.add("locked");
      }
    }
  }

  // === Vé ngày (hiển thị + nút xác nhận) ===
  else if (data.event === "tickets_data") {
    renderTickets(data.tickets);
  }

  // === Vé tháng (ngày ra - ngày vào) ===
  else if (data.event === "month_tickets_data") {
    renderMonthTickets(data.tickets);
  }

  // === Vé tháng + chủ xe, công ty ===
  else if (data.event === "month_info_data") {
    renderMonthInfor(data.tickets);
  }

  // === Báo lỗi ===
  else if (data.event === "error") {
    alert(`Lỗi: ${data.message}`);
  } else if (data.event === "plate_detected") {
    console.log(`Xe vào: Biển số: ${data.plate}`);
    const logContainer = document.getElementById("log-content");
    const logEntry = document.createElement("div");
    logEntry.textContent = `Xe vào: Biển số: ${
      data.plate
    } (${new Date().toLocaleString()})`;
    logContainer.appendChild(logEntry);
  } else if (data.event === "plate_detected_out") {
    console.log(`Xe ra: Biển số: ${data.plate}`);
  } else if (data.event === "vehicle_checked_out") {
    const logContainer = document.getElementById("log-content");
    const logEntry = document.createElement("div");
    logEntry.textContent = `Xe ra: Biển số ${data.plate}, Thời gian: ${new Date(
      data.checkOut
    ).toLocaleString()}, Phí: ${data.fee} VND`;

    logContainer.appendChild(logEntry);
  }
};
function sendMessage(eventName, payload = {}) {
  if (socket.readyState === WebSocket.OPEN) {
    const message = {
      event: eventName,
      ...payload,
    };
    socket.send(JSON.stringify(message));
  } else {
    console.warn("WebSocket is not connected!");
  }
}
document.querySelector(".notification-icon").addEventListener("click", () => {
  alert("Notifications clicked!");
});

document.querySelector(".admin-section").addEventListener("click", () => {
  alert("Admin profile clicked!");
});

document.querySelector(".logout-icon").addEventListener("click", () => {
  if (confirm("Bạn có chắc muốn đăng xuất?")) {
    window.location.href = "login.html";
  }
});

document.querySelectorAll(".parking-spot").forEach((spot) => {
  spot.addEventListener("click", function () {
    const spotName = this.getAttribute("data-spot");
    const isLocked = this.classList.contains("locked");

    if (isLocked) {
      if (confirm(`Ô ${spotName} đang bị khóa. Bạn có muốn mở khóa không?`)) {
        this.classList.remove("locked");

        if (this.querySelector(".car-icon")) {
          this.classList.add("occupied");
        } else {
          this.classList.add("available");
        }
        sendMessage("block_slot", {
          slot: spotName,
          status: "Free",
        });
        //fetchParkingStatus();
        alert(`Đã mở khóa ô ${spotName}`);
      }
    } else {
      const result = confirm(
        `Bạn có muốn khóa ô ${spotName} để bảo trì/thu phí không?`
      );
      if (result) {
        this.classList.remove("occupied", "available");
        this.classList.add("locked");
        sendMessage("block_slot", {
          slot: spotName,
          status: "block",
        });
        alert(`Đã khóa ô ${spotName} - Trạng thái: Bảo trì/Thu phí`);
      }
    }
  });
});

// Chart.js cấu hình doanh thu
const monthlyRevenueData = {
  labels: [...Array(12)].map((_, i) => `Tháng ${i + 1}`),
  datasets: [
    {
      label: "Doanh thu (triệu VND)",
      data: [3.5, 4.2, 2.8, 5.5, 4.8, 6.2, 7.0, 5.8, 7.5, 8.5, 9.2, 9.0],
      backgroundColor: "#FF6B6B",
      borderColor: "#FF4444",
      borderWidth: 1,
      borderRadius: 4,
      borderSkipped: false,
    },
  ],
};

const chartConfig = {
  type: "bar",
  data: monthlyRevenueData,
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => `Doanh thu: ${context.parsed.y} triệu VND`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 10,
        ticks: {
          stepSize: 2,
          callback: (value) => value + "M",
          font: { size: 11 },
          color: "#666",
        },
        grid: {
          color: "#e1e5e9",
          drawBorder: false,
        },
      },
      x: {
        ticks: {
          font: { size: 10 },
          color: "#666",
          maxRotation: 45,
        },
        grid: { display: false },
      },
    },
    layout: { padding: { top: 10, bottom: 5 } },
    animation: {
      duration: 1000,
      easing: "easeOutQuart",
    },
  },
};

const ctx = document.getElementById("revenueChart").getContext("2d");
const revenueChart = new Chart(ctx, chartConfig);

function updateChartData() {
  const data = revenueChart.data.datasets[0].data;
  const newData = data.map((value) => {
    const change = (Math.random() - 0.5) * 1.0;
    const newValue = Math.max(0, Math.min(10, value + change));
    return Math.round(newValue * 10) / 10;
  });

  revenueChart.data.datasets[0].data = newData;
  revenueChart.update("none");
}

function renderTickets(tickets) {
  const contentDiv = document.querySelector(".ticket-content-compact");
  contentDiv.innerHTML = "";

  tickets.forEach((ticket) => {
    const row = document.createElement("div");
    row.classList.add("ticket-row-compact");
    row.style.display = "flex";

    row.innerHTML = `
      <div>${ticket.licensePlate}</div>
      <div>${new Date(ticket.checkInTime).toLocaleString()}</div>
      <div>${
        ticket.checkOutTime
          ? new Date(ticket.checkOutTime).toLocaleString()
          : "-"
      }</div>
      <div>
        ${
          ticket.checkOutTime
            ? `<button class="pay-btn" onclick="confirmPayment('${ticket.licensePlate}')">Xác nhận</button>`
            : "-"
        }
      </div>
    `;
    contentDiv.appendChild(row);
  });
}

function renderMonthTickets(tickets) {
  const contentDiv = document.getElementById("month-tickets-content");
  contentDiv.innerHTML = "";

  tickets.forEach((ticket) => {
    const row = document.createElement("div");
    row.classList.add("ticket-row-compact");

    row.innerHTML = `
      <div>${ticket.licensePlate}</div>
      <div>${
        ticket.timein ? new Date(ticket.timein).toLocaleString() : "-"
      }</div>
      <div>${
        ticket.outdateat ? new Date(ticket.outdateat).toLocaleString() : "-"
      }</div>
    `;
    contentDiv.appendChild(row);
  });
}

function renderMonthInfor(tickets) {
  const contentDiv = document.getElementById("month-tickets-information");
  contentDiv.innerHTML = "";

  tickets.forEach((ticket) => {
    const row = document.createElement("div");
    row.classList.add("month-row");

    // Kiểm tra trạng thái vé (ticket.end dạng string hoặc Date string)
    const isExpired = new Date(ticket.end) < new Date();
    const isPaid = ticket.isPaid === true;

    row.innerHTML = `
      <div>${ticket.licensePlate || "-"}</div>
      <div>${ticket.owner || "-"}</div>
      <div>${ticket.car_company || "-"}</div>
      <div>${isExpired ? "Expired" : "Active"}</div>
      <div>${isPaid ? "Đã thanh toán" : "Chưa thanh toán"}</div>
      <div>
        ${
          !isPaid
            ? `<button class="confirm-payment-btn" data-id="${ticket._id}">Xác nhận thanh toán</button>`
            : ""
        }
      </div>
    `;

    contentDiv.appendChild(row);
  });

  // Gắn sự kiện click cho các nút xác nhận thanh toán
  document.querySelectorAll(".confirm-payment-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const ticketId = e.target.getAttribute("data-id");
      if (!ticketId) return;

      try {
        const res = await fetch("/api/admin/confirm-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketId }),
        });

        const data = await res.json();
        if (data.success) {
          alert("Cập nhật trạng thái thanh toán thành công!");

          try {
            await loadTicketsAndRender(); // Cập nhật lại giao diện sau khi confirm
          } catch (err) {
            console.error("Lỗi khi tải lại danh sách vé:", err);
            alert("Lỗi khi tải lại danh sách vé, vui lòng thử lại sau!");
          }
        } else {
          alert("Cập nhật thất bại: " + data.message);
        }
      } catch (error) {
        console.error("Lỗi khi fetch cập nhật trạng thái:", error);
        alert("Lỗi server khi cập nhật trạng thái");
      }
    });
  });
}

function confirmPayment(plate) {
  if (confirm(`Xác nhận đã thanh toán cho xe biển số ${plate}?`)) {
    sendMessage("payment_confirmed", {
      plate: plate,
    });
    alert(`Đã xác nhận thanh toán cho xe ${plate}`);
    location.reload();
  }
}
async function loadTicketsAndRender() {
  try {
    const res = await fetch("/api/admin/get-month-tickets"); // Đổi URL API nếu anh dùng route khác
    const data = await res.json();

    if (data.success) {
      const tickets = data.tickets; // Đảm bảo API trả về { success: true, tickets: [...] }
      renderMonthInfor(tickets);
    } else {
      throw new Error(data.message || "Lỗi khi tải danh sách vé tháng");
    }
  } catch (err) {
    console.error("Lỗi loadTicketsAndRender:", err);
    throw err; // Bắn lỗi lên để alert trong catch của confirm-payment
  }
}

function handlePayment(ticket) {
  console.log("Xử lý thanh toán cho:", ticket);

  const { licensePlate, email, amount } = ticket;

  // Gọi API tạo QR
  fetch("/get-qr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      carPlate: licensePlate,
      months: amount, // Số tháng đã lưu trong DB
      email: email, // Email đã lưu
    }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.data && data.data.qrImage) {
        alert("QR code đã được tạo!");
        // Hoặc anh hiện QR lên UI:
        // document.getElementById("qr-code").src = data.data.qrImage;
      } else {
        alert("Không thể tạo QR!");
      }
    })
    .catch((err) => console.error("Lỗi thanh toán:", err));
}

// ⏱️ Tự động cập nhật sau khi DOM sẵn sàng
window.addEventListener("DOMContentLoaded", () => {
  fetchParkingStatus();
  setInterval(updateChartData, 10000);
});
