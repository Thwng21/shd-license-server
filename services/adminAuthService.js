const crypto = require("crypto");

const adminTokens = new Map();

function generateAdminToken() {

    return crypto
        .randomBytes(32)
        .toString("hex");
}

function loginAdmin(username, password) {

    if (
        username !== process.env.ADMIN_USERNAME ||
        password !== process.env.ADMIN_PASSWORD
    ) {
        return null;
    }

    const token =
        generateAdminToken();

    adminTokens.set(
        token,
        {
            expiresAt:
                Date.now() +
                8 * 60 * 60 * 1000
        }
    );

    return token;
}

function getAdminSession(token) {

    return adminTokens.get(token);
}

function deleteAdminSession(token) {

    adminTokens.delete(token);
}

module.exports = {
    loginAdmin,
    getAdminSession,
    deleteAdminSession
};