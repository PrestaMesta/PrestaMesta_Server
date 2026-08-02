const express = require('express');
const connectMongo = require('./config/db.mongo');
const pool = require('./config/db.mysql');

// Importación de rutas
const clientAuthRoutes = require('./routes/authRoutes');
const adminAuthRoutes = require('./routes/adminAuthRoutes');
const prestamoRoutes = require('./routes/prestamoRoutes');

require('dotenv').config();

const app = express();

// Middlewares
app.use(express.json());

// Conectar MongoDB (Docker)
connectMongo();

// Verificar conexión a MySQL al arrancar
pool.getConnection()
  .then(conn => {
    console.log('MySQL conectado correctamente');
    conn.release();
  })
  .catch(err => console.error('Error al conectar MySQL:', err.message));

// Rutas divididas
app.use('/client/auth', clientAuthRoutes); // Endpoints de Clientes
app.use('/admin/auth', adminAuthRoutes);   // Endpoints de Administradores
app.use('/prestamos', prestamoRoutes); // Endpoints de Préstamos

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor de Prestamesta corriendo en puerto ${PORT}`);
});