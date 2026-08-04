// Pruebas de construccion de SQL de los listados/detalle nuevos (solo lectura). No hay
// MySQL disponible en este sandbox (ver CLAUDE.md), asi que esto NO prueba comportamiento
// real de la base de datos: automockea `config/db.mysql` (el pool) para inspeccionar
// exactamente que texto SQL y que parametros construye el repositorio, verificando que
// ningun valor de filtro se interpola en el texto de la query (siempre placeholders `?`) y
// que los filtros combinables se unen con AND. La correctitud de la ejecucion real (indices,
// locking, orden fisico) queda fuera de este sandbox, igual que el resto de repositories/.
jest.mock('../../config/db.mysql');

const pool = require('../../config/db.mysql');
const prestamoRepository = require('../../repositories/prestamoRepository');

beforeEach(() => {
  pool.query.mockReset();
  pool.query.mockResolvedValue([[{ total: 0 }], []]);
});

describe('prestamoRepository.listarPrestamosPorCliente', () => {
  test('filtra por cliente_id, ordena por fecha_solicitud DESC, id DESC, y pagina con LIMIT/OFFSET parametrizados', async () => {
    pool.query.mockResolvedValueOnce([[], []]); // SELECT de filas
    pool.query.mockResolvedValueOnce([[{ total: 0 }], []]); // SELECT COUNT(*)

    await prestamoRepository.listarPrestamosPorCliente({ clienteId: 7, page: 2, limit: 10 });

    const [sqlFilas, paramsFilas] = pool.query.mock.calls[0];
    expect(sqlFilas).toMatch(/WHERE p\.cliente_id = \?/);
    expect(sqlFilas).toMatch(/ORDER BY p\.fecha_solicitud DESC, p\.id DESC/);
    expect(sqlFilas).toMatch(/LIMIT \? OFFSET \?/);
    // offset = (page-1)*limit = 10
    expect(paramsFilas).toEqual([7, 10, 10]);

    const [sqlCount, paramsCount] = pool.query.mock.calls[1];
    expect(sqlCount).toMatch(/WHERE cliente_id = \?/);
    expect(paramsCount).toEqual([7]);
  });
});

describe('prestamoRepository.obtenerPrestamoClientePorId', () => {
  test('filtra por id Y cliente_id en la misma query (ownership dentro del SQL)', async () => {
    pool.query.mockResolvedValueOnce([[], []]);

    await prestamoRepository.obtenerPrestamoClientePorId({ prestamoId: 1, clienteId: 7 });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/WHERE p\.id = \? AND p\.cliente_id = \?/);
    expect(params).toEqual([1, 7]);
  });
});

describe('prestamoRepository.listarPrestamosAdmin', () => {
  test('sin filtros no agrega WHERE', async () => {
    pool.query.mockResolvedValueOnce([[], []]);
    pool.query.mockResolvedValueOnce([[{ total: 0 }], []]);

    await prestamoRepository.listarPrestamosAdmin({ filtros: {}, page: 1, limit: 20 });

    const [sqlFilas, paramsFilas] = pool.query.mock.calls[0];
    expect(sqlFilas).not.toMatch(/WHERE/);
    expect(paramsFilas).toEqual([20, 0]);
  });

  test('combina multiples filtros con AND, todos como parametros (nunca interpolados en el texto)', async () => {
    pool.query.mockResolvedValueOnce([[], []]);
    pool.query.mockResolvedValueOnce([[{ total: 0 }], []]);

    const filtros = {
      estado: 'PENDIENTE',
      clienteId: 7,
      creditoId: 3,
      fechaDesde: '2026-02-01',
      fechaHasta: '2026-02-10'
    };
    await prestamoRepository.listarPrestamosAdmin({ filtros, page: 1, limit: 20 });

    const [sqlFilas, paramsFilas] = pool.query.mock.calls[0];
    expect(sqlFilas).toMatch(
      /WHERE p\.estado = \? AND p\.cliente_id = \? AND p\.credito_id = \? AND p\.fecha_solicitud >= \? AND p\.fecha_solicitud < \?/
    );
    // Ningun valor real (PENDIENTE, 7, 3, la fecha) aparece literal en el texto SQL.
    expect(sqlFilas).not.toMatch(/PENDIENTE|2026-02/);

    // params: [estado, clienteId, creditoId, fechaDesdeDate, fechaHastaExclusivaDate, limit, offset]
    expect(paramsFilas[0]).toBe('PENDIENTE');
    expect(paramsFilas[1]).toBe(7);
    expect(paramsFilas[2]).toBe(3);
    expect(paramsFilas[3]).toBeInstanceOf(Date);
    expect(paramsFilas[3].getDate()).toBe(1); // inicio del dia (inclusivo)
    expect(paramsFilas[4]).toBeInstanceOf(Date);
    expect(paramsFilas[4].getDate()).toBe(11); // inicio del dia SIGUIENTE (limite exclusivo)
    expect(paramsFilas[5]).toBe(20);
    expect(paramsFilas[6]).toBe(0);

    const [sqlCount, paramsCount] = pool.query.mock.calls[1];
    expect(sqlCount).toMatch(/FROM prestamos p WHERE/);
    expect(paramsCount).toEqual(paramsFilas.slice(0, 5));
  });

  test('la query de conteo (para "total") nunca hace JOIN, los filtros ya viven en prestamos', async () => {
    pool.query.mockResolvedValueOnce([[], []]);
    pool.query.mockResolvedValueOnce([[{ total: 0 }], []]);

    await prestamoRepository.listarPrestamosAdmin({ filtros: { estado: 'APROBADO' }, page: 1, limit: 20 });

    const [sqlCount] = pool.query.mock.calls[1];
    expect(sqlCount).not.toMatch(/JOIN/);
  });
});

describe('prestamoRepository.obtenerPrestamoAdminPorId', () => {
  test('incluye JOIN a clientes/creditos y LEFT JOIN a avales, filtrado por id parametrizado', async () => {
    pool.query.mockResolvedValueOnce([[], []]);

    await prestamoRepository.obtenerPrestamoAdminPorId(42);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/JOIN clientes cl ON cl\.id = p\.cliente_id/);
    expect(sql).toMatch(/JOIN creditos cr ON cr\.id = p\.credito_id/);
    expect(sql).toMatch(/LEFT JOIN avales a ON a\.prestamo_id = p\.id/);
    expect(sql).toMatch(/WHERE p\.id = \?/);
    expect(params).toEqual([42]);
  });
});
