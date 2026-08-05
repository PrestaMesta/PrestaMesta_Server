const clienteAuthService = require('../services/clienteAuthService');

// Registro de Cliente
exports.register = async (req, res, next) => {
  try {
    const { clienteId } = await clienteAuthService.registrar(req.body);
    res.status(201).json({ mensaje: 'Cliente registrado exitosamente', clienteId });
  } catch (error) {
    next(error);
  }
};

// Login de Cliente (Checkpoint 6B-2: ya NO devuelve un token de sesion utilizable de
// inmediato -- ver services/clienteAuthService.js#login).
exports.login = async (req, res, next) => {
  try {
    const { preMfaToken, siguientePaso, mfaEstado } = await clienteAuthService.login(req.body);
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

// El "usuario" que usan los tres handlers de MFA sale exclusivamente del token verificado
// (req.usuario.sub/email), nunca de query ni body: no hay forma de enrolar/verificar el MFA
// de otro cliente.
function clienteDesdeToken(req) {
  return { id: Number(req.usuario.sub), email: req.usuario.email };
}

// Inicia enrolamiento MFA (auth: token pre-MFA -- ver middleware/authMiddleware.js#verificarTokenClientePreMfa).
exports.iniciarEnrolamientoMfa = async (req, res, next) => {
  try {
    const { secretoBase32, otpauthUri } = await clienteAuthService.iniciarEnrolamientoMfa(clienteDesdeToken(req));
    res.status(201).json({
      mensaje: 'Escanea el codigo QR con tu aplicacion de autenticacion.',
      secreto: secretoBase32,
      otpauthUri
    });
  } catch (error) {
    next(error);
  }
};

// Confirma el primer codigo TOTP, activa el MFA y emite el token de sesion completo. No
// existe un endpoint /me: `cliente` (perfil minimo) va en esta respuesta porque es la
// primera vez que el frontend tiene un token utilizable y necesita datos para construir la
// sesion.
exports.confirmarEnrolamientoMfa = async (req, res, next) => {
  try {
    const { token, cliente, codigosRecuperacion } = await clienteAuthService.confirmarEnrolamientoMfa(
      clienteDesdeToken(req),
      req.body.codigo
    );
    res.json({
      mensaje: 'MFA activado exitosamente. Guarda tus codigos de recuperacion en un lugar seguro.',
      token,
      cliente,
      codigosRecuperacion
    });
  } catch (error) {
    next(error);
  }
};

// Verifica el desafio MFA (TOTP o codigo de recuperacion) y emite el token de sesion
// completo. Mismo motivo que arriba: `cliente` va en la respuesta porque no hay /me.
exports.verificarDesafioMfa = async (req, res, next) => {
  try {
    const { token, cliente } = await clienteAuthService.verificarDesafioMfa(clienteDesdeToken(req), req.body);
    res.json({ mensaje: 'Autenticacion exitosa.', token, cliente });
  } catch (error) {
    next(error);
  }
};
