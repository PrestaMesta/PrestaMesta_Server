const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('./AppError');

const ALGORITHM = 'HS256';

// Contrato de claims (Checkpoint 2, revisado): sub, email, tipoUsuario, rol (solo admin),
// iss, aud, iat, exp. Nunca se incluye password ni datos personales innecesarios.
//
// Cliente y administrador usan AUDIENCIAS DISTINTAS (env.JWT_AUD_CLIENTE / JWT_AUD_ADMIN),
// no solo tipoUsuario. Esto separa criptograficamente los dos contextos: un token de
// cliente no puede pasar jwt.verify() en una ruta administrativa (falla la validacion de
// audience) aunque la firma sea perfectamente valida, y viceversa.
function signClienteToken(cliente) {
  return jwt.sign(
    { sub: String(cliente.id), email: cliente.email, tipoUsuario: 'CLIENTE' },
    env.JWT_SECRET,
    {
      algorithm: ALGORITHM,
      expiresIn: env.JWT_EXPIRES_IN,
      issuer: env.JWT_ISS,
      audience: env.JWT_AUD_CLIENTE
    }
  );
}

function signAdminToken(admin) {
  return jwt.sign(
    { sub: String(admin.id), email: admin.email, tipoUsuario: 'ADMIN', rol: admin.rol },
    env.JWT_SECRET,
    {
      algorithm: ALGORITHM,
      expiresIn: env.JWT_EXPIRES_IN,
      issuer: env.JWT_ISS,
      audience: env.JWT_AUD_ADMIN
    }
  );
}

// Traduce cualquier fallo de jwt.verify a un AppError. Se distingue TOKEN_EXPIRED de
// TOKEN_INVALID porque es informacion inofensiva para el cliente legitimo (le permite
// decidir "vuelve a iniciar sesion" vs "algo raro paso"), a diferencia de, por ejemplo,
// distinguir "email no existe" de "password incorrecto" en login (ahi si se colapsa todo a
// un mismo mensaje/status, ver services/*AuthService.js). Ningun otro detalle interno del
// fallo (firma invalida, malformado, audience/issuer incorrectos) se distingue: todos caen
// en TOKEN_INVALID.
function traducirErrorJwt(error) {
  if (error instanceof jwt.TokenExpiredError) {
    return new AppError(401, 'TOKEN_EXPIRED', 'Tu sesion expiro, inicia sesion de nuevo.');
  }
  return new AppError(401, 'TOKEN_INVALID', 'Token invalido.');
}

function verificarClaimsBase(payload) {
  if (!payload.sub || !payload.email || !payload.tipoUsuario) {
    throw new AppError(401, 'TOKEN_INVALID', 'Token invalido.');
  }
}

// Verifica un token que debe pertenecer a un CLIENTE: firma, algoritmo, issuer, la
// audiencia especifica de clientes, expiracion, y sub/email/tipoUsuario==='CLIENTE'.
function verifyClienteToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [ALGORITHM],
      issuer: env.JWT_ISS,
      audience: env.JWT_AUD_CLIENTE
    });
  } catch (error) {
    throw traducirErrorJwt(error);
  }
  verificarClaimsBase(payload);
  if (payload.tipoUsuario !== 'CLIENTE') {
    throw new AppError(401, 'TOKEN_INVALID', 'Token invalido.');
  }
  return payload;
}

// Verifica un token que debe pertenecer a un ADMIN: firma, algoritmo, issuer, la audiencia
// especifica de administradores, expiracion, y sub/email/tipoUsuario==='ADMIN'/rol
// presente. Esto NO reemplaza la re-verificacion en base de datos para acciones sensibles
// (ver middleware/cargarAdministradorActual.js): el rol/estado del JWT puede haber
// quedado desactualizado si el administrador fue desactivado o le cambiaron el rol
// despues de emitido el token.
function verifyAdminToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [ALGORITHM],
      issuer: env.JWT_ISS,
      audience: env.JWT_AUD_ADMIN
    });
  } catch (error) {
    throw traducirErrorJwt(error);
  }
  verificarClaimsBase(payload);
  if (payload.tipoUsuario !== 'ADMIN' || !payload.rol) {
    throw new AppError(401, 'TOKEN_INVALID', 'Token invalido.');
  }
  return payload;
}

// Unico uso: GET /prestamos/creditos, el unico endpoint leido tanto por clientes como por
// administradores. Acepta cualquiera de las dos audiencias conocidas, pero sigue
// exigiendo que tipoUsuario sea coherente con la audiencia usada (nunca acepta una
// audiencia/tipoUsuario cruzados).
function verifyAnyToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [ALGORITHM],
      issuer: env.JWT_ISS,
      audience: [env.JWT_AUD_CLIENTE, env.JWT_AUD_ADMIN]
    });
  } catch (error) {
    throw traducirErrorJwt(error);
  }
  verificarClaimsBase(payload);
  if (payload.tipoUsuario === 'ADMIN' && !payload.rol) {
    throw new AppError(401, 'TOKEN_INVALID', 'Token invalido.');
  }
  if (payload.tipoUsuario !== 'CLIENTE' && payload.tipoUsuario !== 'ADMIN') {
    throw new AppError(401, 'TOKEN_INVALID', 'Token invalido.');
  }
  return payload;
}

module.exports = {
  signClienteToken,
  signAdminToken,
  verifyClienteToken,
  verifyAdminToken,
  verifyAnyToken,
  ALGORITHM
};
