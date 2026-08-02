const jwt = require('jsonwebtoken');

// Verificar token en general
exports.verificarToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

  if (!token) return res.status(401).json({ mensaje: 'Acceso denegado. Token no proporcionado.' });

  try {
    const verificado = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = verificado;
    next();
  } catch (error) {
    res.status(403).json({ mensaje: 'Token inválido o expirado.' });
  }
};

// Verificar si es Admin
exports.esAdmin = (req, res, next) => {
  if (req.usuario && req.usuario.tipoUsuario === 'ADMIN') {
    next();
  } else {
    res.status(403).json({ mensaje: 'Acceso restringido solo para administradores.' });
  }
};