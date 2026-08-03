const prestamoService = require('../services/prestamoService');

// 1. [ADMIN] Crear un tipo de credito en el catalogo
exports.crearCredito = async (req, res, next) => {
  try {
    const { creditoId } = await prestamoService.crearCredito(req.body);
    res.status(201).json({ mensaje: 'Tipo de credito creado con exito', creditoId });
  } catch (error) {
    next(error);
  }
};

// 2. [CLIENTE / ADMIN] Listar tipos de creditos disponibles
exports.obtenerCreditos = async (req, res, next) => {
  try {
    const creditos = await prestamoService.listarCreditos();
    res.json(creditos);
  } catch (error) {
    next(error);
  }
};

// 3. [CLIENTE] Solicitar un prestamo con opcion de aval
exports.solicitarPrestamo = async (req, res, next) => {
  try {
    const clienteId = Number(req.usuario.sub);
    const resultado = await prestamoService.solicitarPrestamo({ clienteId, ...req.body });
    res.status(201).json({
      mensaje: 'Solicitud de prestamo enviada con exito',
      prestamoId: resultado.prestamoId,
      fechaSolicitud: resultado.fechaSolicitud,
      montoSolicitado: resultado.montoSolicitado,
      montoTotalAPagar: resultado.montoTotalAPagar,
      estado: resultado.estado
    });
  } catch (error) {
    next(error);
  }
};

// 4. [ADMIN] Aprobar o rechazar prestamo
exports.cambiarEstadoPrestamo = async (req, res, next) => {
  try {
    const resultado = await prestamoService.cambiarEstado({
      prestamoId: req.params.id,
      nuevoEstado: req.body.estado,
      administradorId: Number(req.administradorActual.id),
      motivo: req.body.motivo
    });
    res.json({
      mensaje: `El prestamo #${resultado.prestamoId} ha sido ${resultado.estadoNuevo.toLowerCase()} exitosamente.`
    });
  } catch (error) {
    next(error);
  }
};
