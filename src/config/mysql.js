// src/models/mysql.js
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

// To create the conexion eith mysql
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});

// Probar conexión al arrancar
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Database connected');
    connection.release();
  } catch (err) {
    console.error('Error connecting to DB:', err);
  }
})();

module.exports = pool;
