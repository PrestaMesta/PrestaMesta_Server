const clienteAuth = require('../../validators/clienteAuthValidators');
const adminAuth = require('../../validators/adminAuthValidators');
const prestamo = require('../../validators/prestamoValidators');

describe('validators/clienteAuthValidators', () => {
  test('acepta un registro valido', () => {
    const result = clienteAuth.registerSchema.safeParse({
      nombre: 'Juan Perez',
      email: 'juan@example.com',
      password: 'miPasswordSeguro123',
      telefono: '8711234567'
    });
    expect(result.success).toBe(true);
  });

  test('normaliza el email a minusculas y sin espacios (trim + lowercase)', () => {
    const result = clienteAuth.registerSchema.safeParse({
      nombre: 'Juan Perez',
      email: '  Juan@Example.COM  ',
      password: 'miPasswordSeguro123'
    });
    expect(result.success).toBe(true);
    expect(result.data.email).toBe('juan@example.com');
  });

  test('rechaza password que no cumple la politica minima', () => {
    const result = clienteAuth.registerSchema.safeParse({
      nombre: 'Juan Perez',
      email: 'juan@example.com',
      password: 'corta1A'
    });
    expect(result.success).toBe(false);
  });

  test('rechaza un password que exceda el limite seguro de bcrypt (72 bytes)', () => {
    const result = clienteAuth.registerSchema.safeParse({
      nombre: 'Juan Perez',
      email: 'juan@example.com',
      password: `Aa1${'x'.repeat(80)}`
    });
    expect(result.success).toBe(false);
  });

  test('nunca normaliza el password (no trim, no lowercase)', () => {
    const result = clienteAuth.registerSchema.safeParse({
      nombre: 'Juan Perez',
      email: 'juan@example.com',
      password: '  miPasswordSeguro123  '
    });
    // El password con espacios sigue siendo valido tal cual (cumple longitud/complejidad),
    // y debe conservarse exactamente como se envio, sin trim.
    expect(result.success).toBe(true);
    expect(result.data.password).toBe('  miPasswordSeguro123  ');
  });

  test('rechaza propiedades desconocidas (.strict()), incluyendo un intento de auto-asignarse rol', () => {
    const result = clienteAuth.registerSchema.safeParse({
      nombre: 'Juan Perez',
      email: 'juan@example.com',
      password: 'miPasswordSeguro123',
      rol: 'SUPERADMIN'
    });
    expect(result.success).toBe(false);
  });

  test('rechaza email invalido', () => {
    const result = clienteAuth.loginSchema.safeParse({ email: 'no-es-un-email', password: 'x' });
    expect(result.success).toBe(false);
  });
});

describe('validators/adminAuthValidators', () => {
  test('rol es obligatorio: rechaza si falta (sin fallback silencioso)', () => {
    const result = adminAuth.crearAdministradorSchema.safeParse({
      nombre: 'Admin Principal',
      email: 'admin@prestamesta.com',
      password: 'AdminSuperSeguro123'
    });
    expect(result.success).toBe(false);
  });

  test('rechaza un rol fuera del enum (no se puede inventar un rol)', () => {
    const result = adminAuth.crearAdministradorSchema.safeParse({
      nombre: 'Admin Principal',
      email: 'admin@prestamesta.com',
      password: 'AdminSuperSeguro123',
      rol: 'DIOS'
    });
    expect(result.success).toBe(false);
  });

  test('acepta un registro admin valido con rol explicito y normaliza el email', () => {
    const result = adminAuth.crearAdministradorSchema.safeParse({
      nombre: 'Admin Principal',
      email: '  Admin@Prestamesta.com  ',
      password: 'AdminSuperSeguro123',
      rol: 'ANALISTA'
    });
    expect(result.success).toBe(true);
    expect(result.data.email).toBe('admin@prestamesta.com');
  });

  test('rechaza activo/id enviados por el cliente (.strict())', () => {
    const result = adminAuth.crearAdministradorSchema.safeParse({
      nombre: 'Admin Principal',
      email: 'admin@prestamesta.com',
      password: 'AdminSuperSeguro123',
      rol: 'ANALISTA',
      activo: false,
      id: 999
    });
    expect(result.success).toBe(false);
  });
});

describe('validators/prestamoValidators', () => {
  test('crearCreditoSchema rechaza monto_maximo < monto_minimo', () => {
    const result = prestamo.crearCreditoSchema.safeParse({
      nombre: 'Credito X',
      monto_minimo: 5000,
      monto_maximo: 1000,
      tasa_interes_anual: 24,
      plazo_meses: 12
    });
    expect(result.success).toBe(false);
  });

  test('crearCreditoSchema acepta datos validos', () => {
    const result = prestamo.crearCreditoSchema.safeParse({
      nombre: 'Credito Personal Express',
      monto_minimo: 1000,
      monto_maximo: 20000,
      tasa_interes_anual: 24,
      plazo_meses: 12
    });
    expect(result.success).toBe(true);
  });

  test('solicitarPrestamoSchema nunca acepta monto_total_a_pagar, saldo_pendiente ni cliente_id del cliente', () => {
    for (const campoProhibido of ['monto_total_a_pagar', 'saldo_pendiente', 'cliente_id', 'estado']) {
      const result = prestamo.solicitarPrestamoSchema.safeParse({
        credito_id: 1,
        monto_solicitado: 10000,
        [campoProhibido]: 1
      });
      expect(result.success).toBe(false);
    }
  });

  test('solicitarPrestamoSchema valida longitudes maximas del aval', () => {
    const result = prestamo.solicitarPrestamoSchema.safeParse({
      credito_id: 1,
      monto_solicitado: 10000,
      aval: {
        nombre: 'a'.repeat(200),
        telefono: '8711234567'
      }
    });
    expect(result.success).toBe(false);
  });

  test('cambiarEstadoSchema solo acepta APROBADO o RECHAZADO, nunca PENDIENTE ni un estado libre', () => {
    expect(prestamo.cambiarEstadoSchema.safeParse({ estado: 'APROBADO' }).success).toBe(true);
    expect(prestamo.cambiarEstadoSchema.safeParse({ estado: 'PENDIENTE' }).success).toBe(false);
    expect(prestamo.cambiarEstadoSchema.safeParse({ estado: 'LO_QUE_SEA' }).success).toBe(false);
  });

  test('cambiarEstadoSchema rechaza administradorId/estadoAnterior enviados por el cliente', () => {
    const result = prestamo.cambiarEstadoSchema.safeParse({
      estado: 'APROBADO',
      administradorId: 999,
      estadoAnterior: 'RECHAZADO'
    });
    expect(result.success).toBe(false);
  });

  test('cambiarEstadoSchema limita la longitud del motivo', () => {
    const result = prestamo.cambiarEstadoSchema.safeParse({
      estado: 'RECHAZADO',
      motivo: 'x'.repeat(501)
    });
    expect(result.success).toBe(false);
  });

  test('idParamSchema rechaza ids no numericos o negativos', () => {
    expect(prestamo.idParamSchema.safeParse({ id: '5' }).success).toBe(true);
    expect(prestamo.idParamSchema.safeParse({ id: '-1' }).success).toBe(false);
    expect(prestamo.idParamSchema.safeParse({ id: 'abc' }).success).toBe(false);
  });

  describe('paginacionSchema (GET /client/prestamos)', () => {
    test('aplica defaults page=1 y limit=20 cuando no se envia nada', () => {
      const result = prestamo.paginacionSchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ page: 1, limit: 20 });
    });

    test('rechaza limit fuera de 1..100', () => {
      expect(prestamo.paginacionSchema.safeParse({ limit: '0' }).success).toBe(false);
      expect(prestamo.paginacionSchema.safeParse({ limit: '101' }).success).toBe(false);
      expect(prestamo.paginacionSchema.safeParse({ limit: '100' }).success).toBe(true);
    });

    test('rechaza page menor a 1', () => {
      expect(prestamo.paginacionSchema.safeParse({ page: '0' }).success).toBe(false);
    });

    test('rechaza un parametro repetido (forma de arreglo), no toma "el primero"', () => {
      const result = prestamo.paginacionSchema.safeParse({ page: ['1', '2'] });
      expect(result.success).toBe(false);
    });

    test('rechaza query params desconocidos (.strict())', () => {
      const result = prestamo.paginacionSchema.safeParse({ page: '1', ordenar: 'asc' });
      expect(result.success).toBe(false);
    });
  });

  describe('filtrosAdminPrestamoSchema (GET /admin/prestamos)', () => {
    test('acepta filtros combinados validos', () => {
      const result = prestamo.filtrosAdminPrestamoSchema.safeParse({
        estado: 'PENDIENTE',
        cliente_id: '7',
        credito_id: '1',
        fecha_desde: '2026-01-01',
        fecha_hasta: '2026-01-31',
        page: '2',
        limit: '10'
      });
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        estado: 'PENDIENTE',
        cliente_id: 7,
        credito_id: 1,
        fecha_desde: '2026-01-01',
        fecha_hasta: '2026-01-31',
        page: 2,
        limit: 10
      });
    });

    test('rechaza un estado fuera del enum', () => {
      expect(prestamo.filtrosAdminPrestamoSchema.safeParse({ estado: 'LO_QUE_SEA' }).success).toBe(false);
    });

    test('rechaza fecha con formato invalido', () => {
      expect(prestamo.filtrosAdminPrestamoSchema.safeParse({ fecha_desde: '01/01/2026' }).success).toBe(false);
    });

    test('rechaza una fecha de calendario imposible (2026-02-30)', () => {
      expect(prestamo.filtrosAdminPrestamoSchema.safeParse({ fecha_desde: '2026-02-30' }).success).toBe(false);
    });

    test('rechaza fecha_desde posterior a fecha_hasta', () => {
      const result = prestamo.filtrosAdminPrestamoSchema.safeParse({
        fecha_desde: '2026-02-10',
        fecha_hasta: '2026-02-01'
      });
      expect(result.success).toBe(false);
    });

    test('acepta fecha_desde igual a fecha_hasta (un solo dia)', () => {
      const result = prestamo.filtrosAdminPrestamoSchema.safeParse({
        fecha_desde: '2026-02-10',
        fecha_hasta: '2026-02-10'
      });
      expect(result.success).toBe(true);
    });

    test('rechaza cliente_id/credito_id repetidos (forma de arreglo)', () => {
      expect(prestamo.filtrosAdminPrestamoSchema.safeParse({ cliente_id: ['1', '2'] }).success).toBe(false);
      expect(prestamo.filtrosAdminPrestamoSchema.safeParse({ estado: ['PENDIENTE', 'APROBADO'] }).success).toBe(
        false
      );
    });

    test('rechaza query params desconocidos (.strict())', () => {
      const result = prestamo.filtrosAdminPrestamoSchema.safeParse({ estado: 'PENDIENTE', busqueda: 'x' });
      expect(result.success).toBe(false);
    });
  });
});
