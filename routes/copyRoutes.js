const express = require("express");
const router = express.Router();
const { unlock, getToolCode } = require("../controllers/copyController");

router.post("/unlock", unlock);
router.post("/tool/:toolId/run", getToolCode); // Đổi tên route thành /run

module.exports = router;