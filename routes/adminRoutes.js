const express = require("express");
const router = express.Router();

const {
    login,
    getLicenses,
    create,
    approve,
    reject,
    disable,
    enable,
    extend
} = require("../controllers/adminController");

const requireAdmin = require("../middleware/adminAuth");

router.post("/login", login);
router.get("/licenses", requireAdmin, getLicenses);
router.post("/create", requireAdmin, create);
router.post("/approve", requireAdmin, approve);
router.post("/reject", requireAdmin, reject);
router.post("/disable", requireAdmin, disable);
router.post("/enable", requireAdmin, enable);
router.post("/extend", requireAdmin, extend);

module.exports = router;