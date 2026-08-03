const { z } = require('zod');

// { quiet: true } silencia el banner decorativo de dotenv (lista cuantas variables
// inyecto desde .env); no afecta la carga real, solo evita ruido en logs de arranque.
require('dotenv').config({ quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  MYSQL_HOST: z.string().min(1, 'MYSQL_HOST es obligatorio'),
  MYSQL_PORT: z.coerce.number().int().positive().default(3306),
  MYSQL_USER: z.string().min(1, 'MYSQL_USER es obligatorio'),
  MYSQL_PASSWORD: z.string(),
  MYSQL_DATABASE: z.string().min(1, 'MYSQL_DATABASE es obligatorio'),

  MONGO_URI: z.string().min(1, 'MONGO_URI es obligatorio'),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET debe tener al menos 32 caracteres de alta entropia'),
  JWT_EXPIRES_IN: z.string().min(1).default('8h'),
  JWT_ISS: z.string().min(1).default('prestamesta-api'),
  // Audiencias distintas por familia de token (Checkpoint 2): un token de cliente nunca
  // debe pasar la verificacion de una ruta administrativa y viceversa, aunque la firma sea
  // valida y se use el mismo JWT_SECRET/algoritmo.
  JWT_AUD_CLIENTE: z.string().min(1).default('prestamesta-client'),
  JWT_AUD_ADMIN: z.string().min(1).default('prestamesta-admin'),

  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    ),

  // Rate limit especifico de POST /prestamos/solicitar (middleware/rateLimiters.js):
  // deliberadamente separado del limite de login/registro (mas agresivo, ventana corta).
  // Solicitar un prestamo no es un intento de autenticacion; el volumen "razonable" es una
  // decision de negocio (tamano de la base de clientes, uso compartido de IP/NAT), no algo
  // fijo en codigo, por eso es configurable.
  SOLICITUD_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60 * 60 * 1000), // 1h
  SOLICITUD_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10)
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const variablesFaltantes = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    // Nunca se imprime el valor de las variables, solo sus nombres.
    console.error(
      `Configuracion invalida. Revisa las siguientes variables de entorno: ${variablesFaltantes.join(', ')}`
    );
    process.exit(1);
  }

  return result.data;
}

module.exports = loadEnv();
