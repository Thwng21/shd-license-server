const fs = require("fs");
const path = require("path");
const {
    checkLicense,
    createPendingLicense,
    confirmPayment,
    getLicenseDetails
} = require("../services/licenseService");
const { getTool, getAllTools } = require("../config/tools");

const PROTECTED_DIR = path.join(__dirname, "..", "protected");
const SHD_FILE = path.join(PROTECTED_DIR, "shd-v6.js");

// =====================================================
// DANH SÁCH TOOL CHO CLIENT
// =====================================================
function getAvailableTools(req, res) {
    return res.json({
        success: true,
        tools: getAllTools()
    });
}

// =====================================================
// VERIFY LICENSE
// =====================================================
async function verifyLicense(req, res) {
    try {
        const { license } = req.body;
        const result = await checkLicense(license);
        return res.json(result);
    } catch (error) {
        console.error("verifyLicense error:", error);
        return res.status(500).json({
            valid: false,
            reason: "server_error"
        });
    }
}

// =====================================================
// GET TOOL CODE THEO ĐƯỜNG DẪN ĐỘNG /api/tool/:toolId
// (1 LICENSE DÙNG CHUNG CHO TẤT CẢ CÁC TOOL)
// =====================================================
async function getToolCode(req, res) {
    try {
        const toolId = req.params.toolId || req.body.tool;
        const { license } = req.body;

        const tool = getTool(toolId);
        if (!tool) {
            return res.status(404).json({
                valid: false,
                reason: "tool_not_found",
                message: `Tool '${toolId}' không tồn tại trong hệ thống.`
            });
        }

        const result = await checkLicense(license);
        if (!result.valid) {
            return res.status(403).json(result);
        }

        const targetFilePath = path.join(PROTECTED_DIR, tool.file);

        if (!fs.existsSync(targetFilePath)) {
            console.error("Tool file not found:", targetFilePath);
            return res.status(500).json({
                valid: false,
                reason: "tool_file_missing",
                message: `Không tìm thấy file mã nguồn của tool ${tool.name}.`
            });
        }

        const code = fs.readFileSync(targetFilePath, "utf8");

        return res.json({
            valid: true,
            tool: tool.id,
            toolName: tool.name,
            expiresAt: result.expiresAt,
            code
        });

    } catch (error) {
        console.error("getToolCode error:", error);
        return res.status(500).json({
            valid: false,
            reason: "server_error"
        });
    }
}

// =====================================================
// GET SHD V6 CODE (TƯƠNG THÍCH NGƯỢC VỚI SCRIPT CŨ)
// =====================================================
async function getShdV6(req, res) {
    try {
        const { license } = req.body;
        const result = await checkLicense(license);

        if (!result.valid) {
            return res.status(403).json(result);
        }

        if (!fs.existsSync(SHD_FILE)) {
            console.error("SHD V6 file not found:", SHD_FILE);
            return res.status(500).json({
                valid: false,
                reason: "shd_file_missing"
            });
        }

        const code = fs.readFileSync(SHD_FILE, "utf8");

        return res.json({
            valid: true,
            expiresAt: result.expiresAt,
            code
        });

    } catch (error) {
        console.error("getShdV6 error:", error);
        return res.status(500).json({
            valid: false,
            reason: "server_error"
        });
    }
}

// =====================================================
// TẠO ĐƠN MUA LICENSE (TRẢ VỀ VIETQR VÀ THÔNG TIN CHUYỂN KHOẢN)
// =====================================================
async function buyLicense(req, res) {
    try {
        const months = Number(req.body?.months) || 1;
        if (!Number.isInteger(months) || months <= 0) {
            return res.status(400).json({
                success: false,
                message: "Số tháng đăng ký không hợp lệ."
            });
        }

        const order = await createPendingLicense(months);

        return res.json({
            success: true,
            order
        });
    } catch (error) {
        console.error("buyLicense error:", error);
        return res.status(500).json({
            success: false,
            message: "Không thể tạo đơn mua license: " + error.message
        });
    }
}

// =====================================================
// NGƯỜI DÙNG XÁC NHẬN "ĐÃ THANH TOÁN"
// =====================================================
async function confirmPaymentOrder(req, res) {
    try {
        const licenseKey = String(req.body?.licenseKey || "").trim();
        if (!licenseKey) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng cung cấp mã License."
            });
        }

        const result = await confirmPayment(licenseKey);

        return res.json({
            success: true,
            message: "Đã ghi nhận thanh toán! License sẽ được kiểm tra và kích hoạt trong vòng 24h.",
            data: result
        });
    } catch (error) {
        console.error("confirmPayment error:", error);
        return res.status(400).json({
            success: false,
            message: error.message || "Không thể xác nhận thanh toán."
        });
    }
}

// =====================================================
// TRA CỨU TRẠNG THÁI LICENSE (ĐANG CHỜ DUYỆT / ĐANG HOẠT ĐỘNG)
// =====================================================
async function checkLicenseStatus(req, res) {
    try {
        const licenseKey = String(req.params.licenseKey || req.query.licenseKey || "").trim();
        if (!licenseKey) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng nhập mã License cần kiểm tra."
            });
        }

        const details = await getLicenseDetails(licenseKey);
        if (!details) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy thông tin License này."
            });
        }

        return res.json({
            success: true,
            license: details
        });
    } catch (error) {
        console.error("checkLicenseStatus error:", error);
        return res.status(500).json({
            success: false,
            message: "Lỗi hệ thống khi kiểm tra License."
        });
    }
}

module.exports = {
    getAvailableTools,
    verifyLicense,
    getToolCode,
    getShdV6,
    buyLicense,
    confirmPaymentOrder,
    checkLicenseStatus
};