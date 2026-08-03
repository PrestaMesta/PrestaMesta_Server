const Auditoria = require('../models/Auditoria');

// Nunca recibe ni persiste password, tokens JWT ni secretos: `detalles` solo debe llevar
// ids, estados y textos cortos ya validados (motivo con longitud maxima), nunca el body
// crudo de la peticion.
async function registrar({ usuarioId, tipoUsuario, accion, detalles, ip }) {
  await Auditoria.create({ usuarioId, tipoUsuario, accion, detalles, ip });
}

module.exports = { registrar };
