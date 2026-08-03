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

  return { crearCredito, listarCreditos, solicitarPrestamo, cambiarEstado };
}

module.exports = createPrestamoService();
module.exports.createPrestamoService = createPrestamoService;
