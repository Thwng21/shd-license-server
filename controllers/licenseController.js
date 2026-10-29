const fs = require("fs");
const path = require("path");
const { checkLicense, createPendingLicense, confirmPayment, getLicenseDetails } = require("../services/licenseService");
const { getTool, getAllTools } = require("../config/tools");
const { pool } = require("../config/database");

const PROTECTED_DIR = path.join(__dirname, "..", "protected");
const SHD_FILE = path.join(PROTECTED_DIR, "shd-v6.js");

function getAvailableTools(req, res) {
    return res.json({ success: true, tools: getAllTools() });
}

async function verifyLicense(req, res) {
    try {
        const result = await checkLicense(req.body.license);
        return res.json(result);
    } catch (error) { return res.status(500).json({ valid: false, reason: "server_error" }); }
}

async function getToolCode(req, res) {
    try {
        const tool = getTool(req.params.toolId || req.body.tool);
        if (!tool) return res.status(404).json({ valid: false, reason: "tool_not_found" });
        const result = await checkLicense(req.body.license);
        if (!result.valid) return res.status(403).json(result);
        const code = fs.readFileSync(path.join(PROTECTED_DIR, tool.file), "utf8");
        return res.json({ valid: true, tool: tool.id, toolName: tool.name, expiresAt: result.expiresAt, code });
    } catch (error) { return res.status(500).json({ valid: false, reason: "server_error" }); }
}

async function getShdV6(req, res) {
    try {
        const result = await checkLicense(req.body.license);
        if (!result.valid) return res.status(403).json(result);
        const code = fs.readFileSync(SHD_FILE, "utf8");
        return res.json({ valid: true, expiresAt: result.expiresAt, code });
    } catch (error) { return res.status(500).json({ valid: false, reason: "server_error" }); }
}

async function buyLicense(req, res) {
    try {
        const phone = String(req.body?.phone || "").trim().replace(/\s+/g, "");
        const password = String(req.body?.password || "").trim();
        const plan = String(req.body?.plan || "normal").toLowerCase();
        
        if (!/^0\d{9}$/.test(phone)) return res.status(400).json({ success: false, message: "SĐT không hợp lệ." });
        if (password.length < 4) return res.status(400).json({ success: false, message: "Mật khẩu phải từ 4 ký tự." });

        const order = await createPendingLicense(phone, password, plan);
        return res.json({ success: true, order });
    } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
}

async function confirmPaymentOrder(req, res) {
    try {
        const result = await confirmPayment(String(req.body?.licenseKey || "").trim());
        return res.json({ success: true, message: "Đã ghi nhận!", data: result });
    } catch (error) { return res.status(400).json({ success: false, message: error.message }); }
}

// TRA CỨU BẰNG SĐT + MẬT KHẨU
async function lookupByPhone(req, res) {
    try {
        const phone = String(req.params.phone || "").trim();
        const password = String(req.body?.password || "").trim();

        if (!phone || !password) return res.status(400).json({ success: false, message: "Vui lòng nhập SĐT và Mật khẩu." });

        // Tìm đơn hàng khớp cả SĐT và Mật khẩu
        const result = await pool.query(
            `SELECT license_key, status, unlock_code FROM licenses WHERE phone = $1 AND password = $2 ORDER BY id DESC LIMIT 1`, 
            [phone, password]
        );
        
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "Sai Số điện thoại hoặc Mật khẩu tra cứu." });
        }
        
        const data = result.rows[0];
        if (data.status === "PENDING") return res.json({ success: true, status: "PENDING", message: "Chưa thanh toán." });
        if (data.status === "WAITING_CONFIRM") return res.json({ success: true, status: "WAITING_CONFIRM", message: "Đang chờ Admin duyệt." });
        if (data.status === "ACTIVE") return res.json({ success: true, status: "ACTIVE", unlockCode: data.unlock_code, message: "Thành công!" });
        
        return res.json({ success: true, status: data.status, message: "Đơn hàng đã bị hủy." });
    } catch (error) { 
        console.error(error);
        return res.status(500).json({ success: false, message: "Lỗi server." }); 
    }
}

module.exports = { getAvailableTools, verifyLicense, getToolCode, getShdV6, buyLicense, confirmPaymentOrder, lookupByPhone };