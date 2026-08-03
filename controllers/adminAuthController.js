const adminAuthService = require('../services/adminAuthService');

// Login de Administrador
exports.login = async (req, res, next) => {
  try {
    const { token, admin } = await adminAuthService.login(req.body);
    res.json({ mensaje: 'Autenticacion de administrador exitosa', token, admin });
  } catch (error) {
    next(error);
  }
};

// Creacion de Administrador (POST /api/v1/admin/administradores). Ya no es un endpoint de
// autenticacion publica: requiere verificarTokenAdmin + cargarAdministradorActual +
// autorizarRoles('SUPERADMIN') en la ruta (routes/administradoresRoutes.js).
exports.crearAdministrador = async (req, res, next) => {
  try {
    const { adminId, rol } = await adminAuthService.crearAdministrador(
      req.body,
      req.administradorActual.id
    );
    res.status(201).json({ mensaje: 'Administrador creado exitosamente', adminId, rol });
  } catch (error) {
    next(error);
  }
};
