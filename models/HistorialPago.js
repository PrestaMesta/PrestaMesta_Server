const mongoose = require('mongoose');

const HistorialPagoSchema = new mongoose.Schema({
  prestamoId: { type: Number, required: true },
  clienteId: { type: Number, required: true },
  montoPagado: { type: Number, required: true },
  metodoPago: { type: String, enum: ['TRANSFERENCIA', 'EFECTIVO', 'TARJETA'], default: 'TRANSFERENCIA' },
  referencia: { type: String },
  fechaPago: { type: Date, default: Date.now },
  comprobanteUrl: { type: String }
});

module.exports = mongoose.model('HistorialPago', HistorialPagoSchema);