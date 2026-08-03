const crypto = require('crypto');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

// Genera un requestId por peticion y lo expone en req para que el resto del pipeline
// (controllers/services) lo pueda usar en logs de correlacion.
function requestId(req, res, next) {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

// Envelope de error estable: { mensaje, codigo, requestId }. Nunca incluye mensajes de
// SQL/Mongo crudos, stack traces, rutas de archivo, detalles de parseo de JWT ni nombres
// de excepciones internas, en ningun entorno (no solo produccion) — la unica informacion
// adicional que se expone es `detalles` de errores operacionales de validacion (400), que
// ya estan pensados para mostrarse al usuario.
// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  const esAppError = error instanceof AppError;
  const status = esAppError ? error.status : 500;
  const codigo = esAppError ? error.codigo : 'INTERNAL_ERROR';
  const mensaje = esAppError ? error.message : 'No fue posible procesar la solicitud.';

  logger.error('Error manejando peticion', {
    requestId: req.requestId,
    ruta: `${req.method} ${req.originalUrl}`,
    codigo,
    status,
    // Solo el nombre/mensaje del error para diagnostico interno del operador via logs de
    // servidor (no se envia al cliente); nunca se registran secretos porque ningun
    // controlador/servicio los pasa como parte del mensaje de error.
    errorInterno: esAppError ? undefined : error.message
  });

  const body = { mensaje, codigo, requestId: req.requestId };
  if (esAppError && error.detalles) {
    body.detalles = error.detalles;
  }

  res.status(status).json(body);
}

function notFoundHandler(req, res) {
  res.status(404).json({
    mensaje: 'Recurso no encontrado.',
    codigo: 'NOT_FOUND',
    requestId: req.requestId
  });
}

module.exports = { requestId, errorHandler, notFoundHandler };
