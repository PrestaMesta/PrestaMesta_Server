jest.mock('../../repositories/prestamoRepository');
jest.mock('../../repositories/administradorRepository');
jest.mock('../../repositories/auditoriaRepository');

const request = require('supertest');
const { createApp } = require('../../app');
const prestamoRepository = require('../../repositories/prestamoRepository');
const administradorRepository = require('../../repositories/administradorRepository');
const { signClienteSessionToken, signAdminSessionToken } = require('../../utils/jwt');

const app = createApp();

const CLIENTE = { id: 10, email: 'cliente@example.com' };
const OTRO_CLIENTE = { id: 11, email: 'otro@example.com' };
const SUPERADMIN = { id: 1, email: 'super@prestamesta.com', rol: 'SUPERADMIN' };
const ANALISTA = { id: 2, email: 'analista@prestamesta.com', rol: 'ANALISTA' };
const COBRADOR = { id: 3, email: 'cobrador@prestamesta.com', rol: 'COBRADOR' };

const bearer = (token) => `Bearer ${token}`;

function filaPrestamoCliente(overrides = {}) {
  return {
    id: 1,
    credito_id: 1,
    credito_nombre: 'Credito Personal Express',
    monto_solicitado: '10000.00',
    monto_total_a_pagar: '12400.00',
    saldo_pendiente: '12400.00',
    estado: 'PENDIENTE',
    fecha_solicitud: new Date('2026-01-01T12:00:00.000Z'),
    fecha_decision: null,
    ...overrides
  };
}

function filaAvalAusente() {
  return { aval_id: null, aval_nombre: null, aval_telefono: null, aval_direccion: null, aval_ingreso_mensual: null };
}

function filaAdminDetalle(overrides = {}) {
  return {
    id: 1,
    cliente_id: 10,
    cliente_nombre: 'Juan Perez',
    cliente_email: 'cliente@example.com',
    cliente_telefono: null,
    credito_id: 1,
    credito_nombre: 'Credito Personal Express',
    monto_minimo: '1000.00',
    monto_maximo: '20000.00',
    tasa_interes_anual: '24.00',
    plazo_meses: 12,
    credito_creado_en: new Date('2026-01-01T00:00:00.000Z'),
    monto_solicitado: '10000.00',
    monto_total_a_pagar: '12400.00',
    saldo_pendiente: '12400.00',
    estado: 'PENDIENTE',
    fecha_solicitud: new Date('2026-01-02T00:00:00.000Z'),
    fecha_decision: null,
    ...filaAvalAusente(),
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/v1/client/prestamos', () => {
  test('lista los prestamos del cliente autenticado (cliente_id sale del JWT)', async () => {
    prestamoRepository.listarPrestamosPorCliente.mockResolvedValue({
      rows: [filaPrestamoCliente()],
      total: 1
    });
    const token = signClienteSessionToken(CLIENTE);

    const res = await request(app).get('/api/v1/client/prestamos').set('Authorization', bearer(token));

    expect(res.status).toBe(200);
    expect(prestamoRepository.listarPrestamosPorCliente).toHaveBeenCalledWith({
      clienteId: CLIENTE.id,
      page: 1,
      limit: 20
    });
    expect(res.body.data[0].credito).toEqual({ id: 1, nombre: 'Credito Personal Express' });
    expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  test('el cliente no puede alterar de quien consulta via query (cliente_id ignorado si se envia)', async () => {
    prestamoRepository.listarPrestamosPorCliente.mockResolvedValue({ rows: [], total: 0 });
    const token = signClienteSessionToken(CLIENTE);

    const res = await request(app)
      .get('/api/v1/client/prestamos')
      .query({ cliente_id: 999 })
      .set('Authorization', bearer(token));

    // cliente_id no es un query param reconocido por paginacionSchema (.strict()) -> 400,
    // nunca se usa ese valor para consultar por otro cliente.
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('VALIDATION_ERROR');
    expect(prestamoRepository.listarPrestamosPorCliente).not.toHaveBeenCalled();
  });

  test('lista vacia devuelve pagination correcta (total 0, totalPages 0)', async () => {
    prestamoRepository.listarPrestamosPorCliente.mockResolvedValue({ rows: [], total: 0 });
    const token = signClienteSessionToken(CLIENTE);

    const res = await request(app).get('/api/v1/client/prestamos').set('Authorization', bearer(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
  });

  test('una pagina fuera de rango responde 200 con data vacia, no 404', async () => {
    prestamoRepository.listarPrestamosPorCliente.mockResolvedValue({ rows: [], total: 2 });
    const token = signClienteSessionToken(CLIENTE);

    const res = await request(app)
      .get('/api/v1/client/prestamos')
      .query({ page: 50 })
      .set('Authorization', bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(2);
  });

  test('parametros de query repetidos se rechazan con VALIDATION_ERROR', async () => {
    const token = signClienteSessionToken(CLIENTE);

    const res = await request(app)
      .get('/api/v1/client/prestamos?page=1&page=2')
      .set('Authorization', bearer(token));

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('VALIDATION_ERROR');
  });

  test('un token de ADMIN es rechazado en la ruta de cliente (separacion de audiencias)', async () => {
    const token = signAdminSessionToken(SUPERADMIN);

    const res = await request(app).get('/api/v1/client/prestamos').set('Authorization', bearer(token));

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('TOKEN_INVALID');
  });

  test('nunca aparece un campo password en la respuesta serializada', async () => {
    prestamoRepository.listarPrestamosPorCliente.mockResolvedValue({
      rows: [filaPrestamoCliente()],
      total: 1
    });
    const token = signClienteSessionToken(CLIENTE);

    const res = await request(app).get('/api/v1/client/prestamos').set('Authorization', bearer(token));

    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });
});

describe('GET /api/v1/client/prestamos/:id', () => {
  test('devuelve el detalle propio, incluyendo credito y aval', async () => {
    prestamoRepository.obtenerPrestamoClientePorId.mockResolvedValue(
      filaPrestamoCliente({
        aval_id: 5,
        aval_nombre: 'Roberto Gomez',
        aval_telefono: '8711234567',
        aval_direccion: null,
        aval_ingreso_mensual: '0.00'
      })
    );
    const token = signClienteSessionToken(CLIENTE);

    const res = await request(app).get('/api/v1/client/prestamos/1').set('Authorization', bearer(token));

    expect(res.status).toBe(200);
    expect(prestamoRepository.obtenerPrestamoClientePorId).toHaveBeenCalledWith({
      prestamoId: 1,
      clienteId: CLIENTE.id
    });
    expect(res.body.credito).toEqual({ id: 1, nombre: 'Credito Personal Express' });
    expect(res.body.aval).toEqual({
      id: 5,
      nombre: 'Roberto Gomez',
      telefono: '8711234567',
      direccion: null,
      ingreso_mensual: '0.00'
    });
  });

  test('aval null cuando el prestamo no tiene aval', async () => {
    prestamoRepository.obtenerPrestamoClientePorId.mockResolvedValue(filaPrestamoCliente({ ...filaAvalAusente() }));
    const token = signClienteSessionToken(CLIENTE);

    const res = await request(app).get('/api/v1/client/prestamos/1').set('Authorization', bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.aval).toBeNull();
  });

  test('un cliente no puede consultar el prestamo de otro cliente (404 LOAN_NOT_FOUND, igual que inexistente)', async () => {
    // El repositorio filtra por WHERE id = ? AND cliente_id = ?: si el prestamo es de otro
    // cliente, simplemente no aparece ninguna fila (0 filas), identico a un id inexistente.
    prestamoRepository.obtenerPrestamoClientePorId.mockResolvedValue(null);
    const token = signClienteSessionToken(OTRO_CLIENTE);

    const res = await request(app).get('/api/v1/client/prestamos/1').set('Authorization', bearer(token));

    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe('LOAN_NOT_FOUND');
    expect(prestamoRepository.obtenerPrestamoClientePorId).toHaveBeenCalledWith({ prestamoId: 1, clienteId: OTRO_CLIENTE.id });
  });

  test('un id inexistente responde el mismo 404 LOAN_NOT_FOUND', async () => {
    prestamoRepository.obtenerPrestamoClientePorId.mockResolvedValue(null);
    const token = signClienteSessionToken(CLIENTE);

    const res = await request(app).get('/api/v1/client/prestamos/999').set('Authorization', bearer(token));

    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe('LOAN_NOT_FOUND');
  });

  test('un id invalido (no numerico) se rechaza con VALIDATION_ERROR', async () => {
    const token = signClienteSessionToken(CLIENTE);

    const res = await request(app).get('/api/v1/client/prestamos/abc').set('Authorization', bearer(token));

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/v1/admin/prestamos', () => {
  beforeEach(() => {
    administradorRepository.obtenerActivoPorId.mockResolvedValue({ id: 1, rol: 'SUPERADMIN', activo: 1 });
  });

  test('SUPERADMIN puede listar con filtros combinados', async () => {
    prestamoRepository.listarPrestamosAdmin.mockResolvedValue({ rows: [], total: 0 });
    const token = signAdminSessionToken(SUPERADMIN);

    const res = await request(app)
      .get('/api/v1/admin/prestamos')
      .query({ estado: 'PENDIENTE', cliente_id: 7, fecha_desde: '2026-01-01', fecha_hasta: '2026-01-31' })
      .set('Authorization', bearer(token));

    expect(res.status).toBe(200);
    expect(prestamoRepository.listarPrestamosAdmin).toHaveBeenCalledWith({
      filtros: {
        estado: 'PENDIENTE',
        clienteId: 7,
        creditoId: undefined,
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-01-31'
      },
      page: 1,
      limit: 20
    });
  });

  test('ANALISTA tambien puede listar', async () => {
    administradorRepository.obtenerActivoPorId.mockResolvedValue({ id: 2, rol: 'ANALISTA', activo: 1 });
    prestamoRepository.listarPrestamosAdmin.mockResolvedValue({ rows: [], total: 0 });
    const token = signAdminSessionToken(ANALISTA);

    const res = await request(app).get('/api/v1/admin/prestamos').set('Authorization', bearer(token));

    expect(res.status).toBe(200);
  });

  test('COBRADOR no tiene acceso (403 FORBIDDEN)', async () => {
    administradorRepository.obtenerActivoPorId.mockResolvedValue({ id: 3, rol: 'COBRADOR', activo: 1 });
    const token = signAdminSessionToken(COBRADOR);

    const res = await request(app).get('/api/v1/admin/prestamos').set('Authorization', bearer(token));

    expect(res.status).toBe(403);
    expect(res.body.codigo).toBe('FORBIDDEN');
  });

  test('un token de CLIENTE es rechazado en la ruta admin (separacion de audiencias)', async () => {
    const token = signClienteSessionToken(CLIENTE);

    const res = await request(app).get('/api/v1/admin/prestamos').set('Authorization', bearer(token));

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('TOKEN_INVALID');
  });

  test('fecha_desde posterior a fecha_hasta -> 400 VALIDATION_ERROR', async () => {
    const token = signAdminSessionToken(SUPERADMIN);

    const res = await request(app)
      .get('/api/v1/admin/prestamos')
      .query({ fecha_desde: '2026-02-10', fecha_hasta: '2026-02-01' })
      .set('Authorization', bearer(token));

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('VALIDATION_ERROR');
    expect(prestamoRepository.listarPrestamosAdmin).not.toHaveBeenCalled();
  });

  test('fecha invalida -> 400 VALIDATION_ERROR', async () => {
    const token = signAdminSessionToken(SUPERADMIN);

    const res = await request(app)
      .get('/api/v1/admin/prestamos')
      .query({ fecha_desde: '2026-13-40' })
      .set('Authorization', bearer(token));

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('VALIDATION_ERROR');
  });

  test('solo fecha_desde: se envia sin fecha_hasta al servicio', async () => {
    prestamoRepository.listarPrestamosAdmin.mockResolvedValue({ rows: [], total: 0 });
    const token = signAdminSessionToken(SUPERADMIN);

    await request(app)
      .get('/api/v1/admin/prestamos')
      .query({ fecha_desde: '2026-01-01' })
      .set('Authorization', bearer(token));

    expect(prestamoRepository.listarPrestamosAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ filtros: expect.objectContaining({ fechaDesde: '2026-01-01', fechaHasta: undefined }) })
    );
  });

  test('solo fecha_hasta: se envia sin fecha_desde al servicio', async () => {
    prestamoRepository.listarPrestamosAdmin.mockResolvedValue({ rows: [], total: 0 });
    const token = signAdminSessionToken(SUPERADMIN);

    await request(app)
      .get('/api/v1/admin/prestamos')
      .query({ fecha_hasta: '2026-01-31' })
      .set('Authorization', bearer(token));

    expect(prestamoRepository.listarPrestamosAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ filtros: expect.objectContaining({ fechaDesde: undefined, fechaHasta: '2026-01-31' }) })
    );
  });

  test('query params desconocidos se rechazan (.strict())', async () => {
    const token = signAdminSessionToken(SUPERADMIN);

    const res = await request(app)
      .get('/api/v1/admin/prestamos')
      .query({ busqueda: 'juan' })
      .set('Authorization', bearer(token));

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('VALIDATION_ERROR');
  });

  test('parametros repetidos (estado duplicado) se rechazan', async () => {
    const token = signAdminSessionToken(SUPERADMIN);

    const res = await request(app)
      .get('/api/v1/admin/prestamos?estado=PENDIENTE&estado=APROBADO')
      .set('Authorization', bearer(token));

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('VALIDATION_ERROR');
  });

  test('nunca aparece un campo password en la respuesta serializada', async () => {
    prestamoRepository.listarPrestamosAdmin.mockResolvedValue({
      rows: [
        {
          ...filaPrestamoCliente(),
          cliente_id: 10,
          cliente_nombre: 'Juan Perez',
          cliente_email: 'cliente@example.com'
        }
      ],
      total: 1
    });
    const token = signAdminSessionToken(SUPERADMIN);

    const res = await request(app).get('/api/v1/admin/prestamos').set('Authorization', bearer(token));

    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });
});

describe('GET /api/v1/admin/prestamos/:id', () => {
  beforeEach(() => {
    administradorRepository.obtenerActivoPorId.mockResolvedValue({ id: 1, rol: 'SUPERADMIN', activo: 1 });
  });

  test('devuelve detalle completo con cliente, credito y aval', async () => {
    prestamoRepository.obtenerPrestamoAdminPorId.mockResolvedValue(
      filaAdminDetalle({
        aval_id: 5,
        aval_nombre: 'Roberto Gomez',
        aval_telefono: '8711234567',
        aval_direccion: 'Av. Morelos #450',
        aval_ingreso_mensual: '5000.00'
      })
    );
    const token = signAdminSessionToken(SUPERADMIN);

    const res = await request(app).get('/api/v1/admin/prestamos/1').set('Authorization', bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.cliente).toEqual({
      id: 10,
      nombre: 'Juan Perez',
      email: 'cliente@example.com',
      telefono: null
    });
    expect(res.body.credito.monto_minimo).toBe('1000.00');
    expect(res.body.aval).toEqual({
      id: 5,
      nombre: 'Roberto Gomez',
      telefono: '8711234567',
      direccion: 'Av. Morelos #450',
      ingreso_mensual: '5000.00'
    });
  });

  test('aval null en el detalle cuando el prestamo no tiene aval', async () => {
    prestamoRepository.obtenerPrestamoAdminPorId.mockResolvedValue(filaAdminDetalle());
    const token = signAdminSessionToken(SUPERADMIN);

    const res = await request(app).get('/api/v1/admin/prestamos/1').set('Authorization', bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.aval).toBeNull();
  });

  test('prestamo inexistente -> 404 LOAN_NOT_FOUND', async () => {
    prestamoRepository.obtenerPrestamoAdminPorId.mockResolvedValue(null);
    const token = signAdminSessionToken(SUPERADMIN);

    const res = await request(app).get('/api/v1/admin/prestamos/999').set('Authorization', bearer(token));

    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe('LOAN_NOT_FOUND');
  });

  test('COBRADOR no tiene acceso al detalle administrativo', async () => {
    administradorRepository.obtenerActivoPorId.mockResolvedValue({ id: 3, rol: 'COBRADOR', activo: 1 });
    const token = signAdminSessionToken(COBRADOR);

    const res = await request(app).get('/api/v1/admin/prestamos/1').set('Authorization', bearer(token));

    expect(res.status).toBe(403);
  });

  test('un token de CLIENTE es rechazado (separacion de audiencias)', async () => {
    const token = signClienteSessionToken(CLIENTE);

    const res = await request(app).get('/api/v1/admin/prestamos/1').set('Authorization', bearer(token));

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('TOKEN_INVALID');
  });

  test('todos los montos DECIMAL salen como string, nunca number', async () => {
    prestamoRepository.obtenerPrestamoAdminPorId.mockResolvedValue(filaAdminDetalle());
    const token = signAdminSessionToken(SUPERADMIN);

    const res = await request(app).get('/api/v1/admin/prestamos/1').set('Authorization', bearer(token));

    for (const campo of ['monto_solicitado', 'monto_total_a_pagar', 'saldo_pendiente']) {
      expect(typeof res.body[campo]).toBe('string');
    }
    for (const campo of ['monto_minimo', 'monto_maximo', 'tasa_interes_anual']) {
      expect(typeof res.body.credito[campo]).toBe('string');
    }
  });
});
