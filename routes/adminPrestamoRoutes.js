const express = require('express');
const router = express.Router();
const prestamoController = require('../controllers/prestamoController');
const { verificarTokenAdmin } = require('../middleware/authMiddleware');
const cargarAdministradorActual = require('../middleware/cargarAdministradorActual');
const { autorizarRoles } = require('../middleware/autorizarRoles');
const validate = require('../middleware/validate');
const { filtrosAdminPrestamoSchema, idParamSchema } = require('../validators/prestamoValidators');

// Consultas administrativas de prestamos: mismo par de roles que aprueba/rechaza
// (SUPERADMIN, ANALISTA); COBRADOR no tiene acceso a prestamos en este checkpoint.
router.get(
  '/',
  verificarTokenAdmin,
  cargarAdministradorActual,
  autorizarRoles('SUPERADMIN', 'ANALISTA'),
  validate(filtrosAdminPrestamoSchema, 'query'),
  prestamoController.listarPrestamosAdmin
);

router.get(
  '/:id',
  verificarTokenAdmin,
  cargarAdministradorActual,
  autorizarRoles('SUPERADMIN', 'ANALISTA'),
  validate(idParamSchema, 'params'),
  prestamoController.obtenerPrestamoAdmin
);

module.exports = router;
