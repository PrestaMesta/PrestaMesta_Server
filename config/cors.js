const env = require('./env');

// CORS solo protege a clientes basados en navegador (el dashboard admin). Las apps
// moviles nativas no envian el header Origin y no estan sujetas a esta politica:
// la autenticacion/autorizacion por JWT sigue siendo obligatoria sin importar el origen.
const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      // Peticiones sin Origin (apps moviles, curl, health checks internos) no pasan por CORS.
      return callback(null, true);
    }
    if (env.CORS_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origen no permitido por la politica CORS'));
  },
  credentials: false
};

module.exports = corsOptions;
