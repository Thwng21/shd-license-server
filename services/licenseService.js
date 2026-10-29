const crypto = require("crypto");
const { pool } = require("../config/database");
const paymentConfig = require("../config/payment");

function generateLicenseKey() {
    const part1 = crypto.randomBytes(3).toString("hex").toUpperCase();
    const part2 = crypto.randomBytes(3).toString("hex").toUpperCase();
    const part3 = crypto.randomBytes(3).toString("hex").toUpperCase();
    return `SHD-${part1}-${part2}-${part3}`;
}

async function createPendingLicense(phone, password, plan = "normal") {
    if (!phone || !password) throw new Error("Thiếu số điện thoại hoặc mật khẩu.");

    const PRICE_NORMAL = 1200000;
    const PRICE_PREMIUM = 1500000;
    const FIXED_PRICE = plan === "premium" ? PRICE_PREMIUM : PRICE_NORMAL;

    const licenseKey = generateLicenseKey();
    const now = new Date();
    const transferContent = `${licenseKey} ${phone}`;

    // Lưu SĐT và Mật khẩu vào Database
    await pool.query(
        `
        INSERT INTO licenses (
            license_key, expires_at, status, created_at, months, amount, phone, password
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [licenseKey, now, "PENDING", now, 0, FIXED_PRICE, phone, password]
    );

    const qrUrl = paymentConfig.getVietQrUrl(FIXED_PRICE, transferContent);

    return {
        licenseKey,
        phone,
        amount: FIXED_PRICE,
        bankInfo: {
            bankId: paymentConfig.BANK_ID,
            accountNumber: paymentConfig.BANK_ACCOUNT,
            accountName: paymentConfig.ACCOUNT_NAME,
            transferContent,
            amount: FIXED_PRICE
        },
        qrUrl
    };
}

async function confirmPayment(licenseKey) {
    if (!licenseKey) throw new Error("Mã License không hợp lệ");
    const key = licenseKey.trim();
    
    const result = await pool.query(
        `UPDATE licenses SET status = 'WAITING_CONFIRM' WHERE license_key = $1 AND (status = 'PENDING' OR status = 'WAITING_CONFIRM') RETURNING *`,
        [key]
    );

    if (result.rowCount === 0) {
        const check = await pool.query("SELECT * FROM licenses WHERE license_key = $1", [key]);
        if (check.rows.length > 0 && check.rows[0].status === "ACTIVE") {
            return { alreadyActive: true, license: check.rows[0] };
        }
        throw new Error("Không tìm thấy đơn mua hoặc License không tồn tại");
    }
    return { success: true, license: result.rows[0] };
}

async function approveLicense(licenseKey) {
    if (!licenseKey) throw new Error("Thiếu mã License");
    const key = licenseKey.trim();
    const existing = await pool.query("SELECT * FROM licenses WHERE license_key = $1", [key]);
    if (existing.rowCount === 0) throw new Error("License không tồn tại");

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 100 * 365 * 24 * 60 * 60 * 1000);

    const updated = await pool.query(
        `UPDATE licenses SET status = 'ACTIVE', expires_at = $1 WHERE license_key = $2 RETURNING *`,
        [expiresAt, key]
    );
    return updated.rows[0];
}

async function getLicenseDetails(licenseKey) {
    if (!licenseKey) return null;
    const key = licenseKey.trim();
    const result = await pool.query(
        `SELECT id, license_key, status, expires_at, created_at, months, amount FROM licenses WHERE license_key = $1`,
        [key]
    );
    if (result.rowCount === 0) return null;

    const row = result.rows[0];
    const now = new Date();
    const expiresAt = row.expires_at ? new Date(row.expires_at) : null;

    let isExpired = false;
    if (row.status === "ACTIVE" && expiresAt && now >= expiresAt) isExpired = true;

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

async function checkLicense(license) {
    if (!license) return { valid: false, reason: "missing_license" };
    const result = await pool.query("SELECT * FROM licenses WHERE license_key = $1", [license.trim()]);
    const row = result.rows[0];

    if (!row) return { valid: false, reason: "invalid_license" };
    if (row.status === "PENDING" || row.status === "WAITING_CONFIRM") return { valid: false, reason: "pending_approval", status: row.status };
    if (row.status !== "ACTIVE") return { valid: false, reason: "disabled", status: row.status };

    const now = new Date();
    const expiresAt = new Date(row.expires_at);
    if (now >= expiresAt) return { valid: false, reason: "expired", expiresAt: row.expires_at };

    return { valid: true, license: row.license_key, expiresAt: row.expires_at };
}

module.exports = {
    generateLicenseKey, createPendingLicense, confirmPayment, approveLicense, getLicenseDetails, checkLicense
};