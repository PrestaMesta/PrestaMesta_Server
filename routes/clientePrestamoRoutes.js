const express = require('express');
const router = express.Router();
const prestamoController = require('../controllers/prestamoController');
const { verificarTokenCliente } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const { paginacionSchema, idParamSchema } = require('../validators/prestamoValidators');

// Consultar los prestamos propios. cliente_id sale exclusivamente de req.usuario.sub
// (token verificado), nunca de query ni body -- ver controllers/prestamoController.js.
router.get('/', verificarTokenCliente, validate(paginacionSchema, 'query'), prestamoController.listarPrestamosCliente);

router.get(
  '/:id',
  verificarTokenCliente,
  validate(idParamSchema, 'params'),
  prestamoController.obtenerPrestamoCliente
);

module.exports = router;
