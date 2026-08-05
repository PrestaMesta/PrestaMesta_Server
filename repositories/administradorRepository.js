const pool = require('../config/db.mysql');

async function existePorEmail(email) {
  const [rows] = await pool.query('SELECT id FROM administradores WHERE email = ?', [email]);
  return rows.length > 0;
}

async function crear({ nombre, email, passwordHash, rol }) {
  const [result] = await pool.query(
    'INSERT INTO administradores (nombre, email, password, rol) VALUES (?, ?, ?, ?)',
    [nombre, email, passwordHash, rol]
  );
  return result.insertId;
}

// Solo administradores activos pueden autenticarse (mismo comportamiento que el codigo
// original: WHERE activo = TRUE).
async function obtenerPorEmail(email) {
  const [rows] = await pool.query(
    'SELECT * FROM administradores WHERE email = ? AND activo = TRUE',
    [email]
  );
  return rows[0] || null;
}

// Fuente de verdad para autorizacion en acciones administrativas sensibles: relee
// rol/activo directo de la base de datos en vez de confiar en el claim del JWT, que puede
// haber quedado desactualizado si al administrador lo desactivaron o le cambiaron el rol
// despues de haberse emitido el token.
async function obtenerActivoPorId(id) {
  const [rows] = await pool.query('SELECT id, rol, activo FROM administradores WHERE id = ?', [id]);
  const admin = rows[0];
  if (!admin || !admin.activo) return null;
  return admin;
}

// Usado para reconstruir el perfil minimo (id/nombre/email/rol) en las respuestas que
// completan MFA (mfa/enroll/confirm, mfa/verify, Checkpoint 6B-2 revision) -- nunca
// password. Distinto de obtenerActivoPorId: ese es la fuente de verdad para AUTORIZAR
// (exige activo=TRUE), este solo arma el perfil a devolver una vez que la autorizacion ya
// se resolvio por otra via (cargarAdministradorActual, en la misma peticion).
async function obtenerPorId(id) {
  const [rows] = await pool.query('SELECT id, nombre, email, rol FROM administradores WHERE id = ?', [id]);
  return rows[0] || null;
}

module.exports = { existePorEmail, crear, obtenerPorEmail, obtenerActivoPorId, obtenerPorId };
