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
  // Checkpoint 6B-2: audiencias del token PRE-MFA (docs/mfa-identidad-ine.md, seccion 2).
  // Distintas de JWT_AUD_CLIENTE/JWT_AUD_ADMIN a proposito: un token pre-MFA nunca debe
  // pasar la verificacion de una ruta de sesion normal, ni viceversa, aunque comparta
  // firma/algoritmo -- mismo mecanismo de "audiencia como frontera de seguridad" que ya
  // separa cliente de admin, extendido para separar tambien "sesion" de "pre-MFA".
  JWT_AUD_CLIENTE_PRE_MFA: z.string().min(1).default('prestamesta-client-pre-mfa'),
  JWT_AUD_ADMIN_PRE_MFA: z.string().min(1).default('prestamesta-admin-pre-mfa'),

  // Rate limit de login/registro (middleware/rateLimiters.js#authRateLimiter). Antes era
  // una constante fija (15 min / 20 intentos); se parametriza en Checkpoint 6B-2 con el
  // mismo patron que el resto de limitadores, defaults identicos a los valores fijos que
  // ya tenia -- ningun comportamiento de produccion cambia salvo override explicito.
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000), // 15 min
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

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
  SOLICITUD_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

  // --- MFA (Checkpoint 6B-1, docs/mfa-identidad-ine.md) ---
  // Infraestructura de persistencia/cifrado unicamente: nada de esto esta conectado
  // todavia a login ni a ninguna ruta HTTP (ver utils/mfaCrypto.js, utils/totp.js,
  // services/mfaService.js). Se valida aqui igual que el resto de la configuracion para
  // que el arranque falle temprano y de forma explicita si falta algo, no a medio proceso
  // de cifrar un secreto.

  // Clave de cifrado AES-256-GCM para el secreto TOTP (utils/mfaCrypto.js). Debe ser
  // base64 ESTANDAR (alfabeto +/=, no base64url) que decodifique a EXACTAMENTE 32 bytes
  // (AES-256). Sin valor por defecto: igual que JWT_SECRET, un default en el codigo fuente
  // volveria inutil la proteccion que se supone que da esta clave. Nunca se reutiliza el
  // mismo valor entre entornos de test y produccion (misma politica que JWT_SECRET).
  MFA_ENCRYPTION_KEY_BASE64: z
    .string()
    .min(1, 'MFA_ENCRYPTION_KEY_BASE64 es obligatorio')
    .refine((valor) => /^[A-Za-z0-9+/]+={0,2}$/.test(valor), {
      message: 'MFA_ENCRYPTION_KEY_BASE64 debe ser base64 estandar valido (alfabeto +/=)'
    })
    .refine((valor) => Buffer.from(valor, 'base64').length === 32, {
      message: 'MFA_ENCRYPTION_KEY_BASE64 debe decodificar a exactamente 32 bytes (AES-256)'
    }),

  // TTL del token temporal previo al MFA (Checkpoint 6B-2: emitido por login,
  // JWT_AUD_CLIENTE_PRE_MFA/JWT_AUD_ADMIN_PRE_MFA de arriba) y del token de step-up
  // (docs/mfa-identidad-ine.md, seccion 3.7 -- todavia NO implementado, step-up es un
  // checkpoint posterior; la variable ya existe para no tener que tocar config/env.js de
  // nuevo). Formato identico a JWT_EXPIRES_IN (string que acepta jsonwebtoken, ej. '5m').
  PRE_MFA_EXPIRES_IN: z.string().min(1).default('5m'),
  STEP_UP_EXPIRES_IN: z.string().min(1).default('2m'),

  // Rate limit especifico de los endpoints MFA que aceptan un codigo de 6 digitos
  // (mfa/verify, mfa/enroll/confirm -- middleware/rateLimiters.js#mfaRateLimiter, Checkpoint
  // 6B-2). Mismo patron que SOLICITUD_RATE_LIMIT_*, deliberadamente mas estricto que el
  // limite de login: adivinar un codigo de 6 digitos es mas sensible que adivinar un
  // password. Ventana corregida a 10 minutos (600000ms) antes de 6B-2.
  MFA_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(600000), // 10 min
  MFA_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5)
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
