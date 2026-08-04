const AppError = require('../utils/AppError');

// Middleware generico de validacion. Soporta 'body', 'params' y 'query'.
//
// 'query' es un caso especial: en Express 5, `req.query` es una propiedad derivada y
// reasignarla (`req.query = result.data`) no persiste de forma garantizada (verificado
// empiricamente: una reasignacion directa se pierde silenciosamente). Por eso, cuando
// source es 'query', el resultado parseado/coercionado se escribe en `req.queryValidada`
// en vez de sobreescribir `req.query`; los controladores que necesitan query params ya
// validados leen de ahi.
function validate(schema, source = 'body') {
  if (source !== 'body' && source !== 'params' && source !== 'query') {
    throw new Error(`validate(): source "${source}" no soportado (usa "body", "params" o "query")`);
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

    if (source === 'query') {
      req.queryValidada = result.data;
    } else {
      req[source] = result.data;
    }
    next();
  };
}

module.exports = validate;
