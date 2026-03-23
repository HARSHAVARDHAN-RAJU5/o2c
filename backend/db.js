const { Pool } = require("pg");
require("dotenv").config();

// All credentials must come from environment variables.
// Never hardcode passwords here. Add a .env file locally (git-ignored).
const pool = new Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || "sap_o2c",
  user:     process.env.DB_USER     || "postgres",
  password: process.env.DB_PASSWORD,
  ssl:      process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

pool.on("connect", () => {
  console.log("Connected to PostgreSQL");
});

pool.on("error", (err) => {
  console.error("PostgreSQL pool error:", err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};