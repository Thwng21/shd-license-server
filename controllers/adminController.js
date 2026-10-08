const {
    pool
} = require("../config/database");

const {
    createLicense,
    approveLicense,
    rejectLicense
} = require("../services/licenseService");

const {
    loginAdmin
} = require("../services/adminAuthService");

// ================================
// ADMIN LOGIN
// ================================
async function login(req, res) {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");

    const token = loginAdmin(username, password);

    if (!token) {
        return res.status(401).json({
            success: false,
            message: "Sai username hoặc password."
        });
    }

    return res.json({
        success: true,
        token
    });
}

// ================================
// GET LICENSES
// ================================
async function getLicenses(req, res) {
    try {
        const result = await pool.query(
            `
            SELECT
                id,
                license_key,
                expires_at,
                status,
                created_at,
                months,
                amount
            FROM licenses
            ORDER BY id DESC
            `
        );

        return res.json({
            success: true,
            licenses: result.rows
        });

    } catch (error) {
        console.error("getLicenses error:", error);
        return res.status(500).json({
            success: false,
            message: "Database error"
        });
    }
}

// ================================
// CREATE LICENSE
// ================================
async function create(req, res) {
    try {
        const days = Number(req.body?.days);

        if (!Number.isInteger(days) || days <= 0) {
            return res.status(400).json({
                success: false,
                message: "Số ngày không hợp lệ."
            });
        }

        const result = await createLicense(days);

        return res.json({
            success: true,
            license: result.licenseKey,
            expiresAt: result.expiresAt
        });

    } catch (error) {
        console.error("create license error:", error);
        return res.status(500).json({
            success: false,
            message: "Không thể tạo license."
        });
    }
}

// ================================
// APPROVE LICENSE (DUYỆT ĐƠN MUA)
// ================================
async function approve(req, res) {
    try {
        const licenseKey = String(req.body?.license || req.body?.licenseKey || "").trim();
        if (!licenseKey) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng cung cấp mã License cần duyệt."
            });
        }

        const updated = await approveLicense(licenseKey);

        return res.json({
            success: true,
            message: "Đã duyệt và kích hoạt License thành công!",
            license: updated
        });
    } catch (error) {
        console.error("approve error:", error);
        return res.status(400).json({
            success: false,
            message: error.message || "Không thể duyệt License."
        });
    }
}

// ================================
// REJECT LICENSE (TỪ CHỐI ĐƠN MUA)
// ================================
async function reject(req, res) {
    try {
        const licenseKey = String(req.body?.license || req.body?.licenseKey || "").trim();
        if (!licenseKey) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng cung cấp mã License cần từ chối."
            });
        }

        await rejectLicense(licenseKey);

        return res.json({
            success: true,
            message: "Đã từ chối License."
        });
    } catch (error) {
        console.error("reject error:", error);
        return res.status(400).json({
            success: false,
            message: error.message || "Không thể từ chối License."
        });
    }
}

// ================================
// DISABLE LICENSE
// ================================
async function disable(req, res) {
    try {
        const license = String(req.body?.license || "").trim();

        const result = await pool.query(
            `
            UPDATE licenses
            SET status = 'DISABLED'
            WHERE license_key = $1
            RETURNING *
            `,
            [license]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: "License không tồn tại."
            });
        }

        return res.json({
            success: true
        });

    } catch (error) {
        console.error("disable error:", error);
        return res.status(500).json({
            success: false,
            message: "Database error"
        });
    }
}

// ================================
// ENABLE LICENSE
// ================================
async function enable(req, res) {
    try {
        const license = String(req.body?.license || "").trim();

        const result = await pool.query(
            `
            UPDATE licenses
            SET status = 'ACTIVE'
            WHERE license_key = $1
            RETURNING *
            `,
            [license]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: "License không tồn tại."
            });
        }

        return res.json({
            success: true
        });

    } catch (error) {
        console.error("enable error:", error);
        return res.status(500).json({
            success: false,
            message: "Database error"
        });
    }
}

// ================================
// EXTEND LICENSE
// ================================
async function extend(req, res) {
    try {
        const license = String(req.body?.license || "").trim();
        const numberOfDays = Number(req.body?.days);

        if (!Number.isInteger(numberOfDays) || numberOfDays <= 0) {
            return res.status(400).json({
                success: false,
                message: "Số ngày không hợp lệ."
            });
        }

        const result = await pool.query(
            `
            UPDATE licenses
            SET expires_at =
                GREATEST(expires_at, NOW()) +
                ($1 * INTERVAL '1 day'),
                status = 'ACTIVE'
            WHERE license_key = $2
            RETURNING expires_at
            `,
            [numberOfDays, license]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: "License không tồn tại."
            });
        }

        return res.json({
            success: true,
            expiresAt: result.rows[0].expires_at
        });

    } catch (error) {
        console.error("extend error:", error);
        return res.status(500).json({
            success: false,
            message: "Database error"
        });
    }
}

module.exports = {
    login,
    getLicenses,
    create,
    approve,
    reject,
    disable,
    enable,
    extend
};