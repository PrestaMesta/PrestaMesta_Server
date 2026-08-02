const express = require('express');
const router = express.Router();
const prestamoController = require('../controllers/prestamoController');
const { verificarToken, esAdmin } = require('../middleware/authMiddleware');

// Crear tipos de crédito (Solo Admin)
router.post('/creditos', verificarToken, esAdmin, prestamoController.crearCredito);

// Ver tipos de crédito (Clientes y Admins)
router.get('/creditos', verificarToken, prestamoController.obtenerCreditos);

// Solicitar préstamo (Clientes)
router.post('/solicitar', verificarToken, prestamoController.solicitarPrestamo);

// Aprobar o rechazar préstamo (Solo Admin)
router.patch('/:id/estado', verificarToken, esAdmin, prestamoController.cambiarEstadoPrestamo);

module.exports = router;