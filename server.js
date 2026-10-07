require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = 3000;
// ================================
// ADMIN AUTH
// ================================

const adminTokens = new Map();

function generateAdminToken() {

    return crypto
        .randomBytes(32)
        .toString("hex");
}
function requireAdmin(req, res, next) {

    const auth =
        req.headers.authorization || "";

    if (!auth.startsWith("Bearer ")) {

        return res.status(401).json({
            success: false,
            message: "Unauthorized"
        });
    }

    const token =
        auth.substring(7);

    const session =
        adminTokens.get(token);

    if (!session) {

        return res.status(401).json({
            success: false,
            message: "Invalid admin token"
        });
    }

    if (Date.now() > session.expiresAt) {

        adminTokens.delete(token);

        return res.status(401).json({
            success: false,
            message: "Admin session expired"
        });
    }

    next();
}

// ================================
// ADMIN LOGIN
// ================================

app.post(
    "/api/admin/login",
    async (req, res) => {

        const username =
            String(req.body.username || "").trim();

        const password =
            String(req.body.password || "");

        if (
            username !== process.env.ADMIN_USERNAME ||
            password !== process.env.ADMIN_PASSWORD
        ) {

            return res.status(401).json({
                success: false,
                message: "Sai username hoặc password."
            });
        }

        const token =
            generateAdminToken();

        adminTokens.set(
            token,
            {
                expiresAt:
                    Date.now() +
                    8 * 60 * 60 * 1000
            }
        );

        return res.json({
            success: true,
            token
        });
    }
);

// =====================================================
// EXPRESS
// =====================================================

app.use(cors());
app.use(express.json());

// =====================================================
// POSTGRESQL
// =====================================================

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// =====================================================
// SHD FILE
// =====================================================

const SHD_FILE = path.join(
    __dirname,
    "protected",
    "shd-v6.js"
);

// =====================================================
// DATABASE TEST
// =====================================================

async function testDatabase() {
    const result = await pool.query("SELECT NOW() AS now");

    console.log("=================================");
    console.log(" POSTGRESQL DATABASE CONNECTED");
    console.log("=================================");
    console.log("Time:", result.rows[0].now);
    console.log("Database: license_db");
    console.log("=================================");
}

// =====================================================
// LICENSE
// =====================================================

function generateLicenseKey() {
    const part1 = crypto.randomBytes(3).toString("hex").toUpperCase();
    const part2 = crypto.randomBytes(3).toString("hex").toUpperCase();
    const part3 = crypto.randomBytes(3).toString("hex").toUpperCase();

    return `SHD-V6-${part1}-${part2}-${part3}`;
}

// =====================================================
// CREATE LICENSE
// =====================================================

async function createLicense(days) {
    const licenseKey = generateLicenseKey();

    const now = new Date();

    const expiresAt = new Date(
        now.getTime() + days * 24 * 60 * 60 * 1000
    );

    await pool.query(
        `
        INSERT INTO licenses (
            license_key,
            expires_at,
            status,
            created_at
        )
        VALUES ($1, $2, $3, $4)
        `,
        [
            licenseKey,
            expiresAt,
            "ACTIVE",
            now
        ]
    );

    return {
        licenseKey,
        expiresAt
    };
}

// =====================================================
// CHECK LICENSE
// =====================================================

async function checkLicense(license) {
    if (!license) {
        return {
            valid: false,
            reason: "missing_license"
        };
    }

    const result = await pool.query(
        `
        SELECT *
        FROM licenses
        WHERE license_key = $1
        `,
        [license.trim()]
    );

    const row = result.rows[0];

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

app.post("/api/license/verify", async (req, res) => {
    try {
        const { license } = req.body;

        const result = await checkLicense(license);

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

app.post("/api/shd/v6", async (req, res) => {
    try {
        const { license } = req.body;

        // -----------------------------
        // CHECK LICENSE
        // -----------------------------

        const result = await checkLicense(license);

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
// CLI COMMANDS
// =====================================================

const args = process.argv.slice(2);
// ================================
// ADMIN ROUTES
// ================================

app.use(
    "/admin",
    express.static(
        path.join(__dirname, "admin")
    )
);
app.post(
    "/api/admin/login",
    async (req, res) => {

        const {
            username,
            password
        } = req.body;

        if (
            username !== process.env.ADMIN_USERNAME ||
            password !== process.env.ADMIN_PASSWORD
        ) {

            return res.status(401).json({
                success: false,
                message: "Sai username hoặc password."
            });
        }

        const token =
            generateAdminToken();

        adminTokens.set(
            token,
            {
                expiresAt:
                    Date.now() +
                    8 * 60 * 60 * 1000
            }
        );

        return res.json({
            success: true,
            token
        });
    }
);

app.post(
    "/api/admin/login",
    async (req, res) => {

        const {
            username,
            password
        } = req.body;

        if (
            username !==
                process.env.ADMIN_USERNAME ||
            password !==
                process.env.ADMIN_PASSWORD
        ) {

            return res.status(401).json({
                success: false,
                message: "Sai username hoặc password."
            });
        }

        const token =
            generateAdminToken();

        adminTokens.set(
            token,
            {
                expiresAt:
                    Date.now() +
                    8 * 60 * 60 * 1000
            }
        );

        return res.json({
            success: true,
            token
        });
    }
);


app.get(
    "/api/admin/licenses",
    requireAdmin,
    async (req, res) => {

        try {

            const result =
                await pool.query(`
                    SELECT
                        id,
                        license_key,
                        expires_at,
                        status,
                        created_at
                    FROM licenses
                    ORDER BY id DESC
                `);

            res.json({
                success: true,
                licenses: result.rows
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message: "Database error"
            });
        }
    }
);


app.post(
    "/api/admin/create",
    requireAdmin,
    async (req, res) => {

        try {

            const days =
                Number(req.body.days);

            if (
                !Number.isInteger(days) ||
                days <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message: "Số ngày không hợp lệ."
                });
            }

            const result =
                await createLicense(days);

            res.json({
                success: true,
                license:
                    result.licenseKey,
                expiresAt:
                    result.expiresAt
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message: "Không thể tạo license."
            });
        }
    }
);


app.post(
    "/api/admin/disable",
    requireAdmin,
    async (req, res) => {

        try {

            const {
                license
            } = req.body;

            const result =
                await pool.query(
                    `
                    UPDATE licenses
                    SET status = 'DISABLED'
                    WHERE license_key = $1
                    RETURNING *
                    `,
                    [license]
                );

            if (
                result.rowCount === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message: "License không tồn tại."
                });
            }

            res.json({
                success: true
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message: "Database error"
            });
        }
    }
);


app.post(
    "/api/admin/enable",
    requireAdmin,
    async (req, res) => {

        try {

            const {
                license
            } = req.body;

            const result =
                await pool.query(
                    `
                    UPDATE licenses
                    SET status = 'ACTIVE'
                    WHERE license_key = $1
                    RETURNING *
                    `,
                    [license]
                );

            if (
                result.rowCount === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message: "License không tồn tại."
                });
            }

            res.json({
                success: true
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message: "Database error"
            });
        }
    }
);


app.post(
    "/api/admin/extend",
    requireAdmin,
    async (req, res) => {

        try {

            const {
                license,
                days
            } = req.body;

            const numberOfDays =
                Number(days);

            if (
                !Number.isInteger(numberOfDays) ||
                numberOfDays <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message: "Số ngày không hợp lệ."
                });
            }

            const result =
                await pool.query(
                    `
                    UPDATE licenses
                    SET expires_at =
                        expires_at +
                        ($1 * INTERVAL '1 day')
                    WHERE license_key = $2
                    RETURNING expires_at
                    `,
                    [
                        numberOfDays,
                        license
                    ]
                );

            if (
                result.rowCount === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message: "License không tồn tại."
                });
            }

            res.json({
                success: true,
                expiresAt:
                    result.rows[0].expires_at
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message: "Database error"
            });
        }
    }
);

// =====================================================
// CREATE LICENSE
// =====================================================

if (args[0] === "create") {

    const days = Number(args[1] || 30);

    if (!Number.isInteger(days) || days <= 0) {
        console.log("Số ngày không hợp lệ.");
        process.exit(1);
    }

    (async () => {
        try {

            const result = await createLicense(days);

            console.log("");
            console.log("=================================");
            console.log(" LICENSE CREATED");
            console.log("=================================");
            console.log("License :", result.licenseKey);
            console.log("Expires :", result.expiresAt.toISOString());
            console.log("Days    :", days);
            console.log("=================================");
            console.log("");

            await pool.end();

            process.exit(0);

        } catch (error) {

            console.error("Không thể tạo License.");
            console.error(error);

            await pool.end();

            process.exit(1);
        }
    })();
}

// =====================================================
// LIST LICENSES
// =====================================================

if (args[0] === "list") {

    (async () => {

        try {

            const result = await pool.query(
                `
                SELECT
                    id,
                    license_key,
                    expires_at,
                    status,
                    created_at
                FROM licenses
                ORDER BY id DESC
                `
            );

            const licenses = result.rows;

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

            await pool.end();

            process.exit(0);

        } catch (error) {

            console.error("Không thể lấy danh sách License.");
            console.error(error);

            await pool.end();

            process.exit(1);
        }

    })();
}

// =====================================================
// DISABLE LICENSE
// =====================================================

if (args[0] === "disable") {

    const license = args[1];

    if (!license) {

        console.log("Vui lòng nhập License.");

        console.log(
            "Ví dụ: node server.js disable SHD-V6-XXXXXX-XXXXXX-XXXXXX"
        );

        process.exit(1);
    }

    (async () => {

        try {

            const result = await pool.query(
                `
                UPDATE licenses
                SET status = 'DISABLED'
                WHERE license_key = $1
                `,
                [license.trim()]
            );

            if (result.rowCount === 0) {

                console.log("Không tìm thấy License.");

                await pool.end();

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

            await pool.end();

            process.exit(0);

        } catch (error) {

            console.error(error);

            await pool.end();

            process.exit(1);
        }

    })();
}

// =====================================================
// ENABLE LICENSE
// =====================================================

if (args[0] === "enable") {

    const license = args[1];

    if (!license) {

        console.log("Vui lòng nhập License.");

        console.log(
            "Ví dụ: node server.js enable SHD-V6-XXXXXX-XXXXXX-XXXXXX"
        );

        process.exit(1);
    }

    (async () => {

        try {

            const result = await pool.query(
                `
                UPDATE licenses
                SET status = 'ACTIVE'
                WHERE license_key = $1
                `,
                [license.trim()]
            );

            if (result.rowCount === 0) {

                console.log("Không tìm thấy License.");

                await pool.end();

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

            await pool.end();

            process.exit(0);

        } catch (error) {

            console.error(error);

            await pool.end();

            process.exit(1);
        }

    })();
}

// =====================================================
// EXTEND LICENSE
// =====================================================

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

    (async () => {

        try {

            const result = await pool.query(
                `
                SELECT *
                FROM licenses
                WHERE license_key = $1
                `,
                [license.trim()]
            );

            const row = result.rows[0];

            if (!row) {

                console.log("Không tìm thấy License.");

                await pool.end();

                process.exit(1);
            }

            const currentExpires = new Date(row.expires_at);

            const newExpires = new Date(
                currentExpires.getTime() +
                days * 24 * 60 * 60 * 1000
            );

            await pool.query(
                `
                UPDATE licenses
                SET expires_at = $1
                WHERE license_key = $2
                `,
                [
                    newExpires,
                    license.trim()
                ]
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

            await pool.end();

            process.exit(0);

        } catch (error) {

            console.error(error);

            await pool.end();

            process.exit(1);
        }

    })();
}

// =====================================================
// START SERVER
// =====================================================

if (!args[0]) {

    testDatabase()
        .then(() => {

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
                        "Database: PostgreSQL / license_db"
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

        })
        .catch((error) => {

            console.error("");
            console.error(
                "POSTGRESQL CONNECTION FAILED"
            );
            console.error(
                error.message
            );
            console.error("");

            process.exit(1);
        });
}