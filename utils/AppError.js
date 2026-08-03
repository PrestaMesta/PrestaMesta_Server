// Error de aplicacion con forma estable: { mensaje, codigo }. El middleware de errores
// (middleware/errorHandler.js) le agrega requestId antes de responder. Nunca lleva
// mensajes de SQL/Mongo crudos, stack traces, rutas de archivo ni detalles de JWT: esos
// detalles, si existen, van en `detalles` y el error handler decide si son seguros de
// exponer (solo para errores operacionales como 400 de validacion).
class AppError extends Error {
  constructor(status, codigo, mensaje, detalles) {
    super(mensaje);
    this.name = 'AppError';
    this.status = status;
    this.codigo = codigo;
    this.detalles = detalles;
    this.esOperacional = true; // distingue errores esperados (4xx) de bugs no manejados
  }
}

module.exports = AppError;
