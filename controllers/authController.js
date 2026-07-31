const pool = require('../config/db.mysql');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Registro de Cliente
exports.register = async (req, res) => {
  const { nombre, email, password, telefono } = req.body;

  if (!nombre || !email || !password) {
    return res.status(400).json({ mensaje: 'Por favor completa los campos requeridos.' });
  }

  try {
    // Validar si el cliente ya existe
    const [existing] = await pool.query('SELECT id FROM clientes WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ mensaje: 'El correo ya está registrado.' });
    }

    // Encriptar contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insertar cliente
    const [result] = await pool.query(
      'INSERT INTO clientes (nombre, email, password, telefono) VALUES (?, ?, ?, ?)',
      [nombre, email, hashedPassword, telefono || null]
    );

    res.status(201).json({
      mensaje: 'Cliente registrado exitosamente',
      clienteId: result.insertId
    });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error en el servidor', error: error.message });
  }
};

// Login de Cliente
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ mensaje: 'Ingresa email y contraseña.' });
  }

  try {
    // Buscar cliente
    const [rows] = await pool.query('SELECT * FROM clientes WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(404).json({ mensaje: 'Credenciales inválidas.' });
    }

    const cliente = rows[0];

    // Verificar contraseña
    const isMatch = await bcrypt.compare(password, cliente.password);
    if (!isMatch) {
      return res.status(400).json({ mensaje: 'Credenciales inválidas.' });
    }

    // Generar JWT
    const token = jwt.sign(
      { id: cliente.id, email: cliente.email },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      mensaje: 'Autenticación exitosa',
      token,
      cliente: {
        id: cliente.id,
        nombre: cliente.nombre,
        email: cliente.email
      }
    });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error en el servidor', error: error.message });
  }
};