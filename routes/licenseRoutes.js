const express = require("express");

const router = express.Router();

const {
    verifyLicense,
    getShdV6
} = require("../controllers/licenseController");

router.post(
    "/license/verify",
    verifyLicense
);

router.post(
    "/shd/v6",
    getShdV6
);

module.exports = router;