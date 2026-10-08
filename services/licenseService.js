const crypto = require("crypto");
const { pool } = require("../config/database");
const paymentConfig = require("../config/payment");

function generateLicenseKey() {
    const part1 = crypto.randomBytes(3).toString("hex").toUpperCase();
    const part2 = crypto.randomBytes(3).toString("hex").toUpperCase();
    const part3 = crypto.randomBytes(3).toString("hex").toUpperCase();

    return `SHD-${part1}-${part2}-${part3}`;
}

// =====================================================
// TẠO LICENSE BỞI ADMIN (KÍCH HOẠT NGAY THEO SỐ NGÀY)
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
            created_at,
            months,
            amount
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
            licenseKey,
            expiresAt,
            "ACTIVE",
            now,
            Math.max(1, Math.round(days / 30)),
            Math.max(1, Math.round(days / 30)) * paymentConfig.PRICE_PER_MONTH
        ]
    );

    return {
        licenseKey,
        expiresAt
    };
}

// =====================================================
// TẠO ĐƠN MUA LICENSE (TRẠNG THÁI PENDING CHỜ THANH TOÁN)
// =====================================================
async function createPendingLicense(months) {
    const numMonths = Math.max(1, parseInt(months) || 1);
    const amount = numMonths * paymentConfig.PRICE_PER_MONTH;
    const licenseKey = generateLicenseKey();
    const now = new Date();

    // Tạm thời để expires_at là now, khi admin duyệt sẽ cộng dồn theo months
    await pool.query(
        `
        INSERT INTO licenses (
            license_key,
            expires_at,
            status,
            created_at,
            months,
            amount
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
            licenseKey,
            now,
            "PENDING",
            now,
            numMonths,
            amount
        ]
    );

    const qrUrl = paymentConfig.getVietQrUrl(amount, licenseKey);

    return {
        licenseKey,
        months: numMonths,
        amount,
        bankInfo: {
            bankId: paymentConfig.BANK_ID,
            accountNumber: paymentConfig.BANK_ACCOUNT,
            accountName: paymentConfig.ACCOUNT_NAME,
            transferContent: licenseKey,
            amount
        },
        qrUrl
    };
}

// =====================================================
// NGƯỜI DÙNG BẤM "TÔI ĐÃ THANH TOÁN" -> CHUYỂN CHỜ DUYỆT
// =====================================================
async function confirmPayment(licenseKey) {
    if (!licenseKey) {
        throw new Error("Mã License không hợp lệ");
    }

    const key = licenseKey.trim();
    const result = await pool.query(
        `
        UPDATE licenses
        SET status = 'WAITING_CONFIRM'
        WHERE license_key = $1 AND (status = 'PENDING' OR status = 'WAITING_CONFIRM')
        RETURNING *
        `,
        [key]
    );

    if (result.rowCount === 0) {
        // Kiểm tra xem license đã active chưa
        const check = await pool.query(
            "SELECT * FROM licenses WHERE license_key = $1",
            [key]
        );
        if (check.rows.length > 0 && check.rows[0].status === "ACTIVE") {
            return {
                alreadyActive: true,
                license: check.rows[0]
            };
        }
        throw new Error("Không tìm thấy đơn mua hoặc License không tồn tại");
    }

    return {
        success: true,
        license: result.rows[0]
    };
}

// =====================================================
// ADMIN DUYỆT VÀ KÍCH HOẠT LICENSE
// =====================================================
async function approveLicense(licenseKey) {
    if (!licenseKey) throw new Error("Thiếu mã License");

    const key = licenseKey.trim();
    const existing = await pool.query(
        "SELECT * FROM licenses WHERE license_key = $1",
        [key]
    );

    if (existing.rowCount === 0) {
        throw new Error("License không tồn tại");
    }

    const row = existing.rows[0];
    const months = row.months || 1;
    const now = new Date();
    // 1 tháng = 30 ngày
    const expiresAt = new Date(now.getTime() + months * 30 * 24 * 60 * 60 * 1000);

    const updated = await pool.query(
        `
        UPDATE licenses
        SET status = 'ACTIVE', expires_at = $1
        WHERE license_key = $2
        RETURNING *
        `,
        [expiresAt, key]
    );

    return updated.rows[0];
}

// =====================================================
// ADMIN TỪ CHỐI LICENSE
// =====================================================
async function rejectLicense(licenseKey) {
    if (!licenseKey) throw new Error("Thiếu mã License");
    const key = licenseKey.trim();

    const updated = await pool.query(
        `
        UPDATE licenses
        SET status = 'REJECTED'
        WHERE license_key = $1
        RETURNING *
        `,
        [key]
    );

    if (updated.rowCount === 0) {
        throw new Error("License không tồn tại");
    }

    return updated.rows[0];
}

// =====================================================
// TRA CỨU TRẠNG THÁI LICENSE (CHO USER)
// =====================================================
async function getLicenseDetails(licenseKey) {
    if (!licenseKey) return null;
    const key = licenseKey.trim();

    const result = await pool.query(
        `
        SELECT id, license_key, status, expires_at, created_at, months, amount
        FROM licenses
        WHERE license_key = $1
        `,
        [key]
    );

    if (result.rowCount === 0) return null;

    const row = result.rows[0];
    const now = new Date();
    const expiresAt = row.expires_at ? new Date(row.expires_at) : null;

    let isExpired = false;
    if (row.status === "ACTIVE" && expiresAt && now >= expiresAt) {
        isExpired = true;
    }

    return {
        id: row.id,
        licenseKey: row.license_key,
        status: isExpired ? "EXPIRED" : row.status,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        months: row.months,
        amount: row.amount,
        isActive: row.status === "ACTIVE" && !isExpired
    };
}

// =====================================================
// XÁC THỰC LICENSE DÙNG CHUNG CHO TẤT CẢ CÁC TOOL
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

    if (row.status === "PENDING" || row.status === "WAITING_CONFIRM") {
        return {
            valid: false,
            reason: "pending_approval",
            status: row.status
        };
    }

    if (row.status !== "ACTIVE") {
        return {
            valid: false,
            reason: "disabled",
            status: row.status
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

module.exports = {
    generateLicenseKey,
    createLicense,
    createPendingLicense,
    confirmPayment,
    approveLicense,
    rejectLicense,
    getLicenseDetails,
    checkLicense
};