const express = require('express');
const router = express.Router();
const adminAuthController = require('../controllers/adminAuthController');
const validate = require('../middleware/validate');
const { loginSchema } = require('../validators/adminAuthValidators');

// Solo login. Crear administradores dejo de ser una operacion de autenticacion publica:
// ver routes/administradoresRoutes.js (POST /api/v1/admin/administradores, protegido).
router.post('/login', validate(loginSchema), adminAuthController.login);

module.exports = router;
