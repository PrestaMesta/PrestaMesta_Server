const pool = require('../config/db.mysql');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Registro de Administrador / Operador
exports.registerAdmin = async (req, res) => {
  const { nombre, email, password, rol } = req.body;

  if (!nombre || !email || !password) {
    return res.status(400).json({ mensaje: 'Por favor completa nombre, email y contraseña.' });
  }

  // Roles válidos dentro del sistema
  const rolesValidos = ['SUPERADMIN', 'ANALISTA', 'COBRADOR'];
  const rolAsignado = rolesValidos.includes(rol) ? rol : 'ANALISTA';

  try {
    // Validar si el email ya existe en administradores
    const [existing] = await pool.query('SELECT id FROM administradores WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ mensaje: 'El correo ya está registrado para un administrador.' });
    }

    // Encriptar contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insertar Administrador
    const [result] = await pool.query(
      'INSERT INTO administradores (nombre, email, password, rol) VALUES (?, ?, ?, ?)',
      [nombre, email, hashedPassword, rolAsignado]
    );

    res.status(201).json({
      mensaje: 'Administrador creado exitosamente',
      adminId: result.insertId,
      rol: rolAsignado
    });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error en el servidor', error: error.message });
  }
};

// Login de Administrador
exports.loginAdmin = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ mensaje: 'Ingresa email y contraseña.' });
  }

  try {
    // Buscar Administrador activo
    const [rows] = await pool.query('SELECT * FROM administradores WHERE email = ? AND activo = TRUE', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ mensaje: 'Credenciales inválidas o cuenta desactivada.' });
    }

    const admin = rows[0];

    // Verificar contraseña
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ mensaje: 'Credenciales inválidas.' });
    }

    // Generar JWT con Payload específico para administradores
    const token = jwt.sign(
      { 
        id: admin.id, 
        email: admin.email, 
        rol: admin.rol, 
        tipoUsuario: 'ADMIN' 
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      mensaje: 'Autenticación de administrador exitosa',
      token,
      admin: {
        id: admin.id,
        nombre: admin.nombre,
        email: admin.email,
        rol: admin.rol
      }
    });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error en el servidor', error: error.message });
  }
};