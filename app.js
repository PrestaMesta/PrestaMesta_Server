const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const mongoose = require('mongoose');

const env = require('./config/env');
const corsOptions = require('./config/cors');
const pool = require('./config/db.mysql');
const connectMongo = require('./config/db.mongo');
const logger = require('./utils/logger');
const { requestId, errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { authRateLimiter } = require('./middleware/rateLimiters');

const clientAuthRoutes = require('./routes/authRoutes');
const adminAuthRoutes = require('./routes/adminAuthRoutes');
const administradoresRoutes = require('./routes/administradoresRoutes');
const prestamoRoutes = require('./routes/prestamoRoutes');
const clientePrestamoRoutes = require('./routes/clientePrestamoRoutes');
const adminPrestamoRoutes = require('./routes/adminPrestamoRoutes');

const REQUEST_BODY_LIMIT = '10kb';
const HEALTH_CHECK_TIMEOUT_MS = 2000;
const SHUTDOWN_TIMEOUT_MS = 10000;

function withTimeout(promise, ms) {
  let temporizador;
  const timeout = new Promise((_resolve, reject) => {
    temporizador = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(temporizador));
}

// GET /health/live: unicamente confirma que el proceso Node y la app Express estan
// vivos. NO toca MySQL ni Mongo bajo ninguna circunstancia (por eso es seguro probarlo con
// Supertest sin ninguna base de datos disponible, y por eso Coolify lo puede usar para un
// liveness check barato que no se cae en cascada si la base de datos tiene un problema
// transitorio).
function handleHealthLive(req, res) {
  res.status(200).json({ status: 'ok' });
}

// GET /health/ready: verifica conectividad real a MySQL y Mongo con timeout corto. Nunca
// expone nombres de base de datos, hosts, versiones, credenciales ni stack traces: solo
// 'ok'/'degraded'. En este sandbox de desarrollo, sin MySQL/Mongo disponibles, este check
// esta CONFIGURADO pero no se puede ejecutar contra una base real (ver reporte de
// Checkpoint 3).
async function handleHealthReady(req, res) {
  const resultados = await Promise.allSettled([
    withTimeout(pool.query('SELECT 1'), HEALTH_CHECK_TIMEOUT_MS),
    withTimeout(
      mongoose.connection.readyState === 1
        ? Promise.resolve(true)
        : Promise.reject(new Error('mongo no conectado')),
      HEALTH_CHECK_TIMEOUT_MS
    )
  ]);

  const listo = resultados.every((resultado) => resultado.status === 'fulfilled');
  res.status(listo ? 200 : 503).json({ status: listo ? 'ok' : 'degraded' });
}

// Separa construccion de la app (sin red, sin BD) de la conexion a bases de datos y del
// arranque del servidor HTTP. Permite que las pruebas usen Supertest sobre createApp()
// sin abrir un puerto real ni depender de MySQL/Mongo.
function createApp() {
  const app = express();

  // Detras de Coolify/Traefik como UNICO reverse proxy: se confia solo en el primer hop
  // (nunca `trust proxy: true`, que confiaria en toda la cadena y permitiria falsificar
  // X-Forwarded-For desde fuera). Necesario para que express-rate-limit identifique la IP
  // real del cliente en vez de la IP interna del proxy.
  app.set('trust proxy', 1);
  app.disable('x-powered-by'); // Helmet ya lo cubre; explicito por claridad.

  app.use(requestId);
  app.use(
    helmet({
      // API JSON pura, no sirve HTML: la CSP pensada para una SPA (Angular del dashboard)
      // no aplica aqui. Se desactiva en vez de copiarla sin pensar.
      contentSecurityPolicy: false
    })
  );
  app.use(cors(corsOptions));
  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));

  app.get('/health/live', handleHealthLive);
  app.get('/health/ready', handleHealthReady);

  app.use('/api/v1/client/auth', authRateLimiter, clientAuthRoutes);
  app.use('/api/v1/admin/auth', authRateLimiter, adminAuthRoutes);
  app.use('/api/v1/admin/administradores', administradoresRoutes);
  app.use('/api/v1/prestamos', prestamoRoutes);
  app.use('/api/v1/client/prestamos', clientePrestamoRoutes);
  app.use('/api/v1/admin/prestamos', adminPrestamoRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

async function start() {
  await connectMongo();

  try {
    const connection = await pool.getConnection();
    logger.info('MySQL conectado correctamente');
    connection.release();
  } catch {
    // No se imprime error.message crudo (podria incluir detalles de conexion). El
    // arranque continua igual que en el comportamiento original: MySQL puede tardar en
    // estar disponible en algunos despliegues.
    logger.error('Error al conectar MySQL. Revisa la configuracion.');
  }

  const app = createApp();
  // Bind explicito a 0.0.0.0: dentro de un contenedor (Docker/Coolify) el servidor debe
  // aceptar conexiones en todas las interfaces, no solo en localhost.
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`Servidor de Prestamesta corriendo en puerto ${env.PORT}`);
  });

  // Cierre ordenado: deja de aceptar conexiones nuevas (server.close), espera un maximo
  // razonable a que las solicitudes en curso terminen, cierra el pool de MySQL y la
  // conexion de Mongoose, y sale con codigo 0. Si no termina a tiempo (una conexion
  // colgada, una query que nunca resuelve), un timeout de respaldo fuerza la salida con
  // codigo 1 para que el contenedor nunca quede detenido indefinidamente esperando un
  // cierre "limpio" que no va a llegar.
  let cerrando = false;
  const shutdown = (signal) => {
    if (cerrando) return;
    cerrando = true;
    logger.info(`Recibido ${signal}, cerrando servidor...`);

    const forzarSalida = setTimeout(() => {
      logger.error('Cierre ordenado no se completo a tiempo, forzando salida.');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forzarSalida.unref();

    server.close(async () => {
      await pool.end().catch(() => {});
      await mongoose.connection.close().catch(() => {});
      clearTimeout(forzarSalida);
      logger.info('Cierre ordenado completo.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { createApp };

if (require.main === module) {
  start();
}
