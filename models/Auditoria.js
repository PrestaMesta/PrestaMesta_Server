const mongoose = require('mongoose');

const AuditoriaSchema = new mongoose.Schema({
  usuarioId: { type: Number, required: true },
  tipoUsuario: { type: String, enum: ['CLIENTE', 'ADMIN'], required: true },
  accion: { type: String, required: true }, // ej: "CREO_SOLICITUD_PRESTAMO", "APROBO_PRESTAMO"
  detalles: { type: Object },
  ip: { type: String },
  fecha: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Auditoria', AuditoriaSchema);