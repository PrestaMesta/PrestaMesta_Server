const AppError = require('../utils/AppError');

// Requiere que verificarTokenAdmin Y cargarAdministradorActual ya hayan corrido, en ese
// orden. Autoriza usando req.administradorActual.rol (releido de BD), nunca el rol que
// venga en el JWT: el JWT puede estar desactualizado si cambiaron el rol o desactivaron
// al administrador despues de emitido el token.
function autorizarRoles(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.administradorActual) {
      return next(new AppError(403, 'FORBIDDEN', 'Acceso restringido para administradores.'));
    }
    if (rolesPermitidos.length > 0 && !rolesPermitidos.includes(req.administradorActual.rol)) {
      return next(new AppError(403, 'FORBIDDEN', 'Tu rol no tiene permiso para esta accion.'));
    }
    next();
  };
}

module.exports = { autorizarRoles };
