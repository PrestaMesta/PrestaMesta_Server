const {
  verifyClienteSessionToken,
  verifyAdminSessionToken,
  verifyAnySessionToken,
  verifyClientePreMfaToken,
  verifyAdminPreMfaToken
} = require('../utils/jwt');
const AppError = require('../utils/AppError');

function extraerToken(req) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Formato: "Bearer TOKEN"
  if (!token) {
    throw new AppError(401, 'TOKEN_INVALID', 'Acceso denegado. Token no proporcionado.');
  }
  return token;
}

// Exige un token de SESION de CLIENTE (audiencia env.JWT_AUD_CLIENTE + token_use='session').
// Un token administrativo o un token pre-MFA, aunque tengan firma valida, son rechazados
// aqui porque su audiencia/token_use no coinciden.
function verificarTokenCliente(req, res, next) {
  try {
    req.usuario = verifyClienteSessionToken(extraerToken(req));
    next();
  } catch (error) {
    next(error);
  }
}

// Exige un token de SESION de ADMIN. Solo confirma lo que dice el JWT (tipoUsuario/rol en
// el momento en que se emitio el token); para acciones sensibles se debe encadenar ademas
// middleware/cargarAdministradorActual.js, que relee rol/activo directo de la base de datos.
function verificarTokenAdmin(req, res, next) {
  try {
    req.usuario = verifyAdminSessionToken(extraerToken(req));
    next();
  } catch (error) {
    next(error);
  }
}

// Unico uso: GET /prestamos/creditos, el unico endpoint leido tanto por clientes como por
// administradores. Acepta cualquiera de las dos audiencias de SESION conocidas (nunca un
// token pre-MFA de ningun dominio).
function verificarTokenClienteOAdmin(req, res, next) {
  try {
    req.usuario = verifyAnySessionToken(extraerToken(req));
    next();
  } catch (error) {
    next(error);
  }
}

// Exige un token PRE-MFA de cliente (audiencia env.JWT_AUD_CLIENTE_PRE_MFA +
// token_use='pre_mfa'), emitido por POST /client/auth/login tras verificar el password. Un
// token de sesion completa nunca sirve aqui: las rutas de enrolamiento/desafio MFA
// (mfa/enroll, mfa/enroll/confirm, mfa/verify) son las UNICAS que aceptan este tipo de
// token.
function verificarTokenClientePreMfa(req, res, next) {
  try {
    req.usuario = verifyClientePreMfaToken(extraerToken(req));
    next();
  } catch (error) {
    next(error);
  }
}

// Equivalente de verificarTokenClientePreMfa para el dominio de administradores.
function verificarTokenAdminPreMfa(req, res, next) {
  try {
    req.usuario = verifyAdminPreMfaToken(extraerToken(req));
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  verificarTokenCliente,
  verificarTokenAdmin,
  verificarTokenClienteOAdmin,
  verificarTokenClientePreMfa,
  verificarTokenAdminPreMfa
};
