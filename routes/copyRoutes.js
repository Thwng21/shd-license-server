const express = require("express");
const router = express.Router();
const { unlock, getToolCode, redeemSpecialCode } = require("../controllers/copyController");

router.post("/unlock", unlock);
router.post("/tool/:toolId/run", getToolCode); // Đổi tên route thành /run
router.post("/tool/redeem-special", redeemSpecialCode);

module.exports = router;