const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('./AppError');

const ALGORITHM = 'HS256';

// Contrato de claims (Checkpoint 6B-2, revision de docs/mfa-identidad-ine.md seccion 2):
// sub, email, tipoUsuario, rol (solo admin, solo sesion), iss, aud, iat, exp, mas dos
// claims nuevos que separan CLASE de token dentro de un mismo dominio:
//
//   - `token_use`: 'session' | 'pre_mfa'. La audiencia sola ya separa dominio (cliente vs
//     admin); `token_use` separa PROPOSITO (sesion completa vs pre-MFA) de forma
//     independiente. Cada funcion verificadora exige audiencia Y token_use A LA VEZ --
//     ninguna de las dos señales basta por si sola (defensa en profundidad: un bug futuro
//     que firmara la audiencia correcta con el token_use equivocado, o viceversa, sigue
//     siendo rechazado).
//   - `amr`/`auth_time` (solo en tokens de sesion): con que factores y en que momento se
//     completo la autenticacion primaria. `auth_time` es un claim propio, no se reutiliza
//     `iat` (que solo dice "cuando se firmo ESTE token", no "cuando el usuario probo sus
//     credenciales" -- distincion que importa el dia que exista renovacion de tokens).
//
// jwt.verify pins `algorithms: ['HS256']` explicitamente. Nunca se mete password ni datos
// personales innecesarios en ningun token.

function ahoraEnSegundos() {
  return Math.floor(Date.now() / 1000);
}

// --- Firma: token PRE-MFA (Checkpoint 6B-2) ---
// Emitido por login tras verificar el password, ANTES de completar MFA. Deliberadamente
// minimo: sin `rol` (admin), sin `amr`, sin `auth_time` -- no debe poder autorizar ninguna
// accion de negocio ni siquiera si algun middleware futuro olvida revisar audiencia/token_use.
// Solo lo aceptan mfa/enroll, mfa/enroll/confirm y mfa/verify.

function signClientePreMfaToken(cliente) {
  return jwt.sign(
    { sub: String(cliente.id), email: cliente.email, tipoUsuario: 'CLIENTE', token_use: 'pre_mfa' },
    env.JWT_SECRET,
    {
      algorithm: ALGORITHM,
      expiresIn: env.PRE_MFA_EXPIRES_IN,
      issuer: env.JWT_ISS,
      audience: env.JWT_AUD_CLIENTE_PRE_MFA
    }
  );
}

function signAdminPreMfaToken(admin) {
  return jwt.sign(
    { sub: String(admin.id), email: admin.email, tipoUsuario: 'ADMIN', token_use: 'pre_mfa' },
    env.JWT_SECRET,
    {
      algorithm: ALGORITHM,
      expiresIn: env.PRE_MFA_EXPIRES_IN,
      issuer: env.JWT_ISS,
      audience: env.JWT_AUD_ADMIN_PRE_MFA
    }
  );
}

// --- Firma: token de SESION completa ---
// Se emite unicamente al completar MFA (enroll/confirm o mfa/verify), nunca directo desde
// login. `amr` (Authentication Methods References, RFC 8176) documenta con que factores se
// llego aqui -- ej. ['pwd','totp'] o ['pwd','recovery']; se recibe del llamador porque solo
// el/la que verifico el segundo factor sabe cual fue.

function signClienteSessionToken(cliente, { amr } = {}) {
  return jwt.sign(
    {
      sub: String(cliente.id),
      email: cliente.email,
      tipoUsuario: 'CLIENTE',
      token_use: 'session',
      amr: amr || ['pwd'],
      auth_time: ahoraEnSegundos()
    },
    env.JWT_SECRET,
    { algorithm: ALGORITHM, expiresIn: env.JWT_EXPIRES_IN, issuer: env.JWT_ISS, audience: env.JWT_AUD_CLIENTE }
  );
}

function signAdminSessionToken(admin, { amr } = {}) {
  return jwt.sign(
    {
      sub: String(admin.id),
      email: admin.email,
      tipoUsuario: 'ADMIN',
      rol: admin.rol,
      token_use: 'session',
      amr: amr || ['pwd'],
      auth_time: ahoraEnSegundos()
    },
    env.JWT_SECRET,
    { algorithm: ALGORITHM, expiresIn: env.JWT_EXPIRES_IN, issuer: env.JWT_ISS, audience: env.JWT_AUD_ADMIN }
  );
}

// Traduce cualquier fallo de jwt.verify a un AppError. Se distingue TOKEN_EXPIRED de
// TOKEN_INVALID porque es informacion inofensiva para el cliente legitimo (le permite
// decidir "vuelve a iniciar sesion" vs "algo raro paso"); ningun otro detalle del fallo
// (firma invalida, malformado, audience/issuer/token_use incorrectos) se distingue: todos
// caen en TOKEN_INVALID.
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

// --- Verificacion: SESION completa ---
// Exige audiencia Y token_use === 'session' a la vez (ver comentario del encabezado). Un
// token pre-MFA, aunque tenga la audiencia de sesion (nunca deberia, pero por defensa en
// profundidad), es rechazado aqui porque token_use no coincide.

function verifyClienteSessionToken(token) {
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
  if (payload.tipoUsuario !== 'CLIENTE' || payload.token_use !== 'session') {
    throw new AppError(401, 'TOKEN_INVALID', 'Token invalido.');
  }
  return payload;
}

function verifyAdminSessionToken(token) {
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
  if (payload.tipoUsuario !== 'ADMIN' || !payload.rol || payload.token_use !== 'session') {
    throw new AppError(401, 'TOKEN_INVALID', 'Token invalido.');
  }
  return payload;
}

// Unico uso: GET /prestamos/creditos, el unico endpoint leido tanto por clientes como por
// administradores. Acepta cualquiera de las dos audiencias de SESION conocidas, pero exige
// token_use === 'session' en ambos casos -- un token pre-MFA de cualquiera de los dos
// dominios queda excluido aqui aunque en el futuro compartiera por error una audiencia de
// sesion.
function verifyAnySessionToken(token) {
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
  if (payload.token_use !== 'session') {
    throw new AppError(401, 'TOKEN_INVALID', 'Token invalido.');
  }
  if (payload.tipoUsuario === 'ADMIN' && !payload.rol) {
    throw new AppError(401, 'TOKEN_INVALID', 'Token invalido.');
  }
  if (payload.tipoUsuario !== 'CLIENTE' && payload.tipoUsuario !== 'ADMIN') {
    throw new AppError(401, 'TOKEN_INVALID', 'Token invalido.');
  }
  return payload;
}

// --- Verificacion: PRE-MFA ---
// Exige la audiencia pre-MFA del dominio correspondiente Y token_use === 'pre_mfa'. Un
// token de sesion completa (token_use 'session') es rechazado aqui aunque de alguna forma
// compartiera audiencia: las rutas de enrolamiento/desafio MFA nunca aceptan una sesion ya
// completa en su lugar.

function verifyClientePreMfaToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [ALGORITHM],
      issuer: env.JWT_ISS,
      audience: env.JWT_AUD_CLIENTE_PRE_MFA
    });
  } catch (error) {
    throw traducirErrorJwt(error);
  }
  verificarClaimsBase(payload);
  if (payload.tipoUsuario !== 'CLIENTE' || payload.token_use !== 'pre_mfa') {
    throw new AppError(401, 'TOKEN_INVALID', 'Token invalido.');
  }
  return payload;
}

function verifyAdminPreMfaToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [ALGORITHM],
      issuer: env.JWT_ISS,
      audience: env.JWT_AUD_ADMIN_PRE_MFA
    });
  } catch (error) {
    throw traducirErrorJwt(error);
  }
  verificarClaimsBase(payload);
  if (payload.tipoUsuario !== 'ADMIN' || payload.token_use !== 'pre_mfa') {
    throw new AppError(401, 'TOKEN_INVALID', 'Token invalido.');
  }
  return payload;
}

module.exports = {
  signClientePreMfaToken,
  signAdminPreMfaToken,
  signClienteSessionToken,
  signAdminSessionToken,
  verifyClienteSessionToken,
  verifyAdminSessionToken,
  verifyAnySessionToken,
  verifyClientePreMfaToken,
  verifyAdminPreMfaToken,
  ALGORITHM
};
