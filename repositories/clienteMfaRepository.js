// Persistencia MFA de clientes (Checkpoint 6B-1). Mismo shape que
// repositories/administradorMfaRepository.js a proposito: services/mfaService.js es
// agnostico de dominio y funciona igual con cualquiera de los dos repos (parametro
// `usuarioId` generico en la firma de cada funcion, aunque la columna real en SQL sea
// `cliente_id`). Ninguna funcion de este archivo se invoca todavia desde ningun
// controller/route -- ver services/mfaService.js.
const pool = require('../config/db.mysql');

async function obtenerEstado(usuarioId) {
  const [rows] = await pool.query('SELECT * FROM clientes_mfa WHERE cliente_id = ?', [usuarioId]);
  return rows[0] || null;
}

// Upsert: primer enrolamiento (no existe fila) o re-enrolamiento (fila ya existe, con
// cualquier estado previo). Un secreto nuevo SIEMPRE reinicia contadores/anti-replay: no
// hereda el estado de repeticion/bloqueo del secreto anterior.
async function iniciarEnrolamiento({ usuarioId, ciphertext, nonce, tag }) {
  await pool.query(
    `INSERT INTO clientes_mfa
       (cliente_id, estado, totp_secret_ciphertext, totp_secret_nonce, totp_secret_tag,
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

// Transicion condicional PENDIENTE_CONFIRMACION -> ACTIVO (mismo patron de UPDATE
// condicional que repositories/prestamoRepository.js#cambiarEstado). Devuelve false si la
// fila no existe o ya no esta PENDIENTE_CONFIRMACION.
async function confirmarEnrolamiento(usuarioId) {
  const [result] = await pool.query(
    `UPDATE clientes_mfa SET estado = 'ACTIVO', totp_activado_en = NOW()
     WHERE cliente_id = ? AND estado = 'PENDIENTE_CONFIRMACION'`,
    [usuarioId]
  );
  return result.affectedRows > 0;
}

// Anti-replay atomico: UPDATE condicional bajo el lock de fila de MySQL. Dos llamadas
// concurrentes con el MISMO timestep (o un timestep <= al ya registrado) solo dejan pasar a
// una -- la segunda ve `affectedRows === 0`. MySQL serializa el UPDATE por fila, no hace
// falta ningun lock explicito en JS (mismo principio que el SELECT ... FOR UPDATE de
// prestamos, pero aqui un UPDATE condicional simple basta porque no hay una segunda
// escritura que depender de una lectura previa).
async function marcarTimestepUsado({ usuarioId, timestep }) {
  const [result] = await pool.query(
    `UPDATE clientes_mfa
     SET totp_ultimo_timestep_usado = ?
     WHERE cliente_id = ? AND (totp_ultimo_timestep_usado IS NULL OR totp_ultimo_timestep_usado < ?)`,
    [timestep, usuarioId, timestep]
  );
  return result.affectedRows > 0;
}

// Umbral y duracion de bloqueo son parametros (no constantes en este archivo): la decision
// de negocio de "cuantos intentos" y "cuanto tiempo" vive en services/mfaService.js /
// config/env.js, nunca hardcodeada en la capa de acceso a datos.
async function registrarIntentoFallido({ usuarioId, umbral, bloqueoSegundos }) {
  await pool.query(
    `UPDATE clientes_mfa
     SET intentos_fallidos = intentos_fallidos + 1,
         bloqueado_hasta = IF(intentos_fallidos + 1 >= ?, DATE_ADD(NOW(), INTERVAL ? SECOND), bloqueado_hasta)
     WHERE cliente_id = ?`,
    [umbral, bloqueoSegundos, usuarioId]
  );
}

async function resetearIntentosFallidos(usuarioId) {
  await pool.query(
    'UPDATE clientes_mfa SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE cliente_id = ?',
    [usuarioId]
  );
}

// Reemplaza TODO el lote de codigos de recuperacion (borra los anteriores, incluidos los no
// usados, e inserta el lote nuevo) en una sola transaccion: se usa tanto en la primera
// generacion (no hay nada que borrar) como en una regeneracion futura (invalida los
// anteriores no usados, ver docs/mfa-identidad-ine.md seccion 3.4).
async function reemplazarCodigosRecuperacion({ usuarioId, hashes }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM clientes_mfa_codigos_recuperacion WHERE cliente_id = ?', [usuarioId]);
    if (hashes.length > 0) {
      const filas = hashes.map((hash) => [usuarioId, hash]);
      await connection.query('INSERT INTO clientes_mfa_codigos_recuperacion (cliente_id, codigo_hash) VALUES ?', [
        filas
      ]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Devuelve TODAS las filas (usadas y no usadas): services/mfaService.js necesita saber si
// un codigo que coincide ya estaba consumido (para responder RECOVERY_CODE_ALREADY_USED en
// vez de "codigo invalido"), no solo cuales siguen disponibles.
async function obtenerCodigosRecuperacion(usuarioId) {
  const [rows] = await pool.query(
    'SELECT id, codigo_hash, usado_en FROM clientes_mfa_codigos_recuperacion WHERE cliente_id = ?',
    [usuarioId]
  );
  return rows;
}

// Consumo de un solo uso, mismo patron de UPDATE condicional atomico que
// marcarTimestepUsado: dos intentos concurrentes de consumir el MISMO codigo solo dejan
// pasar a uno.
async function consumirCodigoRecuperacion({ id, usuarioId }) {
  const [result] = await pool.query(
    `UPDATE clientes_mfa_codigos_recuperacion SET usado_en = NOW()
     WHERE id = ? AND cliente_id = ? AND usado_en IS NULL`,
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
