const express = require("express");
const router = express.Router();

const {
    getAvailableTools,
    verifyLicense,
    getToolCode,
    getShdV6,
    buyLicense,
    confirmPaymentOrder,
    checkLicenseStatus
} = require("../controllers/licenseController");

// Danh sách tool
router.get("/tools", getAvailableTools);

// Xác thực license
router.post("/license/verify", verifyLicense);

// Lấy mã nguồn tool động (1 license dùng cho mọi tool)
router.post("/tool/:toolId", getToolCode);
router.post("/tools/:toolId", getToolCode);

// Route cũ tương thích ngược
router.post("/shd/v6", getShdV6);

// Mua license & thanh toán VietQR
router.post("/license/buy", buyLicense);
router.post("/license/confirm-payment", confirmPaymentOrder);

// Tra cứu trạng thái license (đang hoạt động / chờ duyệt / hết hạn)
router.get("/license/status/:licenseKey", checkLicenseStatus);
router.post("/license/status", checkLicenseStatus);

module.exports = router;