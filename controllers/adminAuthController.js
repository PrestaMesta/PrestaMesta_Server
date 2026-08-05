const adminAuthService = require('../services/adminAuthService');

// Login de Administrador (Checkpoint 6B-2: ya NO devuelve un token de sesion utilizable de
// inmediato -- ver services/adminAuthService.js#login).
exports.login = async (req, res, next) => {
  try {
    const { preMfaToken, siguientePaso, mfaEstado } = await adminAuthService.login(req.body);
    res.json({
      mensaje:
        siguientePaso === 'MFA_CHALLENGE_REQUIRED'
          ? 'Verifica tu identidad para continuar.'
          : 'Completa el enrolamiento de MFA para continuar.',
      preMfaToken,
      siguientePaso,
      mfaEstado
    });
  } catch (error) {
    next(error);
  }
};

// El "administrador" que usan los tres handlers de MFA combina req.usuario.email (viene
// del token pre-MFA, que no incluye rol a proposito) con req.administradorActual.id/rol,
// releidos de BD por middleware/cargarAdministradorActual.js -- el rol que termina en el
// token de sesion nuevo SIEMPRE sale de la base de datos, nunca de un claim del token
// pre-MFA (mismo principio ya usado por el resto de rutas administrativas sensibles).
function adminDesdeContexto(req) {
  return { id: req.administradorActual.id, email: req.usuario.email, rol: req.administradorActual.rol };
}

exports.iniciarEnrolamientoMfa = async (req, res, next) => {
  try {
    const { secretoBase32, otpauthUri } = await adminAuthService.iniciarEnrolamientoMfa(adminDesdeContexto(req));
    res.status(201).json({
      mensaje: 'Escanea el codigo QR con tu aplicacion de autenticacion.',
      secreto: secretoBase32,
      otpauthUri
    });
  } catch (error) {
    next(error);
  }
};

// No existe un endpoint /me: `admin` (perfil minimo) va en esta respuesta porque es la
// primera vez que el frontend tiene un token utilizable y necesita datos para construir la
// sesion.
exports.confirmarEnrolamientoMfa = async (req, res, next) => {
  try {
    const { token, admin, codigosRecuperacion } = await adminAuthService.confirmarEnrolamientoMfa(
      adminDesdeContexto(req),
      req.body.codigo
    );
    res.json({
      mensaje: 'MFA activado exitosamente. Guarda tus codigos de recuperacion en un lugar seguro.',
      token,
      admin,
      codigosRecuperacion
    });
  } catch (error) {
    next(error);
  }
};

exports.verificarDesafioMfa = async (req, res, next) => {
  try {
    const { token, admin } = await adminAuthService.verificarDesafioMfa(adminDesdeContexto(req), req.body);
    res.json({ mensaje: 'Autenticacion exitosa.', token, admin });
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
