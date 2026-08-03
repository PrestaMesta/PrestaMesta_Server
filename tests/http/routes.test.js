jest.mock('../../repositories/administradorRepository');
jest.mock('../../repositories/clienteRepository');
jest.mock('../../repositories/prestamoRepository');
jest.mock('../../repositories/auditoriaRepository');

const request = require('supertest');
const { createApp } = require('../../app');
const administradorRepository = require('../../repositories/administradorRepository');
const prestamoRepository = require('../../repositories/prestamoRepository');
const auditoriaRepository = require('../../repositories/auditoriaRepository');
const { signAdminToken, signClienteToken } = require('../../utils/jwt');

auditoriaRepository.registrar.mockResolvedValue(undefined);

const app = createApp();

const SUPERADMIN = { id: 1, email: 'super@prestamesta.com', rol: 'SUPERADMIN' };
const ANALISTA = { id: 2, email: 'analista@prestamesta.com', rol: 'ANALISTA' };
const COBRADOR = { id: 3, email: 'cobrador@prestamesta.com', rol: 'COBRADOR' };
const CLIENTE = { id: 10, email: 'cliente@example.com' };

const bearer = (token) => `Bearer ${token}`;

describe('separacion de audiencias cliente/admin (rutas reales, via createApp())', () => {
  test('un token de CLIENTE es rechazado en una ruta administrativa', async () => {
    const token = signClienteToken(CLIENTE);
    const res = await request(app)
      .post('/api/v1/admin/administradores')
      .set('Authorization', bearer(token))
      .send({ nombre: 'X', email: 'x@x.com', password: 'AdminSuperSeguro123', rol: 'ANALISTA' });

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('TOKEN_INVALID');
  });

  test('un token de ADMIN es rechazado en una ruta exclusiva de cliente', async () => {
    const token = signAdminToken(SUPERADMIN);
    const res = await request(app)
      .post('/api/v1/prestamos/solicitar')
      .set('Authorization', bearer(token))
      .send({ credito_id: 1, monto_solicitado: 1000 });

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('TOKEN_INVALID');
  });

  test('sin token, no se puede crear un administrador', async () => {
    const res = await request(app)
      .post('/api/v1/admin/administradores')
      .send({ nombre: 'X', email: 'x@x.com', password: 'AdminSuperSeguro123', rol: 'ANALISTA' });

    expect(res.status).toBe(401);
  });
});

describe('re-verificacion en base de datos para acciones administrativas sensibles', () => {
  test('un administrador desactivado despues de emitir el token no puede actuar', async () => {
    administradorRepository.obtenerActivoPorId.mockResolvedValue(null);
    const token = signAdminToken(SUPERADMIN);

    const res = await request(app)
      .post('/api/v1/admin/administradores')
      .set('Authorization', bearer(token))
      .send({ nombre: 'X', email: 'nuevo@x.com', password: 'AdminSuperSeguro123', rol: 'ANALISTA' });

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('TOKEN_INVALID');
  });

  test('un administrador cuyo rol cambio (SUPERADMIN -> ANALISTA) ya no puede crear administradores', async () => {
    // El token todavia dice SUPERADMIN (se emitio antes del cambio); la BD ya dice ANALISTA.
    administradorRepository.obtenerActivoPorId.mockResolvedValue({ id: 1, rol: 'ANALISTA', activo: 1 });
    const token = signAdminToken(SUPERADMIN);

    const res = await request(app)
      .post('/api/v1/admin/administradores')
      .set('Authorization', bearer(token))
      .send({ nombre: 'X', email: 'nuevo@x.com', password: 'AdminSuperSeguro123', rol: 'ANALISTA' });

    expect(res.status).toBe(403);
    expect(res.body.codigo).toBe('FORBIDDEN');
  });
});

describe('matriz de roles', () => {
  test('ANALISTA no puede crear un administrador', async () => {
    administradorRepository.obtenerActivoPorId.mockResolvedValue({ id: 2, rol: 'ANALISTA', activo: 1 });
    const token = signAdminToken(ANALISTA);

    const res = await request(app)
      .post('/api/v1/admin/administradores')
      .set('Authorization', bearer(token))
      .send({ nombre: 'X', email: 'nuevo@x.com', password: 'AdminSuperSeguro123', rol: 'ANALISTA' });

    expect(res.status).toBe(403);
  });

  test('COBRADOR no puede aprobar un prestamo', async () => {
    administradorRepository.obtenerActivoPorId.mockResolvedValue({ id: 3, rol: 'COBRADOR', activo: 1 });
    const token = signAdminToken(COBRADOR);

    const res = await request(app)
      .patch('/api/v1/prestamos/1/estado')
      .set('Authorization', bearer(token))
      .send({ estado: 'APROBADO' });

    expect(res.status).toBe(403);
  });

  test('SUPERADMIN si puede crear un administrador (camino feliz)', async () => {
    administradorRepository.obtenerActivoPorId.mockResolvedValue({ id: 1, rol: 'SUPERADMIN', activo: 1 });
    administradorRepository.existePorEmail.mockResolvedValue(false);
    administradorRepository.crear.mockResolvedValue(55);
    const token = signAdminToken(SUPERADMIN);

    const res = await request(app)
      .post('/api/v1/admin/administradores')
      .set('Authorization', bearer(token))
      .send({ nombre: 'Nuevo', email: 'nuevo@prestamesta.com', password: 'AdminSuperSeguro123', rol: 'ANALISTA' });

    expect(res.status).toBe(201);
    expect(res.body.adminId).toBe(55);
  });
});

describe('prestamos: 404 vs 409, y validacion estricta', () => {
  beforeEach(() => {
    administradorRepository.obtenerActivoPorId.mockResolvedValue({ id: 1, rol: 'SUPERADMIN', activo: 1 });
  });

  test('un prestamo inexistente devuelve 404 LOAN_NOT_FOUND (no 409)', async () => {
    prestamoRepository.cambiarEstado.mockResolvedValue({ resultado: 'NO_ENCONTRADO' });
    const token = signAdminToken(SUPERADMIN);

    const res = await request(app)
      .patch('/api/v1/prestamos/999/estado')
      .set('Authorization', bearer(token))
      .send({ estado: 'APROBADO' });

    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe('LOAN_NOT_FOUND');
  });

  test('un prestamo ya procesado devuelve 409 INVALID_TRANSITION (no 404)', async () => {
    prestamoRepository.cambiarEstado.mockResolvedValue({ resultado: 'TRANSICION_INVALIDA', estadoActual: 'APROBADO' });
    const token = signAdminToken(SUPERADMIN);

    const res = await request(app)
      .patch('/api/v1/prestamos/1/estado')
      .set('Authorization', bearer(token))
      .send({ estado: 'RECHAZADO' });

    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe('INVALID_TRANSITION');
  });

  test('rechaza cliente_id/rol/monto_total_a_pagar en el body de solicitar antes de llegar al servicio', async () => {
    const token = signClienteToken(CLIENTE);

    const res = await request(app)
      .post('/api/v1/prestamos/solicitar')
      .set('Authorization', bearer(token))
      .send({ credito_id: 1, monto_solicitado: 1000, cliente_id: 999, monto_total_a_pagar: 1 });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('VALIDATION_ERROR');
    expect(prestamoRepository.crearSolicitud).not.toHaveBeenCalled();
  });

  test('rechaza un password que excede el limite seguro de bcrypt al crear administrador', async () => {
    administradorRepository.obtenerActivoPorId.mockResolvedValue({ id: 1, rol: 'SUPERADMIN', activo: 1 });
    const token = signAdminToken(SUPERADMIN);

    const res = await request(app)
      .post('/api/v1/admin/administradores')
      .set('Authorization', bearer(token))
      .send({
        nombre: 'X',
        email: 'nuevo@x.com',
        password: `Aa1${'x'.repeat(80)}`,
        rol: 'ANALISTA'
      });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('VALIDATION_ERROR');
    expect(administradorRepository.crear).not.toHaveBeenCalled();
  });
});

describe('errores internos nunca filtran detalles', () => {
  test('un error inesperado del repositorio responde 500 generico, sin mensaje crudo ni stack', async () => {
    administradorRepository.obtenerActivoPorId.mockResolvedValue({ id: 1, rol: 'SUPERADMIN', activo: 1 });
    prestamoRepository.listarCreditos.mockRejectedValue(
      new Error('ER_ACCESS_DENIED_ERROR: password incorrecto para root@host')
    );
    const token = signAdminToken(SUPERADMIN);

    const res = await request(app).get('/api/v1/prestamos/creditos').set('Authorization', bearer(token));

    expect(res.status).toBe(500);
    expect(res.body.codigo).toBe('INTERNAL_ERROR');
    expect(res.body.mensaje).not.toMatch(/ER_ACCESS_DENIED|password/i);
    expect(res.body.stack).toBeUndefined();
    expect(res.body.requestId).toEqual(expect.any(String));
  });
});

describe('/health/live no depende de MySQL ni Mongo', () => {
  test('responde 200 ok sin ninguna base de datos disponible', async () => {
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
