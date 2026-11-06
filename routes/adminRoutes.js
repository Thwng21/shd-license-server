const express = require("express");
const router = express.Router();

const { 
    login, 
    verifyToken, 
    getLicenses, 
    approve, 
    updateUnlockCode, 
    createSpecialCode,
    updateSpecialCode,
    deleteSpecialCode,
    reject,
    getQrWidgetSettings,
    updateQrWidgetPassword
} = require("../controllers/adminController");

router.post("/login", login);

router.get("/licenses", verifyToken, getLicenses);
router.post("/approve", verifyToken, approve);
router.post("/update-unlock-code", verifyToken, updateUnlockCode);
router.post("/create-special-code", verifyToken, createSpecialCode);
router.post("/update-special-code", verifyToken, updateSpecialCode);
router.post("/delete-special-code", verifyToken, deleteSpecialCode);
router.post("/reject", verifyToken, reject);
router.get("/qr-widget-settings", verifyToken, getQrWidgetSettings);
router.post("/qr-widget-password", verifyToken, updateQrWidgetPassword);

module.exports = router;