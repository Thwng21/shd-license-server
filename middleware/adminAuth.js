const {
    getAdminSession,
    deleteAdminSession
} = require("../services/adminAuthService");

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
        getAdminSession(token);

    if (!session) {

        return res.status(401).json({
            success: false,
            message: "Invalid admin token"
        });
    }

    if (Date.now() > session.expiresAt) {

        deleteAdminSession(token);

        return res.status(401).json({
            success: false,
            message: "Admin session expired"
        });
    }

    next();
}

module.exports = requireAdmin;