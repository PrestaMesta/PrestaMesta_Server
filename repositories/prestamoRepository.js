const pool = require('../config/db.mysql');
const { inicioDelDia, inicioDelDiaSiguiente } = require('../utils/rangoFechas');

// Orden fijo (no configurable por el cliente) de los listados de prestamos: mas reciente
// primero, con `id` como desempate estable cuando dos filas comparten fecha_solicitud
// (misma resolucion de TIMESTAMP). Coincide con el indice compuesto agregado en
// migrations/006_prestamos_indices.sql.
const ORDEN_LISTADO = 'ORDER BY p.fecha_solicitud DESC, p.id DESC';

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

// --- Listados y detalle (solo lectura) para GET /client/prestamos y GET /admin/prestamos ---
//
// `total` se calcula con un SELECT COUNT(*) separado, siempre sobre `prestamos` sola (sin
// los JOIN de clientes/creditos/avales que usan las consultas de filas): ninguno de los
// filtros disponibles (cliente_id, credito_id, estado, fecha_solicitud) vive en una tabla
// distinta a `prestamos`, asi que el JOIN no cambia la cardinalidad del conteo y sumarlo
// solo agregaria trabajo innecesario.

async function listarPrestamosPorCliente({ clienteId, page, limit }) {
  const offset = (page - 1) * limit;

  const [rows] = await pool.query(
    `SELECT p.id, p.credito_id, c.nombre AS credito_nombre,
            p.monto_solicitado, p.monto_total_a_pagar, p.saldo_pendiente,
            p.estado, p.fecha_solicitud, p.fecha_decision
     FROM prestamos p
     JOIN creditos c ON c.id = p.credito_id
     WHERE p.cliente_id = ?
     ${ORDEN_LISTADO}
     LIMIT ? OFFSET ?`,
    [clienteId, limit, offset]
  );

  const [countRows] = await pool.query(
    'SELECT COUNT(*) AS total FROM prestamos WHERE cliente_id = ?',
    [clienteId]
  );

  return { rows, total: countRows[0].total };
}

// WHERE id = ? AND cliente_id = ? en la MISMA query: el filtro de propiedad va dentro del
// SQL (no en una capa aparte) para que un id que existe pero pertenece a otro cliente nunca
// devuelva la fila -- se ve identico a un id inexistente (0 filas), cerrando el mismo
// oraculo de enumeracion que ya evitan los logins.
async function obtenerPrestamoClientePorId({ prestamoId, clienteId }) {
  const [rows] = await pool.query(
    `SELECT p.id, p.credito_id, c.nombre AS credito_nombre,
            p.monto_solicitado, p.monto_total_a_pagar, p.saldo_pendiente,
            p.estado, p.fecha_solicitud, p.fecha_decision,
            a.id AS aval_id, a.nombre AS aval_nombre, a.telefono AS aval_telefono,
            a.direccion AS aval_direccion, a.ingreso_mensual AS aval_ingreso_mensual
     FROM prestamos p
     JOIN creditos c ON c.id = p.credito_id
     LEFT JOIN avales a ON a.prestamo_id = p.id
     WHERE p.id = ? AND p.cliente_id = ?`,
    [prestamoId, clienteId]
  );
  return rows[0] || null;
}

// Construye clausulas WHERE + parametros para los filtros administrativos. Los nombres de
// columna son literales fijos en el codigo (nunca derivados del input del cliente); los
// UNICOS valores que vienen del cliente entran siempre como parametros (?), nunca
// interpolados en el texto SQL.
function construirFiltrosAdmin(filtros) {
  const clausulas = [];
  const params = [];

  if (filtros.estado) {
    clausulas.push('p.estado = ?');
    params.push(filtros.estado);
  }
  if (filtros.clienteId) {
    clausulas.push('p.cliente_id = ?');
    params.push(filtros.clienteId);
  }
  if (filtros.creditoId) {
    clausulas.push('p.credito_id = ?');
    params.push(filtros.creditoId);
  }
  if (filtros.fechaDesde) {
    clausulas.push('p.fecha_solicitud >= ?');
    params.push(inicioDelDia(filtros.fechaDesde));
  }
  if (filtros.fechaHasta) {
    clausulas.push('p.fecha_solicitud < ?');
    params.push(inicioDelDiaSiguiente(filtros.fechaHasta));
  }

  return {
    where: clausulas.length > 0 ? `WHERE ${clausulas.join(' AND ')}` : '',
    params
  };
}

async function listarPrestamosAdmin({ filtros, page, limit }) {
  const offset = (page - 1) * limit;
  const { where, params } = construirFiltrosAdmin(filtros);

  const [rows] = await pool.query(
    `SELECT p.id, p.cliente_id, cl.nombre AS cliente_nombre, cl.email AS cliente_email,
            p.credito_id, cr.nombre AS credito_nombre,
            p.monto_solicitado, p.monto_total_a_pagar, p.saldo_pendiente,
            p.estado, p.fecha_solicitud, p.fecha_decision
     FROM prestamos p
     JOIN clientes cl ON cl.id = p.cliente_id
     JOIN creditos cr ON cr.id = p.credito_id
     ${where}
     ${ORDEN_LISTADO}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM prestamos p ${where}`,
    params
  );

  return { rows, total: countRows[0].total };
}

async function obtenerPrestamoAdminPorId(prestamoId) {
  const [rows] = await pool.query(
    `SELECT p.id,
            p.cliente_id, cl.nombre AS cliente_nombre, cl.email AS cliente_email,
            cl.telefono AS cliente_telefono,
            p.credito_id, cr.nombre AS credito_nombre, cr.monto_minimo, cr.monto_maximo,
            cr.tasa_interes_anual, cr.plazo_meses, cr.creado_en AS credito_creado_en,
            p.monto_solicitado, p.monto_total_a_pagar, p.saldo_pendiente,
            p.estado, p.fecha_solicitud, p.fecha_decision,
            a.id AS aval_id, a.nombre AS aval_nombre, a.telefono AS aval_telefono,
            a.direccion AS aval_direccion, a.ingreso_mensual AS aval_ingreso_mensual
     FROM prestamos p
     JOIN clientes cl ON cl.id = p.cliente_id
     JOIN creditos cr ON cr.id = p.credito_id
     LEFT JOIN avales a ON a.prestamo_id = p.id
     WHERE p.id = ?`,
    [prestamoId]
  );
  return rows[0] || null;
}

module.exports = {
  crearCredito,
  listarCreditos,
  obtenerCreditoPorId,
  crearSolicitud,
  cambiarEstado,
  listarPrestamosPorCliente,
  obtenerPrestamoClientePorId,
  listarPrestamosAdmin,
  obtenerPrestamoAdminPorId
};
