// Persistencia MFA de administradores (Checkpoint 6B-1). Espejo exacto de
// repositories/clienteMfaRepository.js sobre administradores_mfa /
// administradores_mfa_codigos_recuperacion -- misma firma de funciones (parametro
// `usuarioId` generico) para que services/mfaService.js sea agnostico de dominio. No se
// repite el razonamiento de cada funcion aqui, ver clienteMfaRepository.js.
const pool = require('../config/db.mysql');

async function obtenerEstado(usuarioId) {
  const [rows] = await pool.query('SELECT * FROM administradores_mfa WHERE administrador_id = ?', [usuarioId]);
  return rows[0] || null;
}

async function iniciarEnrolamiento({ usuarioId, ciphertext, nonce, tag }) {
  await pool.query(
    `INSERT INTO administradores_mfa
       (administrador_id, estado, totp_secret_ciphertext, totp_secret_nonce, totp_secret_tag,
        totp_activado_en, totp_ultimo_timestep_usado, intentos_fallidos, bloqueado_hasta)
     VALUES (?, 'PENDIENTE_CONFIRMACION', ?, ?, ?, NULL, NULL, 0, NULL)
     ON DUPLICATE KEY UPDATE
       estado = 'PENDIENTE_CONFIRMACION',
       totp_secret_ciphertext = VALUES(totp_secret_ciphertext),
       totp_secret_nonce = VALUES(totp_secret_nonce),
       totp_secret_tag = VALUES(totp_secret_tag),
       totp_activado_en = NULL,
       totp_ultimo_timestep_usado = NULL,
       intentos_fallidos = 0,
       bloqueado_hasta = NULL`,
    [usuarioId, ciphertext, nonce, tag]
  );
}

async function confirmarEnrolamiento(usuarioId) {
  const [result] = await pool.query(
    `UPDATE administradores_mfa SET estado = 'ACTIVO', totp_activado_en = NOW()
     WHERE administrador_id = ? AND estado = 'PENDIENTE_CONFIRMACION'`,
    [usuarioId]
  );
  return result.affectedRows > 0;
}

async function marcarTimestepUsado({ usuarioId, timestep }) {
  const [result] = await pool.query(
    `UPDATE administradores_mfa
     SET totp_ultimo_timestep_usado = ?
     WHERE administrador_id = ? AND (totp_ultimo_timestep_usado IS NULL OR totp_ultimo_timestep_usado < ?)`,
    [timestep, usuarioId, timestep]
  );
  return result.affectedRows > 0;
}

async function registrarIntentoFallido({ usuarioId, umbral, bloqueoSegundos }) {
  await pool.query(
    `UPDATE administradores_mfa
     SET intentos_fallidos = intentos_fallidos + 1,
         bloqueado_hasta = IF(intentos_fallidos + 1 >= ?, DATE_ADD(NOW(), INTERVAL ? SECOND), bloqueado_hasta)
     WHERE administrador_id = ?`,
    [umbral, bloqueoSegundos, usuarioId]
  );
}

async function resetearIntentosFallidos(usuarioId) {
  await pool.query(
    'UPDATE administradores_mfa SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE administrador_id = ?',
    [usuarioId]
  );
}

async function reemplazarCodigosRecuperacion({ usuarioId, hashes }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM administradores_mfa_codigos_recuperacion WHERE administrador_id = ?', [
      usuarioId
    ]);
    if (hashes.length > 0) {
      const filas = hashes.map((hash) => [usuarioId, hash]);
      await connection.query(
        'INSERT INTO administradores_mfa_codigos_recuperacion (administrador_id, codigo_hash) VALUES ?',
        [filas]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Devuelve TODAS las filas (usadas y no usadas): ver clienteMfaRepository.js#obtenerCodigosRecuperacion.
async function obtenerCodigosRecuperacion(usuarioId) {
  const [rows] = await pool.query(
    'SELECT id, codigo_hash, usado_en FROM administradores_mfa_codigos_recuperacion WHERE administrador_id = ?',
    [usuarioId]
  );
  return rows;
}

async function consumirCodigoRecuperacion({ id, usuarioId }) {
  const [result] = await pool.query(
    `UPDATE administradores_mfa_codigos_recuperacion SET usado_en = NOW()
     WHERE id = ? AND administrador_id = ? AND usado_en IS NULL`,
    [id, usuarioId]
  );
  return result.affectedRows > 0;
}

module.exports = {
  obtenerEstado,
  iniciarEnrolamiento,
  confirmarEnrolamiento,
  marcarTimestepUsado,
  registrarIntentoFallido,
  resetearIntentosFallidos,
  reemplazarCodigosRecuperacion,
  obtenerCodigosRecuperacion,
  consumirCodigoRecuperacion
};
