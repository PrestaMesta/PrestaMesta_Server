// Checkpoint 6B-2: login, enrolamiento TOTP y desafio MFA, de punta a punta via
// createApp()+Supertest (mismo patron que tests/http/routes.test.js), con los repositorios
// mockeados. Los repos de MFA se mockean con un FAKE CON ESTADO (Map en memoria) en vez de
// mocks por-test aislados, porque estos flujos son secuencias de varias peticiones HTTP
// (login -> enroll -> confirm -> verify) donde cada paso depende del estado que dejo el
// paso anterior -- igual de lo que haria una fila real de MySQL, solo que en memoria.
jest.mock('../../repositories/clienteRepository');
jest.mock('../../repositories/administradorRepository');
jest.mock('../../repositories/clienteMfaRepository');
jest.mock('../../repositories/administradorMfaRepository');
jest.mock('../../repositories/auditoriaRepository');

const bcrypt = require('bcryptjs');
const request = require('supertest');
const { createApp } = require('../../app');
const clienteRepository = require('../../repositories/clienteRepository');
const administradorRepository = require('../../repositories/administradorRepository');
const clienteMfaRepository = require('../../repositories/clienteMfaRepository');
const administradorMfaRepository = require('../../repositories/administradorMfaRepository');
const totp = require('../../utils/totp');
const {
  signClientePreMfaToken,
  signAdminPreMfaToken,
  signClienteSessionToken,
  signAdminSessionToken
} = require('../../utils/jwt');

const app = createApp();
const bearer = (token) => `Bearer ${token}`;

// --- Fake con estado de un repositorio MFA (cliente o admin, misma forma) ---
function crearMfaRepoFalsoConEstado() {
  const filas = new Map();
  const codigos = new Map();
  let siguienteId = 1;

  function filaPorDefecto() {
    return {
      estado: 'NO_ENROLADO',
      totp_secret_ciphertext: null,
      totp_secret_nonce: null,
      totp_secret_tag: null,
      totp_activado_en: null,
      totp_ultimo_timestep_usado: null,
      intentos_fallidos: 0,
      bloqueado_hasta: null
    };
  }

  return {
    async obtenerEstado(usuarioId) {
      return filas.has(usuarioId) ? { ...filas.get(usuarioId) } : null;
    },
    async iniciarEnrolamiento({ usuarioId, ciphertext, nonce, tag }) {
      filas.set(usuarioId, {
        ...filaPorDefecto(),
        estado: 'PENDIENTE_CONFIRMACION',
        totp_secret_ciphertext: ciphertext,
        totp_secret_nonce: nonce,
        totp_secret_tag: tag
      });
    },
    async confirmarEnrolamiento(usuarioId) {
      const fila = filas.get(usuarioId);
      if (!fila || fila.estado !== 'PENDIENTE_CONFIRMACION') return false;
      fila.estado = 'ACTIVO';
      fila.totp_activado_en = new Date();
      return true;
    },
    async marcarTimestepUsado({ usuarioId, timestep }) {
      const fila = filas.get(usuarioId);
      if (!fila) return false;
      if (fila.totp_ultimo_timestep_usado !== null && fila.totp_ultimo_timestep_usado >= timestep) return false;
      fila.totp_ultimo_timestep_usado = timestep;
      return true;
    },
    async registrarIntentoFallido() {},
    async resetearIntentosFallidos() {},
    async reemplazarCodigosRecuperacion({ usuarioId, hashes }) {
      codigos.set(
        usuarioId,
        hashes.map((hash) => ({ id: siguienteId++, codigo_hash: hash, usado_en: null }))
      );
    },
    async obtenerCodigosRecuperacion(usuarioId) {
      return (codigos.get(usuarioId) || []).map((c) => ({ ...c }));
    },
    async consumirCodigoRecuperacion({ id, usuarioId }) {
      const lista = codigos.get(usuarioId) || [];
      const fila = lista.find((c) => c.id === id);
      if (!fila || fila.usado_en) return false;
      fila.usado_en = new Date();
      return true;
    },
    _filas: filas // expuesto solo para aserciones internas (ver "secreto cifrado en persistencia")
  };
}

let clienteMfaRepoFalso;
let adminMfaRepoFalso;

beforeEach(() => {
  jest.clearAllMocks();
  clienteMfaRepoFalso = crearMfaRepoFalsoConEstado();
  adminMfaRepoFalso = crearMfaRepoFalsoConEstado();
  for (const metodo of Object.keys(clienteMfaRepoFalso)) {
    if (metodo.startsWith('_')) continue;
    clienteMfaRepository[metodo].mockImplementation(clienteMfaRepoFalso[metodo]);
  }
  for (const metodo of Object.keys(adminMfaRepoFalso)) {
    if (metodo.startsWith('_')) continue;
    administradorMfaRepository[metodo].mockImplementation(adminMfaRepoFalso[metodo]);
  }
});

const CLIENTE_PASSWORD = 'miPasswordSeguro123';
const ADMIN_PASSWORD = 'AdminSuperSeguro123';

async function clienteFilaBD(id = 1, email = 'juan@example.com') {
  return {
    id,
    nombre: 'Juan Perez',
    email,
    password: await bcrypt.hash(CLIENTE_PASSWORD, 10)
  };
}

// Revision post-6B-2: services/clienteAuthService.js#confirmarEnrolamientoMfa/
// verificarDesafioMfa ahora tambien llaman a clienteRepository.obtenerPorId (para devolver
// el perfil minimo en la respuesta que completa MFA -- ver el reporte de esta revision).
// Este helper mockea AMBAS lecturas (por email, para login; por id, para el perfil) con la
// MISMA fila, para que ambas vistas del mismo cliente/admin sean consistentes entre si en
// una prueba dada.
async function mockClientePerfil(overrides = {}) {
  const fila = await clienteFilaBD(overrides.id, overrides.email);
  clienteRepository.obtenerPorEmail.mockResolvedValue(fila);
  clienteRepository.obtenerPorId.mockResolvedValue(fila);
  return fila;
}

async function mockAdminPerfil(overrides = {}) {
  const fila = await adminFilaBD(overrides.id, overrides.email, overrides.rol);
  administradorRepository.obtenerPorEmail.mockResolvedValue(fila);
  administradorRepository.obtenerPorId.mockResolvedValue(fila);
  return fila;
}

async function adminFilaBD(id = 1, email = 'admin@prestamesta.com', rol = 'SUPERADMIN') {
  return {
    id,
    nombre: 'Admin Principal',
    email,
    password: await bcrypt.hash(ADMIN_PASSWORD, 10),
    rol,
    activo: 1
  };
}

describe('POST /api/v1/client/auth/login (Checkpoint 6B-2: nuevo contrato)', () => {
  test('password correcto, sin MFA enrolado -> MFA_ENROLLMENT_REQUIRED, sin token de sesion', async () => {
    await mockClientePerfil();

    const res = await request(app)
      .post('/api/v1/client/auth/login')
      .send({ email: 'juan@example.com', password: CLIENTE_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.siguientePaso).toBe('MFA_ENROLLMENT_REQUIRED');
    expect(res.body.mfaEstado).toBe('NO_ENROLADO');
    expect(res.body.preMfaToken).toEqual(expect.any(String));
    expect(res.body.token).toBeUndefined();
  });

  test('password correcto, con MFA ya ACTIVO -> MFA_CHALLENGE_REQUIRED, sin token de sesion', async () => {
    await mockClientePerfil();
    clienteMfaRepository.obtenerEstado.mockResolvedValue({ estado: 'ACTIVO' });

    const res = await request(app)
      .post('/api/v1/client/auth/login')
      .send({ email: 'juan@example.com', password: CLIENTE_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.siguientePaso).toBe('MFA_CHALLENGE_REQUIRED');
    expect(res.body.mfaEstado).toBe('ACTIVO');
    expect(res.body.token).toBeUndefined();
  });

  test('email inexistente -> 401 INVALID_CREDENTIALS (nunca se llega a consultar MFA)', async () => {
    clienteRepository.obtenerPorEmail.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/client/auth/login')
      .send({ email: 'no-existe@example.com', password: CLIENTE_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('INVALID_CREDENTIALS');
    expect(clienteMfaRepository.obtenerEstado).not.toHaveBeenCalled();
  });

  test('password incorrecto -> 401 INVALID_CREDENTIALS, mismo status/codigo/mensaje que email inexistente', async () => {
    await mockClientePerfil();

    const res = await request(app)
      .post('/api/v1/client/auth/login')
      .send({ email: 'juan@example.com', password: 'passwordIncorrecto123' });

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('INVALID_CREDENTIALS');
    expect(res.body.mensaje).toBe('Credenciales invalidas.');
  });
});

describe('POST /api/v1/admin/auth/login (Checkpoint 6B-2: nuevo contrato)', () => {
  test('password correcto, sin MFA enrolado -> MFA_ENROLLMENT_REQUIRED (incluye al SUPERADMIN recien sembrado)', async () => {
    await mockAdminPerfil();

    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin@prestamesta.com', password: ADMIN_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.siguientePaso).toBe('MFA_ENROLLMENT_REQUIRED');
    expect(res.body.token).toBeUndefined();
  });

  test('password correcto, con MFA ya ACTIVO -> MFA_CHALLENGE_REQUIRED', async () => {
    await mockAdminPerfil();
    administradorMfaRepository.obtenerEstado.mockResolvedValue({ estado: 'ACTIVO' });

    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin@prestamesta.com', password: ADMIN_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.siguientePaso).toBe('MFA_CHALLENGE_REQUIRED');
  });

  test('cuenta desactivada (obtenerPorEmail no la devuelve) -> mismo 401 INVALID_CREDENTIALS que email inexistente', async () => {
    administradorRepository.obtenerPorEmail.mockResolvedValue(null); // repo real ya filtra activo=TRUE

    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin@prestamesta.com', password: ADMIN_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('INVALID_CREDENTIALS');
  });
});

describe('separacion pre-MFA vs sesion (Checkpoint 6B-2)', () => {
  test('un token pre-MFA de cliente es rechazado en una ruta normal (GET /client/prestamos)', async () => {
    const tokenPreMfa = signClientePreMfaToken({ id: 1, email: 'juan@example.com' });

    const res = await request(app).get('/api/v1/client/prestamos').set('Authorization', bearer(tokenPreMfa));

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('TOKEN_INVALID');
  });

  test('un token de sesion completa es rechazado en un endpoint pre-MFA (POST /client/auth/mfa/verify)', async () => {
    const tokenSesion = signClienteSessionToken({ id: 1, email: 'juan@example.com' });

    const res = await request(app)
      .post('/api/v1/client/auth/mfa/verify')
      .set('Authorization', bearer(tokenSesion))
      .send({ codigo: '123456' });

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('TOKEN_INVALID');
  });

  test('GET /prestamos/creditos (verifyAnySessionToken) rechaza un token pre-MFA de cliente', async () => {
    const tokenPreMfa = signClientePreMfaToken({ id: 1, email: 'juan@example.com' });

    const res = await request(app).get('/api/v1/prestamos/creditos').set('Authorization', bearer(tokenPreMfa));

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('TOKEN_INVALID');
  });

  test('GET /prestamos/creditos rechaza un token pre-MFA de admin', async () => {
    const tokenPreMfa = signAdminPreMfaToken({ id: 1, email: 'admin@prestamesta.com' });

    const res = await request(app).get('/api/v1/prestamos/creditos').set('Authorization', bearer(tokenPreMfa));

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('TOKEN_INVALID');
  });

  test('un token de sesion de ADMIN es rechazado en un endpoint pre-MFA de cliente (dominios distintos)', async () => {
    const tokenSesionAdmin = signAdminSessionToken({ id: 1, email: 'admin@prestamesta.com', rol: 'SUPERADMIN' });

    const res = await request(app)
      .post('/api/v1/client/auth/mfa/verify')
      .set('Authorization', bearer(tokenSesionAdmin))
      .send({ codigo: '123456' });

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('TOKEN_INVALID');
  });
});

describe('enrolamiento MFA de cliente (login -> enroll -> confirm)', () => {
  async function loginYObtenerPreMfaToken() {
    await mockClientePerfil();
    const resLogin = await request(app)
      .post('/api/v1/client/auth/login')
      .send({ email: 'juan@example.com', password: CLIENTE_PASSWORD });
    return resLogin.body.preMfaToken;
  }

  test('inicia el enrolamiento y devuelve secreto + otpauthUri', async () => {
    const preMfaToken = await loginYObtenerPreMfaToken();

    const res = await request(app)
      .post('/api/v1/client/auth/mfa/enroll')
      .set('Authorization', bearer(preMfaToken));

    expect(res.status).toBe(201);
    expect(res.body.secreto).toEqual(expect.any(String));
    expect(res.body.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect(clienteMfaRepository.iniciarEnrolamiento).toHaveBeenCalledTimes(1);
  });

  test('el secreto se persiste CIFRADO (nunca en claro) -- ciphertext/nonce/tag son Buffers distintos del secreto en claro', async () => {
    const preMfaToken = await loginYObtenerPreMfaToken();
    const resEnroll = await request(app)
      .post('/api/v1/client/auth/mfa/enroll')
      .set('Authorization', bearer(preMfaToken));

    const args = clienteMfaRepository.iniciarEnrolamiento.mock.calls[0][0];
    expect(Buffer.isBuffer(args.ciphertext)).toBe(true);
    expect(Buffer.isBuffer(args.nonce)).toBe(true);
    expect(Buffer.isBuffer(args.tag)).toBe(true);
    expect(args.ciphertext.toString('utf8')).not.toContain(resEnroll.body.secreto);
    expect(args.ciphertext.toString('base64')).not.toContain(resEnroll.body.secreto);
  });

  test('confirma con el primer codigo TOTP correcto: activa MFA, devuelve 10 codigos de recuperacion y un token de sesion', async () => {
    const preMfaToken = await loginYObtenerPreMfaToken();
    const resEnroll = await request(app)
      .post('/api/v1/client/auth/mfa/enroll')
      .set('Authorization', bearer(preMfaToken));
    const codigo = totp.generarCodigo({ secretoBase32: resEnroll.body.secreto });

    const resConfirm = await request(app)
      .post('/api/v1/client/auth/mfa/enroll/confirm')
      .set('Authorization', bearer(preMfaToken))
      .send({ codigo });

    expect(resConfirm.status).toBe(200);
    expect(resConfirm.body.codigosRecuperacion).toHaveLength(10);
    expect(new Set(resConfirm.body.codigosRecuperacion).size).toBe(10);
    expect(resConfirm.body.token).toEqual(expect.any(String));

    // Revision post-6B-2: no existe /me -- el perfil minimo (mismo shape que el login
    // anterior a 6B-2) debe ir en esta respuesta, es la unica oportunidad de construir la
    // sesion en el frontend.
    expect(resConfirm.body.cliente).toEqual({ id: 1, nombre: 'Juan Perez', email: 'juan@example.com' });
    // El secreto/otpauthUri (de mfa/enroll) y el preMfaToken (de login) ya cumplieron su
    // proposito: ninguno de los dos debe reaparecer en la respuesta que completa el MFA.
    expect(resConfirm.body.secreto).toBeUndefined();
    expect(resConfirm.body.otpauthUri).toBeUndefined();
    expect(resConfirm.body.preMfaToken).toBeUndefined();
  });

  test('el token de sesion emitido tras confirmar incluye token_use=session, audiencia de sesion, amr=[pwd,totp] y auth_time', async () => {
    const jwtLib = require('jsonwebtoken');
    const env = require('../../config/env');
    const preMfaToken = await loginYObtenerPreMfaToken();
    const resEnroll = await request(app)
      .post('/api/v1/client/auth/mfa/enroll')
      .set('Authorization', bearer(preMfaToken));
    const codigo = totp.generarCodigo({ secretoBase32: resEnroll.body.secreto });
    const resConfirm = await request(app)
      .post('/api/v1/client/auth/mfa/enroll/confirm')
      .set('Authorization', bearer(preMfaToken))
      .send({ codigo });

    const payload = jwtLib.decode(resConfirm.body.token);
    expect(payload.token_use).toBe('session');
    expect(payload.aud).toBe(env.JWT_AUD_CLIENTE);
    expect(payload.amr).toEqual(['pwd', 'totp']);
    expect(payload.auth_time).toEqual(expect.any(Number));
    // El token final NUNCA es valido contra el verificador pre-MFA (audiencia+token_use
    // distintos), confirmando que es genuinamente un token de SESION, no un pre-MFA disfrazado.
    const resConSesionEnRutaPreMfa = await request(app)
      .post('/api/v1/client/auth/mfa/verify')
      .set('Authorization', bearer(resConfirm.body.token))
      .send({ codigo: '000000' });
    expect(resConSesionEnRutaPreMfa.status).toBe(401);
    expect(resConSesionEnRutaPreMfa.body.codigo).toBe('TOKEN_INVALID');
  });

  test('cliente/nombre nunca se toma del body: un intento de inyectar "cliente" en el body se rechaza (.strict())', async () => {
    const preMfaToken = await loginYObtenerPreMfaToken();
    const resEnroll = await request(app)
      .post('/api/v1/client/auth/mfa/enroll')
      .set('Authorization', bearer(preMfaToken));
    const codigo = totp.generarCodigo({ secretoBase32: resEnroll.body.secreto });

    const res = await request(app)
      .post('/api/v1/client/auth/mfa/enroll/confirm')
      .set('Authorization', bearer(preMfaToken))
      .send({ codigo, cliente: { id: 999, nombre: 'Suplantado', email: 'atacante@evil.com' } });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('VALIDATION_ERROR');
  });

  test('un codigo de confirmacion incorrecto responde 400 MFA_ENROLLMENT_INVALID, sin activar MFA', async () => {
    const preMfaToken = await loginYObtenerPreMfaToken();
    await request(app).post('/api/v1/client/auth/mfa/enroll').set('Authorization', bearer(preMfaToken));

    const res = await request(app)
      .post('/api/v1/client/auth/mfa/enroll/confirm')
      .set('Authorization', bearer(preMfaToken))
      .send({ codigo: '000000' });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('MFA_ENROLLMENT_INVALID');
  });

  test('confirmar sin haber llamado a enroll primero responde 409 MFA_ENROLLMENT_REQUIRED', async () => {
    const preMfaToken = await loginYObtenerPreMfaToken();

    const res = await request(app)
      .post('/api/v1/client/auth/mfa/enroll/confirm')
      .set('Authorization', bearer(preMfaToken))
      .send({ codigo: '123456' });

    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe('MFA_ENROLLMENT_REQUIRED');
  });

  test('llamar a enroll cuando el MFA ya esta ACTIVO responde 409 MFA_CHALLENGE_REQUIRED', async () => {
    clienteMfaRepository.obtenerEstado.mockResolvedValueOnce({ estado: 'ACTIVO' });
    const preMfaToken = signClientePreMfaToken({ id: 1, email: 'juan@example.com' });

    const res = await request(app)
      .post('/api/v1/client/auth/mfa/enroll')
      .set('Authorization', bearer(preMfaToken));

    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe('MFA_CHALLENGE_REQUIRED');
  });

  test('ningun secreto, URI, codigo TOTP ni codigo de recuperacion aparece en logs (console) durante el flujo completo', async () => {
    const spyLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    const spyError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const spyWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const preMfaToken = await loginYObtenerPreMfaToken();
    const resEnroll = await request(app)
      .post('/api/v1/client/auth/mfa/enroll')
      .set('Authorization', bearer(preMfaToken));
    const codigo = totp.generarCodigo({ secretoBase32: resEnroll.body.secreto });
    await request(app)
      .post('/api/v1/client/auth/mfa/enroll/confirm')
      .set('Authorization', bearer(preMfaToken))
      .send({ codigo });

    // logger.error si se usa, escribe con console.log en JSON (ver utils/logger.js);
    // ninguna de las tres rutas de este flujo debio disparar un error, asi que ninguno de
    // los tres deberia haberse llamado.
    expect(spyLog).not.toHaveBeenCalled();
    expect(spyError).not.toHaveBeenCalled();
    expect(spyWarn).not.toHaveBeenCalled();

    spyLog.mockRestore();
    spyError.mockRestore();
    spyWarn.mockRestore();
  });
});

describe('desafio MFA de cliente (mfa/verify)', () => {
  // Reloj controlado (solo Date, nunca los timers): el paso de confirmar enrolamiento
  // consume un timestep real (anti-replay, ver services/mfaService.js#confirmarEnrolamiento
  // -- el servidor SIEMPRE valida contra Date.now(), no acepta un reloj inyectado desde la
  // peticion HTTP, asi que la unica forma de controlar "el instante que ve el servidor"
  // desde una prueba end-to-end es congelar/avanzar Date globalmente). Sin esto, generar el
  // codigo de confirmacion y luego el codigo del desafio en una prueba rapida casi siempre
  // caerian en el mismo paso de 30s real (todo el archivo corre en segundos), y el desafio
  // fallaria con MFA_CODE_REUSED por pura coincidencia de timing, no por el comportamiento
  // que la prueba quiere ejercitar. `doNotFake` deja intactos setTimeout/setImmediate/etc:
  // el simulador de "lock" de fila de las pruebas de concurrencia (y el propio Express/
  // supertest) los siguen necesitando de verdad.
  const RELOJ_SOLO_DATE = [
    'hrtime',
    'nextTick',
    'performance',
    'queueMicrotask',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'requestIdleCallback',
    'cancelIdleCallback',
    'setImmediate',
    'clearImmediate',
    'setInterval',
    'clearInterval',
    'setTimeout',
    'clearTimeout'
  ];
  const MOMENTO_ENROLAMIENTO = 1700000000000;
  // 3 pasos (90s) de separacion: claramente fuera de la ventana ±1 (30s) del enrolamiento,
  // sin acercarse al TTL de 5 minutos del token pre-MFA (PRE_MFA_EXPIRES_IN).
  const MOMENTO_DESAFIO = MOMENTO_ENROLAMIENTO + totp.PERIODO_SEGUNDOS * 1000 * 3;

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: RELOJ_SOLO_DATE });
    jest.setSystemTime(MOMENTO_ENROLAMIENTO);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function enrolarYActivar() {
    await mockClientePerfil();
    const resLogin = await request(app)
      .post('/api/v1/client/auth/login')
      .send({ email: 'juan@example.com', password: CLIENTE_PASSWORD });
    const preMfaToken = resLogin.body.preMfaToken;
    const resEnroll = await request(app)
      .post('/api/v1/client/auth/mfa/enroll')
      .set('Authorization', bearer(preMfaToken));
    const secretoBase32 = resEnroll.body.secreto;
    const codigo = totp.generarCodigo({ secretoBase32 }); // Date.now() congelado en MOMENTO_ENROLAMIENTO
    const resConfirm = await request(app)
      .post('/api/v1/client/auth/mfa/enroll/confirm')
      .set('Authorization', bearer(preMfaToken))
      .send({ codigo });
    return { secretoBase32, codigosRecuperacion: resConfirm.body.codigosRecuperacion };
  }

  // Un nuevo login (ya con MFA ACTIVO) para obtener un pre-MFA token fresco de cara al
  // desafio -- el pre-MFA usado para enrolar ya cumplio su proposito. Avanza el reloj
  // congelado a MOMENTO_DESAFIO (fuera de la ventana ±1 del enrolamiento) antes de generar
  // cualquier codigo para el desafio.
  async function loginConMfaActivo() {
    jest.setSystemTime(MOMENTO_DESAFIO);
    const res = await request(app)
      .post('/api/v1/client/auth/login')
      .send({ email: 'juan@example.com', password: CLIENTE_PASSWORD });
    expect(res.body.siguientePaso).toBe('MFA_CHALLENGE_REQUIRED');
    return res.body.preMfaToken;
  }

  test('TOTP valido emite un token de sesion con amr=[pwd,totp] y el perfil minimo del cliente, sin recovery codes', async () => {
    const jwtLib = require('jsonwebtoken');
    const env = require('../../config/env');
    const { secretoBase32 } = await enrolarYActivar();
    const preMfaToken = await loginConMfaActivo();
    const codigo = totp.generarCodigo({ secretoBase32 });

    const res = await request(app)
      .post('/api/v1/client/auth/mfa/verify')
      .set('Authorization', bearer(preMfaToken))
      .send({ codigo });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    const payload = jwtLib.decode(res.body.token);
    expect(payload.amr).toEqual(['pwd', 'totp']);
    expect(payload.token_use).toBe('session');
    expect(payload.aud).toBe(env.JWT_AUD_CLIENTE);
    expect(payload.auth_time).toEqual(expect.any(Number));

    // Revision post-6B-2: mismo perfil minimo que el login anterior a 6B-2; mfa/verify
    // NUNCA devuelve codigos de recuperacion (esos solo aparecen una vez, al confirmar el
    // enrolamiento) ni el preMfaToken ya usado.
    expect(res.body.cliente).toEqual({ id: 1, nombre: 'Juan Perez', email: 'juan@example.com' });
    expect(res.body.codigosRecuperacion).toBeUndefined();
    expect(res.body.preMfaToken).toBeUndefined();
  });

  test('TOTP invalido responde 401 MFA_INVALID_CODE', async () => {
    await enrolarYActivar();
    const preMfaToken = await loginConMfaActivo();

    const res = await request(app)
      .post('/api/v1/client/auth/mfa/verify')
      .set('Authorization', bearer(preMfaToken))
      .send({ codigo: '000000' });

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('MFA_INVALID_CODE');
  });

  test('un codigo fuera de la ventana ±1 responde 401 MFA_INVALID_CODE', async () => {
    const { secretoBase32 } = await enrolarYActivar();
    const preMfaToken = await loginConMfaActivo(); // avanza el reloj a MOMENTO_DESAFIO
    const dosPasosAntes = Date.now() - totp.PERIODO_SEGUNDOS * 1000 * 2;
    const codigoViejo = totp.generarCodigo({ secretoBase32, marcaDeTiempoMs: dosPasosAntes });

    const res = await request(app)
      .post('/api/v1/client/auth/mfa/verify')
      .set('Authorization', bearer(preMfaToken))
      .send({ codigo: codigoViejo });

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('MFA_INVALID_CODE');
  });

  test('reutilizar el mismo TOTP responde 401 MFA_CODE_REUSED en el segundo intento', async () => {
    const { secretoBase32 } = await enrolarYActivar();
    const preMfaToken = await loginConMfaActivo();
    const codigo = totp.generarCodigo({ secretoBase32 });

    const primera = await request(app)
      .post('/api/v1/client/auth/mfa/verify')
      .set('Authorization', bearer(preMfaToken))
      .send({ codigo });
    expect(primera.status).toBe(200);

    // Mismo pre-MFA token: en la practica ya se gasto (deberia pedirse uno nuevo), pero el
    // punto de este test es la reutilizacion del CODIGO TOTP, no del token pre-MFA -- se
    // repite el mismo codigo contra un pre-MFA token fresco para aislar esa unica variable.
    const preMfaToken2 = await loginConMfaActivo();
    const segunda = await request(app)
      .post('/api/v1/client/auth/mfa/verify')
      .set('Authorization', bearer(preMfaToken2))
      .send({ codigo });

    expect(segunda.status).toBe(401);
    expect(segunda.body.codigo).toBe('MFA_CODE_REUSED');
  });

  test('un codigo de recuperacion valido emite un token de sesion con amr=[pwd,recovery] y lo consume', async () => {
    const jwtLib = require('jsonwebtoken');
    const { codigosRecuperacion } = await enrolarYActivar();
    const preMfaToken = await loginConMfaActivo();

    const res = await request(app)
      .post('/api/v1/client/auth/mfa/verify')
      .set('Authorization', bearer(preMfaToken))
      .send({ codigoRecuperacion: codigosRecuperacion[0] });

    expect(res.status).toBe(200);
    const payload = jwtLib.decode(res.body.token);
    expect(payload.amr).toEqual(['pwd', 'recovery']);
    expect(res.body.cliente).toEqual({ id: 1, nombre: 'Juan Perez', email: 'juan@example.com' });
    // mfa/verify (por recovery code o por TOTP) nunca devuelve un lote nuevo de codigos de
    // recuperacion -- eso solo pasa una vez, al confirmar el enrolamiento.
    expect(res.body.codigosRecuperacion).toBeUndefined();
  });

  test('un codigo de recuperacion ya usado responde 401 RECOVERY_CODE_ALREADY_USED en el segundo intento', async () => {
    const { codigosRecuperacion } = await enrolarYActivar();
    const preMfaToken1 = await loginConMfaActivo();
    const primera = await request(app)
      .post('/api/v1/client/auth/mfa/verify')
      .set('Authorization', bearer(preMfaToken1))
      .send({ codigoRecuperacion: codigosRecuperacion[0] });
    expect(primera.status).toBe(200);

    const preMfaToken2 = await loginConMfaActivo();
    const segunda = await request(app)
      .post('/api/v1/client/auth/mfa/verify')
      .set('Authorization', bearer(preMfaToken2))
      .send({ codigoRecuperacion: codigosRecuperacion[0] });

    expect(segunda.status).toBe(401);
    expect(segunda.body.codigo).toBe('RECOVERY_CODE_ALREADY_USED');
  });

  test('un codigo de recuperacion que nunca existio responde 401 MFA_INVALID_CODE', async () => {
    await enrolarYActivar();
    const preMfaToken = await loginConMfaActivo();

    const res = await request(app)
      .post('/api/v1/client/auth/mfa/verify')
      .set('Authorization', bearer(preMfaToken))
      .send({ codigoRecuperacion: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ' });

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('MFA_INVALID_CODE');
  });

  test('si el cliente ya no existe en BD al completar el desafio, responde 401 TOKEN_INVALID sin consumir el codigo', async () => {
    // El perfil se relee ANTES de tocar mfaService (ver services/clienteAuthService.js):
    // si esa lectura falla, el codigo TOTP nunca llega a marcarse como usado.
    const { secretoBase32 } = await enrolarYActivar();
    const preMfaToken = await loginConMfaActivo();
    const codigo = totp.generarCodigo({ secretoBase32 });
    clienteRepository.obtenerPorId.mockResolvedValue(null); // fila borrada entre el login y el desafio

    const res = await request(app)
      .post('/api/v1/client/auth/mfa/verify')
      .set('Authorization', bearer(preMfaToken))
      .send({ codigo });

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('TOKEN_INVALID');
  });

  test('verify sin haber enrolado nunca responde 409 MFA_ENROLLMENT_REQUIRED', async () => {
    await mockClientePerfil();
    const resLogin = await request(app)
      .post('/api/v1/client/auth/login')
      .send({ email: 'juan@example.com', password: CLIENTE_PASSWORD });

    const res = await request(app)
      .post('/api/v1/client/auth/mfa/verify')
      .set('Authorization', bearer(resLogin.body.preMfaToken))
      .send({ codigo: '123456' });

    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe('MFA_ENROLLMENT_REQUIRED');
  });

  test('enviar codigo Y codigoRecuperacion a la vez se rechaza con VALIDATION_ERROR (mutuamente excluyentes)', async () => {
    await enrolarYActivar();
    const preMfaToken = await loginConMfaActivo();

    const res = await request(app)
      .post('/api/v1/client/auth/mfa/verify')
      .set('Authorization', bearer(preMfaToken))
      .send({ codigo: '123456', codigoRecuperacion: 'AAAA-BBBB-CCCC-DDDD-EEEE' });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('VALIDATION_ERROR');
  });

  test('dos verificaciones concurrentes del MISMO TOTP: solo una tiene exito', async () => {
    const { secretoBase32 } = await enrolarYActivar();
    // loginConMfaActivo() avanza el reloj a MOMENTO_DESAFIO -- debe llamarse ANTES de
    // generar el codigo, o el codigo saldria calculado todavia en MOMENTO_ENROLAMIENTO
    // (mismo timestep que el enrolamiento, que ya se marco usado).
    const [preMfaTokenA, preMfaTokenB] = await Promise.all([loginConMfaActivo(), loginConMfaActivo()]);
    const codigo = totp.generarCodigo({ secretoBase32 });

    const [resA, resB] = await Promise.all([
      request(app).post('/api/v1/client/auth/mfa/verify').set('Authorization', bearer(preMfaTokenA)).send({ codigo }),
      request(app).post('/api/v1/client/auth/mfa/verify').set('Authorization', bearer(preMfaTokenB)).send({ codigo })
    ]);

    const exitosas = [resA, resB].filter((r) => r.status === 200);
    const fallidas = [resA, resB].filter((r) => r.status === 401);
    expect(exitosas).toHaveLength(1);
    expect(fallidas).toHaveLength(1);
    expect(fallidas[0].body.codigo).toBe('MFA_CODE_REUSED');
  });

  test('dos consumos concurrentes del MISMO codigo de recuperacion: solo uno tiene exito', async () => {
    const { codigosRecuperacion } = await enrolarYActivar();
    const [preMfaTokenA, preMfaTokenB] = await Promise.all([loginConMfaActivo(), loginConMfaActivo()]);

    const [resA, resB] = await Promise.all([
      request(app)
        .post('/api/v1/client/auth/mfa/verify')
        .set('Authorization', bearer(preMfaTokenA))
        .send({ codigoRecuperacion: codigosRecuperacion[0] }),
      request(app)
        .post('/api/v1/client/auth/mfa/verify')
        .set('Authorization', bearer(preMfaTokenB))
        .send({ codigoRecuperacion: codigosRecuperacion[0] })
    ]);

    const exitosas = [resA, resB].filter((r) => r.status === 200);
    const fallidas = [resA, resB].filter((r) => r.status === 401);
    expect(exitosas).toHaveLength(1);
    expect(fallidas).toHaveLength(1);
    expect(fallidas[0].body.codigo).toBe('RECOVERY_CODE_ALREADY_USED');
  });

  test('ningun error de desafio incluye el secreto TOTP en la respuesta', async () => {
    const { secretoBase32 } = await enrolarYActivar();
    const preMfaToken = await loginConMfaActivo();

    const res = await request(app)
      .post('/api/v1/client/auth/mfa/verify')
      .set('Authorization', bearer(preMfaToken))
      .send({ codigo: '000000' });

    expect(JSON.stringify(res.body)).not.toContain(secretoBase32);
  });
});

describe('MFA de administrador: el rol en la sesion nueva viene de BD, no del token pre-MFA', () => {
  test('enrolar y confirmar como ANALISTA emite un token de sesion con rol=ANALISTA (releido de BD)', async () => {
    const jwtLib = require('jsonwebtoken');
    await mockAdminPerfil({ email: 'analista@prestamesta.com', rol: 'ANALISTA' });
    administradorRepository.obtenerActivoPorId.mockResolvedValue({ id: 1, rol: 'ANALISTA', activo: 1 });

    const resLogin = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'analista@prestamesta.com', password: ADMIN_PASSWORD });
    const preMfaToken = resLogin.body.preMfaToken;

    const resEnroll = await request(app)
      .post('/api/v1/admin/auth/mfa/enroll')
      .set('Authorization', bearer(preMfaToken));
    const codigo = totp.generarCodigo({ secretoBase32: resEnroll.body.secreto });

    const resConfirm = await request(app)
      .post('/api/v1/admin/auth/mfa/enroll/confirm')
      .set('Authorization', bearer(preMfaToken))
      .send({ codigo });

    expect(resConfirm.status).toBe(200);
    const payload = jwtLib.decode(resConfirm.body.token);
    expect(payload.rol).toBe('ANALISTA');
    expect(payload.tipoUsuario).toBe('ADMIN');

    // Revision post-6B-2: el perfil devuelto (no hay /me) usa el MISMO rol DB-releido que
    // ya quedo en el JWT -- nunca uno distinto de una segunda lectura inconsistente.
    expect(resConfirm.body.admin).toEqual({
      id: 1,
      nombre: 'Admin Principal',
      email: 'analista@prestamesta.com',
      rol: 'ANALISTA'
    });
    expect(resConfirm.body.secreto).toBeUndefined();
    expect(resConfirm.body.preMfaToken).toBeUndefined();
  });

  test('un administrador desactivado entre el login y el enrolamiento es rechazado (cargarAdministradorActual)', async () => {
    await mockAdminPerfil();
    const resLogin = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin@prestamesta.com', password: ADMIN_PASSWORD });

    administradorRepository.obtenerActivoPorId.mockResolvedValue(null); // desactivado despues del login

    const res = await request(app)
      .post('/api/v1/admin/auth/mfa/enroll')
      .set('Authorization', bearer(resLogin.body.preMfaToken));

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('TOKEN_INVALID');
  });
});
