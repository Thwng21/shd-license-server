const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function testDatabase() {
    const result = await pool.query(
        "SELECT NOW() AS now"
    );

    console.log("=================================");
    console.log(" POSTGRESQL DATABASE CONNECTED");
    console.log("=================================");
    console.log("Time:", result.rows[0].now);
}

module.exports = {
    pool,
    testDatabase
};