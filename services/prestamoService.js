const AppError = require('../utils/AppError');
const { calcularMontoTotalAPagar } = require('../utils/money');
const logger = require('../utils/logger');
const prestamoRepositoryReal = require('../repositories/prestamoRepository');
const auditoriaRepositoryReal = require('../repositories/auditoriaRepository');

function createPrestamoService({ prestamoRepository, auditoriaRepository } = {}) {
  const repo = prestamoRepository || prestamoRepositoryReal;
  const auditRepo = auditoriaRepository || auditoriaRepositoryReal;

  async function crearCredito(datos) {
    const creditoId = await repo.crearCredito(datos);
    return { creditoId };
  }

  async function listarCreditos() {
    return repo.listarCreditos();
  }

  // monto_total_a_pagar y saldo_pendiente SIEMPRE se calculan aqui, nunca se aceptan del
  // cliente (los validadores de entrada ya los rechazan si vienen en el body, esto es la
  // segunda capa de defensa). credito_id/monto_solicitado si vienen del cliente, pero se
  // validan contra el catalogo real leido de BD, no contra nada que el cliente afirme.
  async function solicitarPrestamo({ clienteId, credito_id: creditoId, monto_solicitado: montoSolicitado, aval }) {
    const credito = await repo.obtenerCreditoPorId(creditoId);
    if (!credito) {
      throw new AppError(404, 'CREDIT_NOT_FOUND', 'Tipo de credito no encontrado.');
    }

    const montoMinimo = Number(credito.monto_minimo);
    const montoMaximo = Number(credito.monto_maximo);
    if (montoSolicitado < montoMinimo || montoSolicitado > montoMaximo) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `El monto debe estar entre ${montoMinimo} y ${montoMaximo}.`
      );
    }

    const montoTotalAPagar = calcularMontoTotalAPagar({
      montoSolicitado,
      tasaInteresAnual: Number(credito.tasa_interes_anual),
      plazoMeses: credito.plazo_meses
    });

    const { prestamoId, fechaSolicitud } = await repo.crearSolicitud({
      clienteId,
      creditoId,
      montoSolicitado,
      montoTotalAPagar,
      aval
    });

    return { prestamoId, fechaSolicitud, montoSolicitado, montoTotalAPagar, estado: 'PENDIENTE' };
  }

  // Ver repositories/prestamoRepository.js#cambiarEstado para el detalle de la
  // transaccion atomica (SELECT ... FOR UPDATE). Aqui solo se traduce el resultado a
  // AppError con codigos estables y se registra la auditoria (best-effort, sin revertir
  // la operacion principal si falla).
  async function cambiarEstado({ prestamoId, nuevoEstado, administradorId, motivo }) {
    const fechaDecision = new Date();
    const resultado = await repo.cambiarEstado({ prestamoId, nuevoEstado, fechaDecision });

    if (resultado.resultado === 'NO_ENCONTRADO') {
      throw new AppError(404, 'LOAN_NOT_FOUND', 'Prestamo no encontrado.');
    }
    if (resultado.resultado === 'TRANSICION_INVALIDA') {
      throw new AppError(409, 'INVALID_TRANSITION', 'El prestamo ya no esta pendiente de revision.');
    }

    try {
      await auditRepo.registrar({
        usuarioId: administradorId,
        tipoUsuario: 'ADMIN',
        accion: nuevoEstado === 'APROBADO' ? 'APROBO_PRESTAMO' : 'RECHAZO_PRESTAMO',
        detalles: {
          prestamoId,
          estadoAnterior: resultado.estadoAnterior,
          estadoNuevo: nuevoEstado,
          administradorId,
          fecha: fechaDecision,
          motivo: motivo || null
        }
      });
    } catch (error) {
      logger.error('Auditoria no registrada', {
        evento: 'AUDITORIA_NO_REGISTRADA',
        prestamoId,
        administradorId,
        errorTipo: error.name || 'Error'
      });
    }

    return { prestamoId, estadoAnterior: resultado.estadoAnterior, estadoNuevo: nuevoEstado };
  }

  // --- Mapeo DB -> forma de respuesta HTTP para los listados/detalle nuevos ---
  //
  // Los montos DECIMAL llegan de mysql2 ya como string (comportamiento por defecto del
  // driver, sin `decimalNumbers` habilitado) y se devuelven tal cual, sin convertir a
  // Number: esto es deliberadamente distinto de la respuesta de POST /prestamos/solicitar
  // (montoSolicitado ahi es el number que envio el cliente en el body, nunca se relee de
  // BD). Es una asimetria real entre endpoints, documentada aqui y en openapi.yaml, no
  // normalizada silenciosamente para que ambas formas "se vean iguales".
  function mapCreditoResumen(row) {
    return { id: row.credito_id, nombre: row.credito_nombre };
  }

  function mapPrestamoCliente(row) {
    return {
      id: row.id,
      credito: mapCreditoResumen(row),
      monto_solicitado: row.monto_solicitado,
      monto_total_a_pagar: row.monto_total_a_pagar,
      saldo_pendiente: row.saldo_pendiente,
      estado: row.estado,
      fecha_solicitud: row.fecha_solicitud,
      fecha_decision: row.fecha_decision ?? null
    };
  }

  // `aval_id` viene NULL cuando el LEFT JOIN no encontro fila (prestamo sin aval): en ese
  // caso el objeto aval completo es null, nunca un objeto con campos vacios/cero. Cuando SI
  // hay aval, cada campo opcional se pasa tal cual llego de la base (`??` en vez de `||`,
  // para no convertir por accidente un "0.00" real -- valor truthy, pero igual se evita el
  // patron `||` en todo este mapeo por consistencia) -- nunca se fuerza a '' ni a 0.
  function mapAval(row) {
    if (row.aval_id == null) return null;
    return {
      id: row.aval_id,
      nombre: row.aval_nombre,
      telefono: row.aval_telefono,
      direccion: row.aval_direccion ?? null,
      ingreso_mensual: row.aval_ingreso_mensual ?? null
    };
  }

  function mapPrestamoClienteDetalle(row) {
    return { ...mapPrestamoCliente(row), aval: mapAval(row) };
  }

  function mapClienteResumen(row) {
    return { id: row.cliente_id, nombre: row.cliente_nombre, email: row.cliente_email };
  }

  function mapPrestamoAdminListItem(row) {
    return {
      id: row.id,
      cliente: mapClienteResumen(row),
      credito: mapCreditoResumen(row),
      monto_solicitado: row.monto_solicitado,
      monto_total_a_pagar: row.monto_total_a_pagar,
      saldo_pendiente: row.saldo_pendiente,
      estado: row.estado,
      fecha_solicitud: row.fecha_solicitud,
      fecha_decision: row.fecha_decision ?? null
    };
  }

  function mapPrestamoAdminDetalle(row) {
    return {
      id: row.id,
      cliente: {
        id: row.cliente_id,
        nombre: row.cliente_nombre,
        email: row.cliente_email,
        telefono: row.cliente_telefono ?? null
      },
      credito: {
        id: row.credito_id,
        nombre: row.credito_nombre,
        monto_minimo: row.monto_minimo,
        monto_maximo: row.monto_maximo,
        tasa_interes_anual: row.tasa_interes_anual,
        plazo_meses: row.plazo_meses,
        creado_en: row.credito_creado_en
      },
      monto_solicitado: row.monto_solicitado,
      monto_total_a_pagar: row.monto_total_a_pagar,
      saldo_pendiente: row.saldo_pendiente,
      estado: row.estado,
      fecha_solicitud: row.fecha_solicitud,
      fecha_decision: row.fecha_decision ?? null,
      aval: mapAval(row)
    };
  }

  function construirPaginacion({ page, limit, total }) {
    return {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit)
    };
  }

  async function listarPrestamosCliente({ clienteId, page, limit }) {
    const { rows, total } = await repo.listarPrestamosPorCliente({ clienteId, page, limit });
    return {
      data: rows.map(mapPrestamoCliente),
      pagination: construirPaginacion({ page, limit, total })
    };
  }

  async function obtenerPrestamoCliente({ clienteId, prestamoId }) {
    const row = await repo.obtenerPrestamoClientePorId({ prestamoId, clienteId });
    if (!row) {
      throw new AppError(404, 'LOAN_NOT_FOUND', 'Prestamo no encontrado.');
    }
    return mapPrestamoClienteDetalle(row);
  }

  async function listarPrestamosAdmin({ filtros, page, limit }) {
    const { rows, total } = await repo.listarPrestamosAdmin({ filtros, page, limit });
    return {
      data: rows.map(mapPrestamoAdminListItem),
      pagination: construirPaginacion({ page, limit, total })
    };
  }

  async function obtenerPrestamoAdmin({ prestamoId }) {
    const row = await repo.obtenerPrestamoAdminPorId(prestamoId);
    if (!row) {
      throw new AppError(404, 'LOAN_NOT_FOUND', 'Prestamo no encontrado.');
    }
    return mapPrestamoAdminDetalle(row);
  }

  return {
    crearCredito,
    listarCreditos,
    solicitarPrestamo,
    cambiarEstado,
    listarPrestamosCliente,
    obtenerPrestamoCliente,
    listarPrestamosAdmin,
    obtenerPrestamoAdmin
  };
}

module.exports = createPrestamoService();
module.exports.createPrestamoService = createPrestamoService;
