const crypto = require("crypto");

const {
    pool
} = require("../config/database");

function generateLicenseKey() {

    const part1 =
        crypto.randomBytes(3)
            .toString("hex")
            .toUpperCase();

    const part2 =
        crypto.randomBytes(3)
            .toString("hex")
            .toUpperCase();

    const part3 =
        crypto.randomBytes(3)
            .toString("hex")
            .toUpperCase();

    return `SHD-V6-${part1}-${part2}-${part3}`;
}

async function createLicense(days) {

    const licenseKey =
        generateLicenseKey();

    const now = new Date();

    const expiresAt =
        new Date(
            now.getTime() +
            days * 24 * 60 * 60 * 1000
        );

    await pool.query(
        `
        INSERT INTO licenses (
            license_key,
            expires_at,
            status,
            created_at
        )
        VALUES ($1, $2, $3, $4)
        `,
        [
            licenseKey,
            expiresAt,
            "ACTIVE",
            now
        ]
    );

    return {
        licenseKey,
        expiresAt
    };
}

async function checkLicense(license) {

    if (!license) {
        return {
            valid: false,
            reason: "missing_license"
        };
    }

    const result =
        await pool.query(
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

    if (row.status !== "ACTIVE") {
        return {
            valid: false,
            reason: "disabled"
        };
    }

    const now = new Date();

    const expiresAt =
        new Date(row.expires_at);

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
    checkLicense
};