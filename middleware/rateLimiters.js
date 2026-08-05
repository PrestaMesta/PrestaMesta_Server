const rateLimit = require('express-rate-limit');
const env = require('../config/env');

// Login/registro (cliente y admin): ventana corta, limite estricto. Objetivo: frenar
// fuerza bruta/credential stuffing, no trafico legitimo (nadie hace 20 intentos de login
// reales en 15 minutos). Usa req.ip, que respeta `trust proxy` (ver app.js) — identifica
// la IP real del cliente detras de Coolify/Traefik, no la IP interna del proxy.
//
// Configurable via env (Checkpoint 6B-2, ajuste incidental): antes era una constante fija
// en este archivo; se parametriza con el mismo patron que SOLICITUD_RATE_LIMIT_*/
// MFA_RATE_LIMIT_* (mismos valores por defecto, 15 min / 20 intentos -- ningun
// comportamiento de produccion cambia salvo que se sobreescriba explicitamente). Necesario
// porque los flujos de login+enroll+desafio de MFA (Checkpoint 6B-2) son secuencias de
// varias peticiones a /client/auth/* y /admin/auth/* por prueba; con el limite fijo de 20
// compartido por todo un archivo de pruebas, las suites de MFA lo agotaban legitimamente a
// mitad de ejecucion. Las pruebas fijan un valor generoso (mismo criterio ya usado para
// SOLICITUD_RATE_LIMIT_MAX en tests/env.setup.js), nunca el limite real de produccion.
const authRateLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false
});

// POST /prestamos/solicitar: no es un endpoint de autenticacion, no tiene por que
// compartir el limite agresivo de login. Configurable via
// SOLICITUD_RATE_LIMIT_WINDOW_MS/SOLICITUD_RATE_LIMIT_MAX (config/env.js) porque el
// volumen "razonable para un usuario real" depende del negocio, no de una constante fija.
const solicitudRateLimiter = rateLimit({
  windowMs: env.SOLICITUD_RATE_LIMIT_WINDOW_MS,
  limit: env.SOLICITUD_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false
});

// Checkpoint 6B-2: limitador especifico para los endpoints MFA que aceptan un codigo de 6
// digitos (mfa/verify, mfa/enroll/confirm) -- "adivina un codigo" es mas sensible que login
// y no comparte el umbral de authRateLimiter (mas alto) ni el de solicitudRateLimiter (no
// relacionado). Independiente del bloqueo por cuenta (clientes_mfa.bloqueado_hasta /
// administradores_mfa.bloqueado_hasta): esta capa protege contra fuerza bruta distribuida
// entre varias cuentas desde una misma IP/red; el bloqueo por cuenta protege una cuenta
// especifica aunque el atacante rote de IP (docs/mfa-identidad-ine.md, seccion 3.3).
//
// A diferencia de authRateLimiter/solicitudRateLimiter (que usan el 429 por defecto de
// express-rate-limit, texto plano), este limitador responde con el mismo ErrorEnvelope
// ({mensaje, codigo, requestId}) que el resto de la API, con codigo MFA_RATE_LIMITED --
// pedido explicito de este checkpoint ("Mantener el ErrorEnvelope con mensaje, codigo y
// requestId").
const mfaRateLimiter = rateLimit({
  windowMs: env.MFA_RATE_LIMIT_WINDOW_MS,
  limit: env.MFA_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      mensaje: 'Demasiados intentos. Espera antes de volver a intentarlo.',
      codigo: 'MFA_RATE_LIMITED',
      requestId: req.requestId
    });
  }
});

module.exports = { authRateLimiter, solicitudRateLimiter, mfaRateLimiter };
