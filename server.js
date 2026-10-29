require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const { testDatabase } = require("./config/database");

// Import Routes
const licenseRoutes = require("./routes/licenseRoutes");
const adminRoutes = require("./routes/adminRoutes");
const copyRoutes = require("./routes/copyRoutes"); // Thêm route copy

const app = express();
const PORT = process.env.PORT || 3000;

// ================================
// MIDDLEWARE
// ================================
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ================================
// STATIC FILES (FRONTEND)
// ================================
app.use("/admin", express.static(path.join(__dirname, "admin")));
app.use("/user", express.static(path.join(__dirname, "user")));

// ================================
// HOME API
// ================================
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "SHD License Server is running"
    });
});

// ================================
// DYNAMIC LOADER
// ================================
app.get("/loader.js", (req, res) => {
    const requestedTool = String(req.query.tool || "shd").toLowerCase().trim();
    const loaderFilePath = path.join(__dirname, "loader.js");
    
    if (!fs.existsSync(loaderFilePath)) {
        return res.status(404).send("// Loader not found");
    }

    let content = fs.readFileSync(loaderFilePath, "utf8");
    if (requestedTool) {
        content = content.replace(/const DEFAULT_TOOL = ".*?";/, `const DEFAULT_TOOL = "${requestedTool}";`);
    }
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.send(content);
});

// ================================
// API ROUTES (GỌN GÀNG)
// ================================
app.use("/api", licenseRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", copyRoutes);

// ================================
// START SERVER
// ================================
testDatabase()
    .then(() => {
        app.listen(PORT, "0.0.0.0", () => {
            console.log("=================================");
            console.log(" SHD LICENSE SERVER");
            console.log("=================================");
            console.log(`Port: ${PORT}`);
            console.log(`Admin: http://localhost:${PORT}/admin`);
            console.log(`User:  http://localhost:${PORT}/user`);
            console.log("=================================");
        });
    })
    .catch((error) => {
        console.error("POSTGRESQL CONNECTION FAILED");
        console.error(error.message);
        process.exit(1);
    });