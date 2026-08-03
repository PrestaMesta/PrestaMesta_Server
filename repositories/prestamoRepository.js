const pool = require('../config/db.mysql');

async function crearCredito({ nombre, monto_minimo, monto_maximo, tasa_interes_anual, plazo_meses }) {
  const [result] = await pool.query(
    'INSERT INTO creditos (nombre, monto_minimo, monto_maximo, tasa_interes_anual, plazo_meses) VALUES (?, ?, ?, ?, ?)',
    [nombre, monto_minimo, monto_maximo, tasa_interes_anual, plazo_meses]
  );
  return result.insertId;
}

async function listarCreditos() {
  const [rows] = await pool.query('SELECT * FROM creditos');
  return rows;
}

async function obtenerCreditoPorId(creditoId) {
  const [rows] = await pool.query('SELECT * FROM creditos WHERE id = ?', [creditoId]);
  return rows[0] || null;
}

// Crea el prestamo y (opcionalmente) su aval en una sola transaccion: o se registran los
// dos, o no se registra ninguno. Mismo patron de conexion dedicada + beginTransaction /
// commit / rollback que ya usaba el codigo original. `fecha_solicitud` la fija MySQL
// (DEFAULT CURRENT_TIMESTAMP, ver migrations/004_prestamos.sql); se relee dentro de la
// misma transaccion para devolver el valor autoritativo de la base, no una aproximacion
// calculada en JS.
async function crearSolicitud({ clienteId, creditoId, montoSolicitado, montoTotalAPagar, aval }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [prestamoResult] = await connection.query(
      `INSERT INTO prestamos (cliente_id, credito_id, monto_solicitado, monto_total_a_pagar, saldo_pendiente)
       VALUES (?, ?, ?, ?, ?)`,
      [clienteId, creditoId, montoSolicitado, montoTotalAPagar, montoTotalAPagar]
    );
    const prestamoId = prestamoResult.insertId;

    if (aval) {
      await connection.query(
        `INSERT INTO avales (prestamo_id, nombre, telefono, direccion, ingreso_mensual)
         VALUES (?, ?, ?, ?, ?)`,
        [prestamoId, aval.nombre, aval.telefono, aval.direccion || null, aval.ingreso_mensual || 0]
      );
    }

    const [rows] = await connection.query(
      'SELECT fecha_solicitud FROM prestamos WHERE id = ?',
      [prestamoId]
    );

    await connection.commit();
    return { prestamoId, fechaSolicitud: rows[0].fecha_solicitud };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Transicion atomica PENDIENTE -> APROBADO|RECHAZADO (Checkpoint 2, revisado):
//   1. SELECT ... FOR UPDATE dentro de una transaccion: bloquea la fila; una segunda
//      transaccion concurrente sobre el mismo id espera aqui hasta que esta termine.
//   2. Si no existe la fila -> NO_ENCONTRADO (404, distinto de una transicion invalida).
//   3. Si existe pero no esta PENDIENTE -> TRANSICION_INVALIDA (409).
//   4. UPDATE condicional (WHERE estado = 'PENDIENTE') como defensa en profundidad ademas
//      del lock; si afecto 0 filas se trata igual como TRANSICION_INVALIDA.
//   5. COMMIT. La escritura de auditoria en Mongo ocurre DESPUES, fuera de esta funcion
//      (services/prestamoService.js), porque MySQL y MongoDB no comparten transaccion.
async function cambiarEstado({ prestamoId, nuevoEstado, fechaDecision }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      'SELECT id, estado FROM prestamos WHERE id = ? FOR UPDATE',
      [prestamoId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return { resultado: 'NO_ENCONTRADO' };
    }

    const prestamoActual = rows[0];
    if (prestamoActual.estado !== 'PENDIENTE') {
      await connection.rollback();
      return { resultado: 'TRANSICION_INVALIDA', estadoActual: prestamoActual.estado };
    }

    const [updateResult] = await connection.query(
      `UPDATE prestamos SET estado = ?, fecha_decision = ? WHERE id = ? AND estado = 'PENDIENTE'`,
      [nuevoEstado, fechaDecision, prestamoId]
    );

    if (updateResult.affectedRows === 0) {
      await connection.rollback();
      return { resultado: 'TRANSICION_INVALIDA', estadoActual: prestamoActual.estado };
    }

    await connection.commit();
    return { resultado: 'OK', estadoAnterior: prestamoActual.estado };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  crearCredito,
  listarCreditos,
  obtenerCreditoPorId,
  crearSolicitud,
  cambiarEstado
};
