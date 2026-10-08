const fs = require("fs");
const path = require("path");

const {
    checkLicense
} = require("../services/licenseService");

const SHD_FILE =
    path.join(
        __dirname,
        "..",
        "protected",
        "shd-v6.js"
    );

// ================================
// VERIFY LICENSE
// ================================

async function verifyLicense(req, res) {

    try {

        const {
            license
        } = req.body;

        const result =
            await checkLicense(license);

        return res.json(result);

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            valid: false,
            reason: "server_error"
        });
    }
}

// ================================
// GET SHD V6 CODE
// ================================

async function getShdV6(req, res) {

    try {

        const {
            license
        } = req.body;

        const result =
            await checkLicense(license);

        if (!result.valid) {

            return res.status(403).json(
                result
            );
        }

        if (!fs.existsSync(SHD_FILE)) {

            console.error(
                "SHD V6 file not found:",
                SHD_FILE
            );

            return res.status(500).json({
                valid: false,
                reason:
                    "shd_file_missing"
            });
        }

        const code =
            fs.readFileSync(
                SHD_FILE,
                "utf8"
            );

        return res.json({
            valid: true,
            expiresAt:
                result.expiresAt,
            code
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            valid: false,
            reason: "server_error"
        });
    }
}

module.exports = {
    verifyLicense,
    getShdV6
};