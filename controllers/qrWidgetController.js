const crypto = require("crypto");
const { pool } = require("../config/database");

const SETTING_KEY = "phone_qr_password";

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `scrypt$${salt}$${hash}`;
}

function matchesPassword(password, storedValue) {
    const [, salt, storedHash] = String(storedValue || "").split("$");
    if (!salt || !storedHash) return false;

    const hash = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(storedHash, "hex");
    return expected.length === hash.length && crypto.timingSafeEqual(expected, hash);
}

async function getStoredPassword() {
    const result = await pool.query(
        "SELECT value FROM app_settings WHERE key = $1 LIMIT 1",
        [SETTING_KEY]
    );
    return result.rows[0]?.value || "";
}

async function unlock(req, res) {
    const password = String(req.body?.password || "");
    if (!password) return res.status(400).json({ success: false, message: "Vui lòng nhập mật khẩu." });

    try {
        const storedPassword = await getStoredPassword();
        if (!storedPassword) {
            return res.status(503).json({ success: false, message: "QR chưa được cấu hình mật khẩu." });
        }
        if (!matchesPassword(password, storedPassword)) {
            return res.status(401).json({ success: false, message: "Mật khẩu không đúng." });
        }
        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Không thể xác thực lúc này." });
    }
}

async function getSettings(req, res) {
    try {
        const storedPassword = await getStoredPassword();
        return res.json({ success: true, configured: Boolean(storedPassword) });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Không thể đọc cấu hình QR." });
    }
}

async function updatePassword(req, res) {
    const password = String(req.body?.password || "").trim();
    if (password.length < 4) {
        return res.status(400).json({ success: false, message: "Mật khẩu phải có ít nhất 4 ký tự." });
    }

    try {
        await pool.query(
            `INSERT INTO app_settings (key, value)
             VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
            [SETTING_KEY, hashPassword(password)]
        );
        return res.json({ success: true, message: "Đã lưu mật khẩu QR." });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Không thể lưu mật khẩu QR." });
    }
}

module.exports = { unlock, getSettings, updatePassword };
