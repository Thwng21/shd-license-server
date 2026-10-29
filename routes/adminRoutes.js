const express = require("express");
const router = express.Router();

const { 
    login, 
    verifyToken, 
    getLicenses, 
    approve, 
    updateUnlockCode, 
    reject 
} = require("../controllers/adminController");

router.post("/login", login);

router.get("/licenses", verifyToken, getLicenses);
router.post("/approve", verifyToken, approve);
router.post("/update-unlock-code", verifyToken, updateUnlockCode);
router.post("/reject", verifyToken, reject);

module.exports = router;