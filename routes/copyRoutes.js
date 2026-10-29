const express = require("express");
const router = express.Router();
const { unlock, copyTool } = require("../controllers/copyController");

router.post("/unlock", unlock);
router.post("/tool/:toolId/copy", copyTool);

module.exports = router;