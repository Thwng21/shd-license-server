const { pool } = require("../config/database");
const crypto = require("crypto");
const { getSettings, updatePassword } = require("./qrWidgetController");

const activeTokens = new Set();

async function login(req, res) {
    const { username, password } = req.body;
    if (username === (process.env.ADMIN_USERNAME || "admin") && password === (process.env.ADMIN_PASSWORD || "thanthuong2004@")) {
        const token = crypto.randomBytes(24).toString("hex");
        activeTokens.add(token);
        return res.json({ success: true, token });
    }
    return res.status(401).json({ success: false, message: "Sai tài khoản hoặc mật khẩu." });
}

function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return res.status(401).json({ success: false, message: "Chưa đăng nhập." });
    if (activeTokens.has(authHeader.split(" ")[1])) return next();
    return res.status(401).json({ success: false, message: "Phiên hết hạn." });
}

async function getLicenses(req, res) {
    try {
        const result = await pool.query(`SELECT id, license_key, phone, status, amount, unlock_code, special_code, special_code_used, copy_count, created_at FROM licenses ORDER BY id DESC`);
        return res.json({ success: true, licenses: result.rows });
    } catch (error) { return res.status(500).json({ success: false, message: "Lỗi DB." }); }
}

async function approve(req, res) {
    try {
        const licenseKey = String(req.body?.license || "").trim();
        const check = await pool.query("SELECT phone FROM licenses WHERE license_key = $1", [licenseKey]);
        const phone = check.rows[0]?.phone || "USER";
        const unlockCode = `VIP-${phone}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
        const expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);

        const result = await pool.query(`
            UPDATE licenses
            SET status = 'ACTIVE', expires_at = $1, unlock_code = $2,
                copy_count = 0, special_code_used = FALSE
            WHERE license_key = $3
            RETURNING *
        `, [expiresAt, unlockCode, licenseKey]);

        return res.json({ success: true, license: result.rows[0] });
    } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
}

async function updateUnlockCode(req, res) {
    try {
        await pool.query(`UPDATE licenses SET unlock_code = $1 WHERE license_key = $2`, [req.body.unlockCode, req.body.license]);
        return res.json({ success: true, message: "Đã cập nhật mã!" });
    } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
}

async function createSpecialCode(req, res) {
    try {
        const license = String(req.body?.license || "").trim();
        const requestedCode = String(req.body?.specialCode || "").trim().toUpperCase();
        const specialCode = requestedCode || `SP-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
        const result = await pool.query(
            `UPDATE licenses SET special_code = $1, special_code_used = FALSE
             WHERE license_key = $2 AND status = 'ACTIVE'
             RETURNING special_code`,
            [specialCode, license]
        );
        if (result.rowCount === 0) return res.status(404).json({ success: false, message: "Đơn không tồn tại hoặc chưa được duyệt." });
        return res.json({ success: true, specialCode: result.rows[0].special_code });
    } catch (error) {
        if (error.code === "23505") return res.status(400).json({ success: false, message: "Mã đặc biệt đã được dùng cho đơn khác." });
        return res.status(500).json({ success: false, message: error.message });
    }
}

async function updateSpecialCode(req, res) {
    return createSpecialCode(req, res);
}

async function deleteSpecialCode(req, res) {
    try {
        const license = String(req.body?.license || "").trim();
        const result = await pool.query(
            `UPDATE licenses SET special_code = NULL, special_code_used = FALSE
             WHERE license_key = $1
             RETURNING license_key`,
            [license]
        );
        if (result.rowCount === 0) return res.status(404).json({ success: false, message: "Không tìm thấy đơn." });
        return res.json({ success: true, message: "Đã xóa mã đặc biệt." });
    } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
}

async function reject(req, res) {
    try {
        await pool.query(`UPDATE licenses SET status = 'REJECTED' WHERE license_key = $1`, [req.body.license]);
        return res.json({ success: true, message: "Đã hủy đơn." });
    } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
}

module.exports = {
    login, verifyToken, getLicenses, approve, updateUnlockCode,
    createSpecialCode, updateSpecialCode, deleteSpecialCode, reject,
    getQrWidgetSettings: getSettings,
    updateQrWidgetPassword: updatePassword
};