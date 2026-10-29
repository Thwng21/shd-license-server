const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { pool } = require("../config/database");

const PROTECTED_DIR = path.join(__dirname, "..", "protected");

const TOOL_FILE_MAP = {
    "cms":   "cms.js",
    "pan":   "pan.js",
    "gin":   "gin.js",
    "cmsv2": "cmsv2.js",
    "panv2": "panv2.js",
    "ginv2": "ginv2.js"
};

const unlockTokens = new Map();
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

function generateToken() {
    return crypto.randomBytes(32).toString("hex");
}

function encryptCode(code) {
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
        key: key.toString("base64"),
        iv: iv.toString("base64"),
        tag: tag.toString("base64"),
        payload: encrypted.toString("base64")
    };
}

// HÀM MỞ KHÓA (CÓ KIỂM TRA GÓI)
async function unlock(req, res) {
    try {
        const code = String(req.body?.code || "").trim();
        const toolId = String(req.body?.toolId || "").toLowerCase().trim();

        if (!code) return res.status(400).json({ success: false, message: "Vui lòng nhập mã kích hoạt." });

        // 1. Kiểm tra mã Code trong Database
        const result = await pool.query(
            `SELECT * FROM licenses WHERE unlock_code = $1 AND status = 'ACTIVE'`,
            [code]
        );

        if (result.rowCount === 0) {
            return res.status(403).json({ success: false, message: "Mã kích hoạt không đúng hoặc chưa được duyệt." });
        }

        const licenseData = result.rows[0];
        
        // 2. Phân biệt gói dựa vào giá tiền (Bản Thường 1.2tr, Bản Pre 1.5tr)
        const isPremiumLicense = Number(licenseData.amount) === 1500000;
        const isPremiumTool = toolId.includes("v2"); // cmsv2, panv2, ginv2

        // Nếu dùng mã Bản Thường để mở tool Bản Premium -> Chặn
        if (!isPremiumLicense && isPremiumTool) {
            return res.status(403).json({ success: false, message: "Mã này là của Bản Thường. Vui lòng mua Bản Premium để mở khóa tool này!" });
        }

        // Nếu dùng mã Bản Premium để mở tool Bản Thường -> Chặn luôn (hoặc bạn có thể mở)
        if (isPremiumLicense && !isPremiumTool) {
            return res.status(403).json({ success: false, message: "Mã này là của Bản Premium. Vui lòng chuyển sang tab Bản Premium để sử dụng!" });
        }
        
        // 3. Cấp token
        const token = generateToken();
        unlockTokens.set(token, { expiresAt: Date.now() + TOKEN_TTL_MS });
        return res.json({ success: true, token });
    } catch (err) {
        console.error("unlock error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server." });
    }
}

function copyTool(req, res) {
    try {
        const auth = req.headers.authorization || "";
        if (!auth.startsWith("Bearer ")) return res.status(401).json({ success: false, message: "Chưa mở khóa." });

        const token = auth.substring(7);
        const session = unlockTokens.get(token);
        if (!session || Date.now() > session.expiresAt) {
            unlockTokens.delete(token);
            return res.status(401).json({ success: false, message: "Phiên mở khóa hết hạn." });
        }

        const toolId = String(req.params.toolId || "").toLowerCase().trim();
        const fileName = TOOL_FILE_MAP[toolId];
        if (!fileName) return res.status(404).json({ success: false, message: "Tool không tồn tại." });

        const filePath = path.join(PROTECTED_DIR, fileName);
        if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: `File ${fileName} chưa được thêm.` });

        const code = fs.readFileSync(filePath, "utf8");
        const encrypted = encryptCode(code);
        return res.json({ success: true, encrypted });
    } catch (err) {
        console.error("copyTool error:", err);
        return res.status(500).json({ success: false, message: "Lỗi đọc file." });
    }
}

module.exports = { unlock, copyTool, TOOL_FILE_MAP };