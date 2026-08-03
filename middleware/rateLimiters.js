const rateLimit = require('express-rate-limit');
const env = require('../config/env');

// Login/registro (cliente y admin): ventana corta, limite estricto. Objetivo: frenar
// fuerza bruta/credential stuffing, no trafico legitimo (nadie hace 20 intentos de login
// reales en 15 minutos). Usa req.ip, que respeta `trust proxy` (ver app.js) — identifica
// la IP real del cliente detras de Coolify/Traefik, no la IP interna del proxy.
const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const AUTH_RATE_LIMIT_MAX = 20;

const authRateLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
  limit: AUTH_RATE_LIMIT_MAX,
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

module.exports = { authRateLimiter, solicitudRateLimiter };
