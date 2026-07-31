const express = require('express');
const connectMongo = require('./config/db.mongo');
const pool = require('./config/db.mysql');
const authRoutes = require('./routes/authRoutes');
require('dotenv').config();

const app = express();

// Middlewares
app.use(express.json());

// Conectar MongoDB
connectMongo();

// Verificar conexión a MySQL al arrancar
pool.getConnection()
  .then(conn => {
    console.log('MySQL conectado correctamente');
    conn.release();
  })
  .catch(err => console.error('Error al conectar MySQL:', err.message));

// Rutas
app.use('/api/auth', authRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor de Prestamesta corriendo en puerto ${PORT}`);
});