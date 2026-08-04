const { createPrestamoService } = require('../../services/prestamoService');

function crearRepoFalso(overrides = {}) {
  return {
    crearCredito: jest.fn(),
    listarCreditos: jest.fn(),
    obtenerCreditoPorId: jest.fn(),
    crearSolicitud: jest.fn(),
    cambiarEstado: jest.fn(),
    listarPrestamosPorCliente: jest.fn(),
    obtenerPrestamoClientePorId: jest.fn(),
    listarPrestamosAdmin: jest.fn(),
    obtenerPrestamoAdminPorId: jest.fn(),
    ...overrides
  };
}

function crearAuditRepoFalso(overrides = {}) {
  return { registrar: jest.fn().mockResolvedValue(undefined), ...overrides };
}

describe('prestamoService.solicitarPrestamo', () => {
  test('lanza CREDIT_NOT_FOUND si el credito no existe', async () => {
    const repo = crearRepoFalso({ obtenerCreditoPorId: jest.fn().mockResolvedValue(null) });
    const service = createPrestamoService({ prestamoRepository: repo, auditoriaRepository: crearAuditRepoFalso() });

    await expect(
      service.solicitarPrestamo({ clienteId: 1, credito_id: 99, monto_solicitado: 1000 })
    ).rejects.toMatchObject({ codigo: 'CREDIT_NOT_FOUND', status: 404 });
  });

  test('rechaza un monto fuera del rango del catalogo (nunca confia solo en la validacion del cliente)', async () => {
    const repo = crearRepoFalso({
      obtenerCreditoPorId: jest.fn().mockResolvedValue({
        id: 1,
        monto_minimo: '1000.00',
        monto_maximo: '20000.00',
        tasa_interes_anual: '24.00',
        plazo_meses: 12
      })
    });
    const service = createPrestamoService({ prestamoRepository: repo, auditoriaRepository: crearAuditRepoFalso() });

    await expect(
      service.solicitarPrestamo({ clienteId: 1, credito_id: 1, monto_solicitado: 999999 })
    ).rejects.toMatchObject({ codigo: 'VALIDATION_ERROR', status: 400 });
    expect(repo.crearSolicitud).not.toHaveBeenCalled();
  });

  test('calcula monto_total_a_pagar con la formula existente (nunca acepta uno enviado por el cliente)', async () => {
    const repo = crearRepoFalso({
      obtenerCreditoPorId: jest.fn().mockResolvedValue({
        id: 1,
        monto_minimo: '1000.00',
        monto_maximo: '20000.00',
        tasa_interes_anual: '24.00',
        plazo_meses: 12
      }),
      crearSolicitud: jest.fn().mockResolvedValue({
        prestamoId: 42,
        fechaSolicitud: new Date('2026-01-01T12:00:00.000Z')
      })
    });
    const service = createPrestamoService({ prestamoRepository: repo, auditoriaRepository: crearAuditRepoFalso() });

    const resultado = await service.solicitarPrestamo({
      clienteId: 1,
      credito_id: 1,
      monto_solicitado: 10000
    });

    expect(resultado.prestamoId).toBe(42);
    expect(resultado.fechaSolicitud).toEqual(new Date('2026-01-01T12:00:00.000Z'));
    expect(resultado.montoTotalAPagar).toBe('12400.00');
    expect(repo.crearSolicitud).toHaveBeenCalledWith(
      expect.objectContaining({
        clienteId: 1,
        creditoId: 1,
        montoSolicitado: 10000,
        montoTotalAPagar: '12400.00'
      })
    );
  });
});

describe('prestamoService.cambiarEstado', () => {
  test('un prestamo inexistente devuelve LOAN_NOT_FOUND (404), no INVALID_TRANSITION', async () => {
    const repo = crearRepoFalso({ cambiarEstado: jest.fn().mockResolvedValue({ resultado: 'NO_ENCONTRADO' }) });
    const service = createPrestamoService({ prestamoRepository: repo, auditoriaRepository: crearAuditRepoFalso() });

    await expect(
      service.cambiarEstado({ prestamoId: 999, nuevoEstado: 'APROBADO', administradorId: 1 })
    ).rejects.toMatchObject({ codigo: 'LOAN_NOT_FOUND', status: 404 });
  });

  test('un prestamo ya procesado devuelve INVALID_TRANSITION (409)', async () => {
    const repo = crearRepoFalso({
      cambiarEstado: jest.fn().mockResolvedValue({ resultado: 'TRANSICION_INVALIDA', estadoActual: 'APROBADO' })
    });
    const service = createPrestamoService({ prestamoRepository: repo, auditoriaRepository: crearAuditRepoFalso() });

    await expect(
      service.cambiarEstado({ prestamoId: 1, nuevoEstado: 'RECHAZADO', administradorId: 1 })
    ).rejects.toMatchObject({ codigo: 'INVALID_TRANSITION', status: 409 });
  });

  test('un fallo al registrar la auditoria NO revierte ni bloquea una transicion ya confirmada', async () => {
    const repo = crearRepoFalso({
      cambiarEstado: jest.fn().mockResolvedValue({ resultado: 'OK', estadoAnterior: 'PENDIENTE' })
    });
    const auditRepo = crearAuditRepoFalso({ registrar: jest.fn().mockRejectedValue(new Error('mongo caido')) });
    const service = createPrestamoService({ prestamoRepository: repo, auditoriaRepository: auditRepo });

    const resultado = await service.cambiarEstado({ prestamoId: 1, nuevoEstado: 'APROBADO', administradorId: 1 });
    expect(resultado.estadoNuevo).toBe('APROBADO');
    expect(auditRepo.registrar).toHaveBeenCalled();
  });

  test('dos decisiones concurrentes sobre el mismo prestamo: solo una se completa', async () => {
    // Simula, a nivel de servicio, el efecto del lock de `SELECT ... FOR UPDATE` del
    // repositorio real (repositories/prestamoRepository.js): la segunda transaccion
    // concurrente espera a que la primera libere el "lock" y entonces ve que el prestamo
    // ya no esta PENDIENTE. Esto NO prueba el locking real de MySQL (no hay MySQL en este
    // sandbox); prueba que prestamoService.cambiarEstado traduce correctamente ese
    // resultado a una unica respuesta exitosa y una unica 409, sin importar el orden de
    // llegada.
    let estado = 'PENDIENTE';
    let lockTomado = false;
    const repo = crearRepoFalso({
      cambiarEstado: jest.fn().mockImplementation(async ({ nuevoEstado }) => {
        while (lockTomado) {
          await new Promise((resolve) => setImmediate(resolve));
        }
        lockTomado = true;
        try {
          await new Promise((resolve) => setImmediate(resolve));
          if (estado !== 'PENDIENTE') {
            return { resultado: 'TRANSICION_INVALIDA', estadoActual: estado };
          }
          estado = nuevoEstado;
          return { resultado: 'OK', estadoAnterior: 'PENDIENTE' };
        } finally {
          lockTomado = false;
        }
      })
    });
    const service = createPrestamoService({ prestamoRepository: repo, auditoriaRepository: crearAuditRepoFalso() });

    const resultados = await Promise.allSettled([
      service.cambiarEstado({ prestamoId: 1, nuevoEstado: 'APROBADO', administradorId: 1 }),
      service.cambiarEstado({ prestamoId: 1, nuevoEstado: 'RECHAZADO', administradorId: 2 })
    ]);

    const exitosas = resultados.filter((r) => r.status === 'fulfilled');
    const fallidas = resultados.filter((r) => r.status === 'rejected');
    expect(exitosas).toHaveLength(1);
    expect(fallidas).toHaveLength(1);
    expect(fallidas[0].reason.codigo).toBe('INVALID_TRANSITION');
    expect(fallidas[0].reason.status).toBe(409);
  });
});

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

function filaAval(overrides = {}) {
  return {
    aval_id: 5,
    aval_nombre: 'Roberto Gomez',
    aval_telefono: '8711234567',
    aval_direccion: 'Av. Morelos #450',
    aval_ingreso_mensual: '5000.00',
    ...overrides
  };
}

function filaAvalAusente() {
  return {
    aval_id: null,
    aval_nombre: null,
    aval_telefono: null,
    aval_direccion: null,
    aval_ingreso_mensual: null
  };
}

describe('prestamoService.listarPrestamosCliente', () => {
  test('devuelve credito anidado y montos tal cual llegan de BD (strings)', async () => {
    const repo = crearRepoFalso({
      listarPrestamosPorCliente: jest.fn().mockResolvedValue({ rows: [filaPrestamoCliente()], total: 1 })
    });
    const service = createPrestamoService({ prestamoRepository: repo, auditoriaRepository: crearAuditRepoFalso() });

    const resultado = await service.listarPrestamosCliente({ clienteId: 1, page: 1, limit: 20 });

    expect(repo.listarPrestamosPorCliente).toHaveBeenCalledWith({ clienteId: 1, page: 1, limit: 20 });
    expect(resultado.data[0]).toMatchObject({
      id: 1,
      credito: { id: 1, nombre: 'Credito Personal Express' },
      monto_solicitado: '10000.00',
      monto_total_a_pagar: '12400.00',
      saldo_pendiente: '12400.00'
    });
    expect(typeof resultado.data[0].monto_solicitado).toBe('string');
  });

  test('totalPages es 0 cuando total es 0 (lista vacia)', async () => {
    const repo = crearRepoFalso({
      listarPrestamosPorCliente: jest.fn().mockResolvedValue({ rows: [], total: 0 })
    });
    const service = createPrestamoService({ prestamoRepository: repo, auditoriaRepository: crearAuditRepoFalso() });

    const resultado = await service.listarPrestamosCliente({ clienteId: 1, page: 1, limit: 20 });

    expect(resultado.data).toEqual([]);
    expect(resultado.pagination).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 });
  });

  test('una pagina posterior a totalPages no lanza error, solo devuelve data vacia', async () => {
    const repo = crearRepoFalso({
      listarPrestamosPorCliente: jest.fn().mockResolvedValue({ rows: [], total: 3 })
    });
    const service = createPrestamoService({ prestamoRepository: repo, auditoriaRepository: crearAuditRepoFalso() });

    const resultado = await service.listarPrestamosCliente({ clienteId: 1, page: 99, limit: 20 });

    expect(resultado.data).toEqual([]);
    expect(resultado.pagination).toEqual({ page: 99, limit: 20, total: 3, totalPages: 1 });
  });

  test('no reordena las filas devueltas por el repositorio (el orden lo garantiza el SQL, no el servicio)', async () => {
    const filaA = filaPrestamoCliente({ id: 2, fecha_solicitud: new Date('2026-01-01T00:00:00.000Z') });
    const filaB = filaPrestamoCliente({ id: 1, fecha_solicitud: new Date('2026-01-01T00:00:00.000Z') });
    const repo = crearRepoFalso({
      listarPrestamosPorCliente: jest.fn().mockResolvedValue({ rows: [filaA, filaB], total: 2 })
    });
    const service = createPrestamoService({ prestamoRepository: repo, auditoriaRepository: crearAuditRepoFalso() });

    const resultado = await service.listarPrestamosCliente({ clienteId: 1, page: 1, limit: 20 });

    expect(resultado.data.map((p) => p.id)).toEqual([2, 1]);
  });
});

describe('prestamoService.obtenerPrestamoCliente', () => {
  test('lanza LOAN_NOT_FOUND (404) si no existe o pertenece a otro cliente (sin distinguir el caso)', async () => {
    const repo = crearRepoFalso({ obtenerPrestamoClientePorId: jest.fn().mockResolvedValue(null) });
    const service = createPrestamoService({ prestamoRepository: repo, auditoriaRepository: crearAuditRepoFalso() });

    await expect(
      service.obtenerPrestamoCliente({ clienteId: 1, prestamoId: 999 })
    ).rejects.toMatchObject({ codigo: 'LOAN_NOT_FOUND', status: 404 });
  });

  test('el filtro de propiedad se delega al repositorio (WHERE id = ? AND cliente_id = ?)', async () => {
    const repo = crearRepoFalso({
      obtenerPrestamoClientePorId: jest.fn().mockResolvedValue(filaPrestamoCliente({ ...filaAvalAusente() }))
    });
    const service = createPrestamoService({ prestamoRepository: repo, auditoriaRepository: crearAuditRepoFalso() });

    await service.obtenerPrestamoCliente({ clienteId: 7, prestamoId: 1 });

    expect(repo.obtenerPrestamoClientePorId).toHaveBeenCalledWith({ prestamoId: 1, clienteId: 7 });
  });

  test('aval null cuando el prestamo no tiene aval registrado', async () => {
    const repo = crearRepoFalso({
      obtenerPrestamoClientePorId: jest
        .fn()
        .mockResolvedValue(filaPrestamoCliente({ ...filaAvalAusente() }))
    });
    const service = createPrestamoService({ prestamoRepository: repo, auditoriaRepository: crearAuditRepoFalso() });

    const resultado = await service.obtenerPrestamoCliente({ clienteId: 1, prestamoId: 1 });

    expect(resultado.aval).toBeNull();
  });

  test('aval con campos opcionales ausentes sale como null, nunca como "" ni 0', async () => {
    const repo = crearRepoFalso({
      obtenerPrestamoClientePorId: jest.fn().mockResolvedValue(
        filaPrestamoCliente({
          ...filaAval({ aval_direccion: null, aval_ingreso_mensual: null })
        })
      )
    });
    const service = createPrestamoService({ prestamoRepository: repo, auditoriaRepository: crearAuditRepoFalso() });

    const resultado = await service.obtenerPrestamoCliente({ clienteId: 1, prestamoId: 1 });

    expect(resultado.aval.direccion).toBeNull();
    expect(resultado.aval.ingreso_mensual).toBeNull();
  });

  test('ingreso_mensual real de 0.00 se conserva como string "0.00", no se convierte a null', async () => {
    const repo = crearRepoFalso({
      obtenerPrestamoClientePorId: jest
        .fn()
        .mockResolvedValue(filaPrestamoCliente({ ...filaAval({ aval_ingreso_mensual: '0.00' }) }))
    });
    const service = createPrestamoService({ prestamoRepository: repo, auditoriaRepository: crearAuditRepoFalso() });

    const resultado = await service.obtenerPrestamoCliente({ clienteId: 1, prestamoId: 1 });

    expect(resultado.aval.ingreso_mensual).toBe('0.00');
  });
});

describe('prestamoService.listarPrestamosAdmin', () => {
  test('pasa los filtros normalizados al repositorio', async () => {
    const repo = crearRepoFalso({
      listarPrestamosAdmin: jest.fn().mockResolvedValue({ rows: [], total: 0 })
    });
    const service = createPrestamoService({ prestamoRepository: repo, auditoriaRepository: crearAuditRepoFalso() });

    const filtros = { estado: 'PENDIENTE', clienteId: 7, creditoId: 1, fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' };
    await service.listarPrestamosAdmin({ filtros, page: 2, limit: 10 });

    expect(repo.listarPrestamosAdmin).toHaveBeenCalledWith({ filtros, page: 2, limit: 10 });
  });

  test('incluye cliente y credito anidados en cada item de la lista', async () => {
    const repo = crearRepoFalso({
      listarPrestamosAdmin: jest.fn().mockResolvedValue({
        rows: [
          {
            ...filaPrestamoCliente(),
            cliente_id: 7,
            cliente_nombre: 'Juan Perez',
            cliente_email: 'juan@example.com'
          }
        ],
        total: 1
      })
    });
    const service = createPrestamoService({ prestamoRepository: repo, auditoriaRepository: crearAuditRepoFalso() });

    const resultado = await service.listarPrestamosAdmin({ filtros: {}, page: 1, limit: 20 });

    expect(resultado.data[0].cliente).toEqual({ id: 7, nombre: 'Juan Perez', email: 'juan@example.com' });
    expect(resultado.data[0].credito).toEqual({ id: 1, nombre: 'Credito Personal Express' });
  });

  test('nunca incluye password ni datos administrativos internos del cliente', async () => {
    const repo = crearRepoFalso({
      listarPrestamosAdmin: jest.fn().mockResolvedValue({
        rows: [{ ...filaPrestamoCliente(), cliente_id: 7, cliente_nombre: 'Juan', cliente_email: 'j@x.com' }],
        total: 1
      })
    });
    const service = createPrestamoService({ prestamoRepository: repo, auditoriaRepository: crearAuditRepoFalso() });

    const resultado = await service.listarPrestamosAdmin({ filtros: {}, page: 1, limit: 20 });

    expect(JSON.stringify(resultado)).not.toMatch(/password/i);
  });
});

describe('prestamoService.obtenerPrestamoAdmin', () => {
  function filaAdminDetalle(overrides = {}) {
    return {
      id: 1,
      cliente_id: 7,
      cliente_nombre: 'Juan Perez',
      cliente_email: 'juan@example.com',
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

  test('lanza LOAN_NOT_FOUND (404) si el prestamo no existe', async () => {
    const repo = crearRepoFalso({ obtenerPrestamoAdminPorId: jest.fn().mockResolvedValue(null) });
    const service = createPrestamoService({ prestamoRepository: repo, auditoriaRepository: crearAuditRepoFalso() });

    await expect(service.obtenerPrestamoAdmin({ prestamoId: 999 })).rejects.toMatchObject({
      codigo: 'LOAN_NOT_FOUND',
      status: 404
    });
  });

  test('incluye credito completo, cliente y aval (cuando existe)', async () => {
    const repo = crearRepoFalso({
      obtenerPrestamoAdminPorId: jest.fn().mockResolvedValue(filaAdminDetalle(filaAval()))
    });
    const service = createPrestamoService({ prestamoRepository: repo, auditoriaRepository: crearAuditRepoFalso() });

    const resultado = await service.obtenerPrestamoAdmin({ prestamoId: 1 });

    expect(resultado.cliente).toEqual({ id: 7, nombre: 'Juan Perez', email: 'juan@example.com', telefono: null });
    expect(resultado.credito).toMatchObject({
      id: 1,
      nombre: 'Credito Personal Express',
      monto_minimo: '1000.00',
      monto_maximo: '20000.00',
      tasa_interes_anual: '24.00',
      plazo_meses: 12
    });
    expect(resultado.aval).toEqual({
      id: 5,
      nombre: 'Roberto Gomez',
      telefono: '8711234567',
      direccion: 'Av. Morelos #450',
      ingreso_mensual: '5000.00'
    });
  });

  test('aval es null cuando el prestamo no tiene aval', async () => {
    const repo = crearRepoFalso({
      obtenerPrestamoAdminPorId: jest.fn().mockResolvedValue(filaAdminDetalle())
    });
    const service = createPrestamoService({ prestamoRepository: repo, auditoriaRepository: crearAuditRepoFalso() });

    const resultado = await service.obtenerPrestamoAdmin({ prestamoId: 1 });

    expect(resultado.aval).toBeNull();
  });

  test('telefono del cliente sale null si no existe en BD, nunca se inventa', async () => {
    const repo = crearRepoFalso({
      obtenerPrestamoAdminPorId: jest.fn().mockResolvedValue(filaAdminDetalle({ cliente_telefono: null }))
    });
    const service = createPrestamoService({ prestamoRepository: repo, auditoriaRepository: crearAuditRepoFalso() });

    const resultado = await service.obtenerPrestamoAdmin({ prestamoId: 1 });

    expect(resultado.cliente.telefono).toBeNull();
  });
});
