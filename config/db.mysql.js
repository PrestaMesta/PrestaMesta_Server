const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
  host: env.MYSQL_HOST,
  port: env.MYSQL_PORT,
  user: env.MYSQL_USER,
  password: env.MYSQL_PASSWORD,
  database: env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;