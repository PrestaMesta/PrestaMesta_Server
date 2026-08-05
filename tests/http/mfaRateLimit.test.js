// Este archivo necesita un limite bajo y deterministico, distinto del valor generoso que
// tests/env.setup.js deja por defecto (para no interferir con otros archivos de prueba que
// llaman a rutas MFA varias veces). Un modulo separado obtiene su propio registro de
// modulos en Jest, asi que sobreescribir aqui, antes de requerir app.js, no afecta a otros
// archivos de prueba -- mismo patron que tests/http/solicitudRateLimit.test.js.
process.env.MFA_RATE_LIMIT_MAX = '2';
process.env.MFA_RATE_LIMIT_WINDOW_MS = '600000';

jest.mock('../../repositories/clienteMfaRepository');
jest.mock('../../repositories/clienteRepository');

const request = require('supertest');
const { createApp } = require('../../app');
const clienteMfaRepository = require('../../repositories/clienteMfaRepository');
const { signClientePreMfaToken } = require('../../utils/jwt');

const app = createApp();

beforeEach(() => {
  // No importa el resultado exacto (el rate limiter corre ANTES de tocar esto); solo se
  // mockea para que las primeras peticiones (las que si llegan al handler antes del limite)
  // fallen de forma controlada y rapida, en vez de depender de que MySQL este disponible.
  clienteMfaRepository.obtenerEstado.mockResolvedValue(null);
});

describe('rate limit especifico de los endpoints MFA (mfa/verify, mfa/enroll/confirm)', () => {
  test('permite hasta MFA_RATE_LIMIT_MAX intentos y bloquea el siguiente con 429 MFA_RATE_LIMITED', async () => {
    // mfaRateLimiter es el PRIMER middleware de la ruta (antes de verificar el token), asi
    // que cuenta independientemente de si el token/codigo son validos -- no hace falta un
    // enrolamiento real para ejercitar el limite.
    const tokenPreMfa = signClientePreMfaToken({ id: 1, email: 'juan@example.com' });
    const body = { codigo: '123456' };

    const primera = await request(app)
      .post('/api/v1/client/auth/mfa/verify')
      .set('Authorization', `Bearer ${tokenPreMfa}`)
      .send(body);
    const segunda = await request(app)
      .post('/api/v1/client/auth/mfa/verify')
      .set('Authorization', `Bearer ${tokenPreMfa}`)
      .send(body);
    const tercera = await request(app)
      .post('/api/v1/client/auth/mfa/verify')
      .set('Authorization', `Bearer ${tokenPreMfa}`)
      .send(body);

    expect(primera.status).not.toBe(429);
    expect(segunda.status).not.toBe(429);
    expect(tercera.status).toBe(429);
    expect(tercera.body).toEqual({
      mensaje: expect.any(String),
      codigo: 'MFA_RATE_LIMITED',
      requestId: expect.any(String)
    });
  });

  test('el limite de mfa/verify no afecta a mfa/enroll (limiters independientes por ruta)', async () => {
    // El limite de mfa/verify ya se agoto en el test anterior, en el mismo `app`.
    // mfa/enroll no tiene mfaRateLimiter (solo mfa/enroll/confirm y mfa/verify lo llevan,
    // ver routes/authRoutes.js): debe seguir respondiendo con normalidad.
    const tokenPreMfa = signClientePreMfaToken({ id: 1, email: 'juan@example.com' });

    const res = await request(app).post('/api/v1/client/auth/mfa/enroll').set('Authorization', `Bearer ${tokenPreMfa}`);

    expect(res.status).not.toBe(429);
  });

  test('el limite de MFA no comparte contador con authRateLimiter (login sigue respondiendo)', async () => {
    const res = await request(app)
      .post('/api/v1/client/auth/login')
      .send({ email: 'no-existe@example.com', password: 'cualquierPassword123' });

    expect(res.status).not.toBe(429);
  });

  test('la respuesta 429 de MFA no filtra detalles internos', async () => {
    const tokenPreMfa = signClientePreMfaToken({ id: 1, email: 'juan@example.com' });

    // Ya se agoto el limite en el primer test de este archivo (mismo `app`).
    const res = await request(app)
      .post('/api/v1/client/auth/mfa/verify')
      .set('Authorization', `Bearer ${tokenPreMfa}`)
      .send({ codigo: '123456' });

    expect(res.status).toBe(429);
    expect(res.body).not.toHaveProperty('stack');
    expect(res.body).not.toHaveProperty('detalles');
  });
});
