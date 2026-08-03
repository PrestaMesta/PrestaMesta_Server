const pool = require('../config/db.mysql');

async function existePorEmail(email) {
  const [rows] = await pool.query('SELECT id FROM clientes WHERE email = ?', [email]);
  return rows.length > 0;
}

async function crear({ nombre, email, passwordHash, telefono }) {
  const [result] = await pool.query(
    'INSERT INTO clientes (nombre, email, password, telefono) VALUES (?, ?, ?, ?)',
    [nombre, email, passwordHash, telefono || null]
  );
  return result.insertId;
}

async function obtenerPorEmail(email) {
  const [rows] = await pool.query('SELECT * FROM clientes WHERE email = ?', [email]);
  return rows[0] || null;
}

module.exports = { existePorEmail, crear, obtenerPorEmail };
