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

// Usado para reconstruir el perfil minimo (id/nombre/email) en las respuestas que
// completan MFA (mfa/enroll/confirm, mfa/verify, Checkpoint 6B-2 revision): el token
// pre-MFA/de sesion solo trae `sub`/`email`, nunca `nombre`, asi que ese campo se relee de
// BD por `id` -- nunca se acepta un `id` que no venga del token ya verificado.
async function obtenerPorId(id) {
  const [rows] = await pool.query('SELECT * FROM clientes WHERE id = ?', [id]);
  return rows[0] || null;
}

module.exports = { existePorEmail, crear, obtenerPorEmail, obtenerPorId };
