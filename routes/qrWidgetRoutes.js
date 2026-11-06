const express = require("express");
const router = express.Router();

const { unlock } = require("../controllers/qrWidgetController");

router.post("/unlock", unlock);

module.exports = router;