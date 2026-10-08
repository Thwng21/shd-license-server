const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:thanthuong2004%40@localhost:5432/license_db";

// Chỉ dùng SSL khi ở production hoặc khi DATABASE_URL từ xa (không phải localhost)
const isLocalhost = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
const useSSL = process.env.NODE_ENV === "production" || (!isLocalhost && process.env.DATABASE_URL);

const pool = new Pool({
    connectionString,
    ssl: useSSL ? { rejectUnauthorized: false } : false
});

async function testDatabase() {
    const result = await pool.query(
        "SELECT NOW() AS now"
    );

    console.log("=================================");
    console.log(" POSTGRESQL DATABASE CONNECTED");
    console.log("=================================");
    console.log("Time:", result.rows[0].now);

    // Đảm bảo cấu trúc bảng licenses đầy đủ
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS licenses (
                id SERIAL PRIMARY KEY,
                license_key VARCHAR(100) NOT NULL UNIQUE,
                expires_at TIMESTAMP WITH TIME ZONE,
                status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                months INTEGER DEFAULT 1,
                amount INTEGER DEFAULT 50000
            );
        `);

        // Thêm cột bổ sung nếu bảng đã tồn tại từ trước mà chưa có
        await pool.query(`
            ALTER TABLE licenses ADD COLUMN IF NOT EXISTS months INTEGER DEFAULT 1;
            ALTER TABLE licenses ADD COLUMN IF NOT EXISTS amount INTEGER DEFAULT 50000;
        `);
    } catch (err) {
        console.warn("Notice during table migration:", err.message);
    }
}

module.exports = {
    pool,
    testDatabase
};