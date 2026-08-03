const administradorRepositoryReal = require('../repositories/administradorRepository');
const AppError = require('../utils/AppError');

// Debe correr DESPUES de verificarTokenAdmin. Relee rol/activo directo de la base de
// datos: el rol/estado del JWT puede haber quedado desactualizado si al administrador lo
// desactivaron o le cambiaron el rol despues de emitido el token. Toda ruta administrativa
// que autorice por rol debe usar req.administradorActual.rol (fuente de verdad en BD),
// nunca req.usuario.rol (que viene del JWT y puede estar obsoleto).
function crearCargarAdministradorActual({ administradorRepository } = {}) {
  const repo = administradorRepository || administradorRepositoryReal;

  return async function cargarAdministradorActual(req, res, next) {
    try {
      const admin = await repo.obtenerActivoPorId(Number(req.usuario.sub));
      if (!admin) {
        return next(new AppError(401, 'TOKEN_INVALID', 'Token invalido.'));
      }
      req.administradorActual = admin;
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = crearCargarAdministradorActual();
module.exports.crearCargarAdministradorActual = crearCargarAdministradorActual;
