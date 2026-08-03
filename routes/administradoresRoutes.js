const express = require('express');
const router = express.Router();
const adminAuthController = require('../controllers/adminAuthController');
const { verificarTokenAdmin } = require('../middleware/authMiddleware');
const cargarAdministradorActual = require('../middleware/cargarAdministradorActual');
const { autorizarRoles } = require('../middleware/autorizarRoles');
const validate = require('../middleware/validate');
const { crearAdministradorSchema } = require('../validators/adminAuthValidators');

// Crear administradores: solo SUPERADMIN, con rol/estado releidos de BD (no del JWT). El
// primer SUPERADMIN se crea unicamente con `npm run seed:superadmin` (proceso offline),
// nunca via HTTP sin autenticar.
router.post(
  '/',
  verificarTokenAdmin,
  cargarAdministradorActual,
  autorizarRoles('SUPERADMIN'),
  validate(crearAdministradorSchema),
  adminAuthController.crearAdministrador
);

module.exports = router;
