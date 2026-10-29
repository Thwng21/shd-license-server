const { pool } = require("../config/database");
const crypto = require("crypto");

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
        const result = await pool.query(`SELECT id, license_key, phone, status, amount, unlock_code, created_at FROM licenses ORDER BY id DESC`);
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
            UPDATE licenses SET status = 'ACTIVE', expires_at = $1, unlock_code = $2 WHERE license_key = $3 RETURNING *
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

async function reject(req, res) {
    try {
        await pool.query(`UPDATE licenses SET status = 'REJECTED' WHERE license_key = $1`, [req.body.license]);
        return res.json({ success: true, message: "Đã hủy đơn." });
    } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
}

module.exports = { login, verifyToken, getLicenses, approve, updateUnlockCode, reject };