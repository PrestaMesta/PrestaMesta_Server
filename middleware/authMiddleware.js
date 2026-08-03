const { verifyClienteToken, verifyAdminToken, verifyAnyToken } = require('../utils/jwt');
const AppError = require('../utils/AppError');

function extraerToken(req) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Formato: "Bearer TOKEN"
  if (!token) {
    throw new AppError(401, 'TOKEN_INVALID', 'Acceso denegado. Token no proporcionado.');
  }
  return token;
}

// Exige un token de CLIENTE (audiencia env.JWT_AUD_CLIENTE). Un token administrativo,
// aunque tenga firma valida, es rechazado aqui porque su audiencia no coincide.
function verificarTokenCliente(req, res, next) {
  try {
    req.usuario = verifyClienteToken(extraerToken(req));
    next();
  } catch (error) {
    next(error);
  }
}

// Exige un token de ADMIN (audiencia env.JWT_AUD_ADMIN). Solo confirma lo que dice el
// JWT (tipoUsuario/rol en el momento en que se emitio el token); para acciones sensibles
// se debe encadenar ademas middleware/cargarAdministradorActual.js, que relee rol/activo
// directo de la base de datos.
function verificarTokenAdmin(req, res, next) {
  try {
    req.usuario = verifyAdminToken(extraerToken(req));
    next();
  } catch (error) {
    next(error);
  }
}

// Unico uso: GET /prestamos/creditos, el unico endpoint leido tanto por clientes como por
// administradores. Acepta cualquiera de las dos audiencias conocidas.
function verificarTokenClienteOAdmin(req, res, next) {
  try {
    req.usuario = verifyAnyToken(extraerToken(req));
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { verificarTokenCliente, verificarTokenAdmin, verificarTokenClienteOAdmin };
