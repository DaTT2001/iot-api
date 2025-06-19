require("dotenv").config();
process.env.TZ = "Asia/Ho_Chi_Minh";

const express = require("express");
const cors = require("cors");
const { Client } = require("pg");
const compression = require("compression");
const sensorRoutes = require("./routes/sensor.router.js");

const app = express();

// Load database configuration from environment variables
const DB_CONFIG = {
    host: process.env.DB_HOST || "117.6.40.130",
    port: process.env.DB_PORT || "5432",
    database: process.env.DB_NAME || "postgres",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "newpassword",
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false, // Hỗ trợ SSL nếu cần
};

// Middleware
app.use(compression());
app.use(express.json());
app.use(cors({
    origin: "*",
    methods: "GET,POST",
    allowedHeaders: "Content-Type",
}));

let client = null;

async function connectToDatabase() {
    try {
        if (client) {
            await client.end(); // Đóng kết nối cũ nếu có
        }
        client = new Client(DB_CONFIG);
        await client.connect();
        console.log("🔗 Kết nối PostgreSQL thành công");
    } catch (err) {
        console.error("❌ Lỗi kết nối PostgreSQL:", err.message);
        setTimeout(connectToDatabase, 5000); // Thử kết nối lại sau 5 giây
    }
}

// Middleware kiểm tra DB
const checkDbConnection = (req, res, next) => {
    if (!client || client._ending) {
        return res.status(503).json({ error: "Database không khả dụng, thử lại sau." });
    }
    req.client = client;
    next();
};

// Routes
app.use(checkDbConnection, sensorRoutes);

// Global Error Handling
app.use((err, req, res, next) => {
    console.error("🚨 Lỗi hệ thống:", err.stack);
    res.status(500).json({ error: "Có lỗi xảy ra, vui lòng thử lại sau." });
});

process.on("uncaughtException", (err) => {
    console.error("🔥 Lỗi không xử lý được:", err);
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("⚠️ Promise bị reject:", promise, "lý do:", reason);
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, async () => {
    await connectToDatabase();
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});

// Giữ tiến trình không thoát
process.stdin.resume();