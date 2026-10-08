require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const {
    testDatabase
} = require("./config/database");

const licenseRoutes =
    require("./routes/licenseRoutes");

const adminRoutes =
    require("./routes/adminRoutes");

const app = express();

const PORT =
    process.env.PORT || 3000;

// ================================
// MIDDLEWARE
// ================================

app.use(cors());

app.use(
    express.json()
);

// ================================
// ADMIN UI
// ================================

app.use(
    "/admin",
    express.static(
        path.join(
            __dirname,
            "admin"
        )
    )
);

// ================================
// HOME
// ================================

app.get("/", (req, res) => {

    res.json({
        success: true,
        message:
            "SHD License Server is running"
    });
});

// ================================
// LOADER
app.get("/loader.js", (req, res) => {
    res.sendFile(
        path.join(__dirname, "loader.js")
    );
});

// ================================
// API ROUTES
// ================================

app.use(
    "/api",
    licenseRoutes
);

app.use(
    "/api/admin",
    adminRoutes
);
// 
app.use(
    "/user",
    express.static(
        path.join(__dirname, "user")
    )
);
// ================================
// START SERVER
// ================================

testDatabase()

    .then(() => {

        app.listen(
            PORT,
            "0.0.0.0",
            () => {

                console.log(
                    "================================="
                );

                console.log(
                    " SHD LICENSE SERVER"
                );

                console.log(
                    "================================="
                );

                console.log(
                    `Port: ${PORT}`
                );

                console.log(
                    "Admin:",
                    "/admin"
                );

                console.log(
                    "================================="
                );
            }
        );
    })

    .catch((error) => {

        console.error(
            "POSTGRESQL CONNECTION FAILED"
        );

        console.error(
            error.message
        );

        process.exit(1);
    });