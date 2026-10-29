const express = require("express");
const router = express.Router();

const {
    getAvailableTools, verifyLicense, getToolCode, getShdV6, buyLicense, confirmPaymentOrder, lookupByPhone
} = require("../controllers/licenseController");

router.get("/tools", getAvailableTools);
router.post("/license/verify", verifyLicense);
router.post("/tool/:toolId", getToolCode);
router.post("/tools/:toolId", getToolCode);
router.post("/shd/v6", getShdV6);

router.post("/license/buy", buyLicense);
router.post("/license/confirm-payment", confirmPaymentOrder);

// Đổi sang POST để giấu mật khẩu
router.post("/license/lookup/:phone", lookupByPhone);

module.exports = router;