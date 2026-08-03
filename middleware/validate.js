const AppError = require('../utils/AppError');

// Middleware generico de validacion. Solo soporta 'body' y 'params': ningun endpoint
// actual usa query params, y en Express 5 sobreescribir req.query no esta garantizado
// (es una propiedad derivada), asi que se evita ese caso hasta que exista una necesidad
// real en vez de anadir soporte especulativo sin poder probarlo.
function validate(schema, source = 'body') {
  if (source !== 'body' && source !== 'params') {
    throw new Error(`validate(): source "${source}" no soportado (usa "body" o "params")`);
  }

  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const detalles = result.error.issues.map((issue) => ({
        campo: issue.path.join('.') || source,
        mensaje: issue.message
      }));
      return next(
        new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son validos.', detalles)
      );
    }
    req[source] = result.data;
    next();
  };
}

module.exports = validate;
