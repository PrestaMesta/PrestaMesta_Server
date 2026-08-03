const express = require('express');
const router = express.Router();
const prestamoController = require('../controllers/prestamoController');
const {
  verificarTokenAdmin,
  verificarTokenCliente,
  verificarTokenClienteOAdmin
} = require('../middleware/authMiddleware');
const cargarAdministradorActual = require('../middleware/cargarAdministradorActual');
const { autorizarRoles } = require('../middleware/autorizarRoles');
const { solicitudRateLimiter } = require('../middleware/rateLimiters');
const validate = require('../middleware/validate');
const {
  crearCreditoSchema,
  solicitarPrestamoSchema,
  cambiarEstadoSchema,
  idParamSchema
} = require('../validators/prestamoValidators');

// Crear tipos de credito (SUPERADMIN o ANALISTA)
router.post(
  '/creditos',
  verificarTokenAdmin,
  cargarAdministradorActual,
  autorizarRoles('SUPERADMIN', 'ANALISTA'),
  validate(crearCreditoSchema),
  prestamoController.crearCredito
);

// Ver tipos de credito (clientes y administradores; requiere autenticacion, no es publico)
router.get('/creditos', verificarTokenClienteOAdmin, prestamoController.obtenerCreditos);

// Solicitar prestamo (solo clientes). Rate limit propio (SOLICITUD_RATE_LIMIT_*),
// deliberadamente distinto del limite agresivo de login: esto no es un endpoint de
// autenticacion. Se aplica primero, antes de gastar trabajo en verificar el token o
// validar el body.
router.post(
  '/solicitar',
  solicitudRateLimiter,
  verificarTokenCliente,
  validate(solicitarPrestamoSchema),
  prestamoController.solicitarPrestamo
);

// Aprobar o rechazar prestamo (SUPERADMIN o ANALISTA)
router.patch(
  '/:id/estado',
  verificarTokenAdmin,
  cargarAdministradorActual,
  autorizarRoles('SUPERADMIN', 'ANALISTA'),
  validate(idParamSchema, 'params'),
  validate(cambiarEstadoSchema),
  prestamoController.cambiarEstadoPrestamo
);

module.exports = router;
