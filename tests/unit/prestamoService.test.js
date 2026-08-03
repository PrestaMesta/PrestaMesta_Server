const { createPrestamoService } = require('../../services/prestamoService');

function crearRepoFalso(overrides = {}) {
  return {
    crearCredito: jest.fn(),
    listarCreditos: jest.fn(),
    obtenerCreditoPorId: jest.fn(),
    crearSolicitud: jest.fn(),
    cambiarEstado: jest.fn(),
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
