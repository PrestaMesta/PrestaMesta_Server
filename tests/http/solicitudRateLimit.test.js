// Este archivo necesita un limite bajo y deterministico, distinto del valor generoso que
// tests/env.setup.js deja por defecto (para no interferir con otros archivos que llaman a
// /solicitar unas pocas veces). Un modulo separado obtiene su propio registro de modulos
// en Jest, asi que sobreescribir aqui, antes de requerir app.js, no afecta a otros
// archivos de prueba.
process.env.SOLICITUD_RATE_LIMIT_MAX = '2';
process.env.SOLICITUD_RATE_LIMIT_WINDOW_MS = '60000';

jest.mock('../../repositories/prestamoRepository');

const request = require('supertest');
const { createApp } = require('../../app');
const prestamoRepository = require('../../repositories/prestamoRepository');
const { signClienteToken } = require('../../utils/jwt');

const app = createApp();
const CLIENTE = { id: 1, email: 'cliente@example.com' };
const CREDITO = {
  id: 1,
  monto_minimo: '1000.00',
  monto_maximo: '20000.00',
  tasa_interes_anual: '24.00',
  plazo_meses: 12
};

describe('rate limit especifico de POST /prestamos/solicitar', () => {
  beforeEach(() => {
    prestamoRepository.obtenerCreditoPorId.mockResolvedValue(CREDITO);
    prestamoRepository.crearSolicitud.mockResolvedValue({
      prestamoId: 1,
      fechaSolicitud: new Date('2026-01-01T00:00:00.000Z')
    });
  });

  test('permite hasta SOLICITUD_RATE_LIMIT_MAX solicitudes y bloquea la siguiente con 429', async () => {
    const token = signClienteToken(CLIENTE);
    const body = { credito_id: 1, monto_solicitado: 1000 };

    const primera = await request(app)
      .post('/api/v1/prestamos/solicitar')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    const segunda = await request(app)
      .post('/api/v1/prestamos/solicitar')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    const tercera = await request(app)
      .post('/api/v1/prestamos/solicitar')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

    expect(primera.status).toBe(201);
    expect(segunda.status).toBe(201);
    expect(tercera.status).toBe(429);
    expect(prestamoRepository.crearSolicitud).toHaveBeenCalledTimes(2); // la 3a nunca llego al servicio
  });

  test('el limite de /solicitar no afecta a otras rutas de prestamos (limiters independientes)', async () => {
    // El limite de /solicitar ya se agoto en el test anterior, en el mismo `app`. Una ruta
    // sin ese rate limiter (GET /creditos) debe seguir respondiendo normalmente.
    prestamoRepository.listarCreditos.mockResolvedValue([]);
    const token = signClienteToken(CLIENTE);

    const res = await request(app).get('/api/v1/prestamos/creditos').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  test('la respuesta 429 no filtra detalles internos (mismo envelope de error)', async () => {
    const token = signClienteToken(CLIENTE);
    const body = { credito_id: 1, monto_solicitado: 1000 };

    // Ya se consumieron 2 del limite en el primer test de este archivo (mismo `app`); esta
    // ya deberia venir bloqueada.
    const res = await request(app)
      .post('/api/v1/prestamos/solicitar')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

    expect(res.status).toBe(429);
    expect(res.body).not.toHaveProperty('stack');
  });
});
