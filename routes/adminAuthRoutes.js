const express = require('express');
const router = express.Router();
const adminAuthController = require('../controllers/adminAuthController');
const validate = require('../middleware/validate');
const { loginSchema } = require('../validators/adminAuthValidators');
const { enrollSchema, enrollConfirmSchema, mfaVerifySchema } = require('../validators/mfaValidators');
const { verificarTokenAdminPreMfa } = require('../middleware/authMiddleware');
const cargarAdministradorActual = require('../middleware/cargarAdministradorActual');
const { mfaRateLimiter } = require('../middleware/rateLimiters');

// Solo login (mas MFA de acceso abajo). Crear administradores dejo de ser una operacion de
// autenticacion publica: ver routes/administradoresRoutes.js
// (POST /api/v1/admin/administradores, protegido).
router.post('/login', validate(loginSchema), adminAuthController.login);

// MFA de acceso (Checkpoint 6B-2). cargarAdministradorActual corre DESPUES de
// verificarTokenAdminPreMfa (mismo orden que en rutas de sesion completa): solo depende de
// req.usuario.sub, que un token pre-MFA ya trae, y relee rol/activo directo de BD -- el rol
// que termina en el token de sesion nuevo nunca sale de un claim del token pre-MFA (que
// ademas no lo incluye a proposito). Si el administrador fue desactivado entre el login y
// la confirmacion del MFA, esto lo detecta aqui, igual que en cualquier otra ruta
// administrativa sensible.
router.post(
  '/mfa/enroll',
  verificarTokenAdminPreMfa,
  cargarAdministradorActual,
  validate(enrollSchema),
  adminAuthController.iniciarEnrolamientoMfa
);
router.post(
  '/mfa/enroll/confirm',
  mfaRateLimiter,
  verificarTokenAdminPreMfa,
  cargarAdministradorActual,
  validate(enrollConfirmSchema),
  adminAuthController.confirmarEnrolamientoMfa
);
router.post(
  '/mfa/verify',
  mfaRateLimiter,
  verificarTokenAdminPreMfa,
  cargarAdministradorActual,
  validate(mfaVerifySchema),
  adminAuthController.verificarDesafioMfa
);

module.exports = router;
