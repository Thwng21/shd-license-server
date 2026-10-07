const { Client } = require("pg");

const client = new Client({
    host: "localhost",
    port: 5432,
    database: "license_db",
    user: "postgres",
    password: "thanthuong2004@"
});

async function test() {
    try {
        await client.connect();

        const result = await client.query("SELECT NOW() AS now");

        console.log("=================================");
        console.log(" POSTGRESQL CONNECTION OK");
        console.log("=================================");
        console.log("Time:", result.rows[0].now);
        console.log("=================================");

    } catch (error) {
        console.error("POSTGRESQL CONNECTION FAILED");
        console.error(error.message);

    } finally {
        await client.end();
    }
}

test();
