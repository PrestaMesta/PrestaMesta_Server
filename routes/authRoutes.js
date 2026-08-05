const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const validate = require('../middleware/validate');
const { registerSchema, loginSchema } = require('../validators/clienteAuthValidators');
const { enrollSchema, enrollConfirmSchema, mfaVerifySchema } = require('../validators/mfaValidators');
const { verificarTokenClientePreMfa } = require('../middleware/authMiddleware');
const { mfaRateLimiter } = require('../middleware/rateLimiters');

router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);

// MFA de acceso (Checkpoint 6B-2). Las tres rutas exigen un token PRE-MFA
// (verificarTokenClientePreMfa): un token de sesion completa nunca sirve aqui, y un token
// pre-MFA nunca sirve en ninguna ruta de negocio (ver utils/jwt.js). mfaRateLimiter se
// aplica solo a las dos rutas que reciben un codigo de 6 digitos a adivinar
// (docs/mfa-identidad-ine.md, seccion 3.3) -- mfa/enroll (generar el secreto, sin body) no
// lo necesita.
router.post(
  '/mfa/enroll',
  verificarTokenClientePreMfa,
  validate(enrollSchema),
  authController.iniciarEnrolamientoMfa
);
router.post(
  '/mfa/enroll/confirm',
  mfaRateLimiter,
  verificarTokenClientePreMfa,
  validate(enrollConfirmSchema),
  authController.confirmarEnrolamientoMfa
);
router.post(
  '/mfa/verify',
  mfaRateLimiter,
  verificarTokenClientePreMfa,
  validate(mfaVerifySchema),
  authController.verificarDesafioMfa
);

module.exports = router;
