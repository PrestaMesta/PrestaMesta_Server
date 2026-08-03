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

// Login de Cliente
exports.login = async (req, res, next) => {
  try {
    const { token, cliente } = await clienteAuthService.login(req.body);
    res.json({ mensaje: 'Autenticacion exitosa', token, cliente });
  } catch (error) {
    next(error);
  }
};
