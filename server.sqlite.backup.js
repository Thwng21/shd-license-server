const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const db = new Database("license.db");

db.pragma("journal_mode = WAL");

const SHD_FILE = path.join(
    __dirname,
    "protected",
    "shd-v6.js"
);

// =====================================================
// DATABASE
// =====================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TEXT NOT NULL
    )
`);

// =====================================================
// LICENSE
// =====================================================

function generateLicenseKey() {
    const part1 = crypto.randomBytes(3).toString("hex").toUpperCase();
    const part2 = crypto.randomBytes(3).toString("hex").toUpperCase();
    const part3 = crypto.randomBytes(3).toString("hex").toUpperCase();

    return `SHD-V6-${part1}-${part2}-${part3}`;
}

function createLicense(days) {
    const licenseKey = generateLicenseKey();

    const now = new Date();

    const expiresAt = new Date(
        now.getTime() + days * 24 * 60 * 60 * 1000
    );

    db.prepare(`
        INSERT INTO licenses (
            license_key,
            expires_at,
            status,
            created_at
        )
        VALUES (?, ?, ?, ?)
    `).run(
        licenseKey,
        expiresAt.toISOString(),
        "ACTIVE",
        now.toISOString()
    );

    return {
        licenseKey,
        expiresAt
    };
}

// =====================================================
// CHECK LICENSE
// =====================================================

function checkLicense(license) {

    if (!license) {
        return {
            valid: false,
            reason: "missing_license"
        };
    }

    const row = db.prepare(`
        SELECT *
        FROM licenses
        WHERE license_key = ?
    `).get(license.trim());

    if (!row) {
        return {
            valid: false,
            reason: "invalid_license"
        };
    }

    if (row.status !== "ACTIVE") {
        return {
            valid: false,
            reason: "disabled"
        };
    }

    const now = new Date();
    const expiresAt = new Date(row.expires_at);

    if (now >= expiresAt) {
        return {
            valid: false,
            reason: "expired",
            expiresAt: row.expires_at
        };
    }

    return {
        valid: true,
        license: row.license_key,
        expiresAt: row.expires_at
    };
}

// =====================================================
// HOME
// =====================================================

app.get("/", (req, res) => {

    res.json({
        success: true,
        message: "SHD License Server is running"
    });

});

// =====================================================
// VERIFY LICENSE
// =====================================================

app.post("/api/license/verify", (req, res) => {

    try {

        const { license } = req.body;

        const result = checkLicense(license);

        return res.json(result);

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            valid: false,
            reason: "server_error"
        });

    }

});

// =====================================================
// GET SHD V6 CODE
// =====================================================

app.post("/api/shd/v6", (req, res) => {

    try {

        const { license } = req.body;

        // -----------------------------
        // CHECK LICENSE
        // -----------------------------

        const result = checkLicense(license);

        if (!result.valid) {

            return res.status(403).json(result);

        }

        // -----------------------------
        // CHECK SHD FILE
        // -----------------------------

        if (!fs.existsSync(SHD_FILE)) {

            console.error(
                "SHD V6 file not found:",
                SHD_FILE
            );

            return res.status(500).json({
                valid: false,
                reason: "shd_file_missing"
            });

        }

        // -----------------------------
        // READ SHD CODE
        // -----------------------------

        const code = fs.readFileSync(
            SHD_FILE,
            "utf8"
        );

        // -----------------------------
        // RETURN CODE
        // -----------------------------

        return res.json({

            valid: true,

            expiresAt: result.expiresAt,

            code

        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            valid: false,
            reason: "server_error"
        });

    }

});

// =====================================================
// CREATE LICENSE FROM CLI
// =====================================================
// =====================================================
// CLI COMMANDS
// =====================================================

const args = process.argv.slice(2);

// -----------------------------------------------------
// CREATE LICENSE
// -----------------------------------------------------

if (args[0] === "create") {

    const days = Number(args[1] || 30);

    if (!Number.isInteger(days) || days <= 0) {
        console.log("Số ngày không hợp lệ.");
        process.exit(1);
    }

    const result = createLicense(days);

    console.log("");
    console.log("=================================");
    console.log(" LICENSE CREATED");
    console.log("=================================");
    console.log("License :", result.licenseKey);
    console.log("Expires :", result.expiresAt.toISOString());
    console.log("Days    :", days);
    console.log("=================================");
    console.log("");

    process.exit(0);
}

// -----------------------------------------------------
// LIST LICENSES
// -----------------------------------------------------

if (args[0] === "list") {

    const licenses = db.prepare(`
        SELECT
            id,
            license_key,
            expires_at,
            status,
            created_at
        FROM licenses
        ORDER BY id DESC
    `).all();

    console.log("");
    console.log("=================================");
    console.log(" LICENSE LIST");
    console.log("=================================");

    if (licenses.length === 0) {
        console.log("Chưa có License nào.");
    } else {
        console.table(licenses);
    }

    console.log("=================================");
    console.log("");

    process.exit(0);
}
// -----------------------------------------------------
// DISABLE LICENSE
// -----------------------------------------------------

if (args[0] === "disable") {

    const license = args[1];

    if (!license) {
        console.log("Vui lòng nhập License.");
        console.log(
            "Ví dụ: node server.js disable SHD-V6-XXXXXX-XXXXXX-XXXXXX"
        );
        process.exit(1);
    }

    const result = db.prepare(`
        UPDATE licenses
        SET status = 'DISABLED'
        WHERE license_key = ?
    `).run(license.trim());

    if (result.changes === 0) {
        console.log("Không tìm thấy License.");
        process.exit(1);
    }

    console.log("");
    console.log("=================================");
    console.log(" LICENSE DISABLED");
    console.log("=================================");
    console.log("License:", license);
    console.log("Status : DISABLED");
    console.log("=================================");
    console.log("");

    process.exit(0);
}
// -----------------------------------------------------
// ENABLE LICENSE
// -----------------------------------------------------

if (args[0] === "enable") {

    const license = args[1];

    if (!license) {
        console.log("Vui lòng nhập License.");
        console.log(
            "Ví dụ: node server.js enable SHD-V6-XXXXXX-XXXXXX-XXXXXX"
        );
        process.exit(1);
    }

    const result = db.prepare(`
        UPDATE licenses
        SET status = 'ACTIVE'
        WHERE license_key = ?
    `).run(license.trim());

    if (result.changes === 0) {
        console.log("Không tìm thấy License.");
        process.exit(1);
    }

    console.log("");
    console.log("=================================");
    console.log(" LICENSE ENABLED");
    console.log("=================================");
    console.log("License:", license);
    console.log("Status : ACTIVE");
    console.log("=================================");
    console.log("");

    process.exit(0);
}
// -----------------------------------------------------
// EXTEND LICENSE
// -----------------------------------------------------

if (args[0] === "extend") {

    const license = args[1];
    const days = Number(args[2]);

    if (!license) {
        console.log("Vui lòng nhập License.");
        console.log(
            "Ví dụ: node server.js extend SHD-V6-XXXXXX-XXXXXX-XXXXXX 30"
        );
        process.exit(1);
    }

    if (!Number.isInteger(days) || days <= 0) {
        console.log("Số ngày gia hạn không hợp lệ.");
        process.exit(1);
    }

    const row = db.prepare(`
        SELECT *
        FROM licenses
        WHERE license_key = ?
    `).get(license.trim());

    if (!row) {
        console.log("Không tìm thấy License.");
        process.exit(1);
    }

    const currentExpires = new Date(row.expires_at);

    const newExpires = new Date(
        currentExpires.getTime() +
        days * 24 * 60 * 60 * 1000
    );

    db.prepare(`
        UPDATE licenses
        SET expires_at = ?
        WHERE license_key = ?
    `).run(
        newExpires.toISOString(),
        license.trim()
    );

    console.log("");
    console.log("=================================");
    console.log(" LICENSE EXTENDED");
    console.log("=================================");
    console.log("License    :", license);
    console.log("Added days :", days);
    console.log("Old expiry :", row.expires_at);
    console.log("New expiry :", newExpires.toISOString());
    console.log("=================================");
    console.log("");

    process.exit(0);
}
// =====================================================
// START SERVER
// =====================================================
app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log("");

        console.log(
            "================================="
        );

        console.log(
            " SHD LICENSE SERVER"
        );

        console.log(
            "================================="
        );

        console.log(
            `Server: http://localhost:${PORT}`
        );

        console.log(
            "Database: license.db"
        );

        console.log(
            "SHD V6:",
            SHD_FILE
        );

        console.log(
            "================================="
        );

        console.log("");

    }
);