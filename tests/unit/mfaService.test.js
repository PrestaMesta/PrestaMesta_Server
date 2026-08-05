const { createMfaService } = require('../../services/mfaService');
const mfaCrypto = require('../../utils/mfaCrypto');
const totp = require('../../utils/totp');
const { generarCodigosRecuperacion, hashCodigoRecuperacion } = require('../../utils/recoveryCodes');

const CLAVE = process.env.MFA_ENCRYPTION_KEY_BASE64; // fijada por tests/env.setup.js
const AHORA_MS = 1700000000000;

function crearRepoFalso(overrides = {}) {
  return {
    obtenerEstado: jest.fn(),
    iniciarEnrolamiento: jest.fn(),
    confirmarEnrolamiento: jest.fn(),
    marcarTimestepUsado: jest.fn(),
    registrarIntentoFallido: jest.fn(),
    resetearIntentosFallidos: jest.fn(),
    reemplazarCodigosRecuperacion: jest.fn(),
    obtenerCodigosRecuperacion: jest.fn(),
    consumirCodigoRecuperacion: jest.fn(),
    ...overrides
  };
}

function fixtureEnrolamiento(estado = 'PENDIENTE_CONFIRMACION') {
  const secretoBase32 = totp.generarSecreto();
  const { ciphertext, nonce, tag } = mfaCrypto.cifrarSecretoTotp(secretoBase32, CLAVE);
  const codigo = totp.generarCodigo({ secretoBase32, marcaDeTiempoMs: AHORA_MS });
  return {
    secretoBase32,
    codigo,
    filaBD: {
      estado,
      totp_secret_ciphertext: ciphertext,
      totp_secret_nonce: nonce,
      totp_secret_tag: tag
    }
  };
}

describe('mfaService: constructor', () => {
  test('createMfaService exige un mfaRepository', () => {
    expect(() => createMfaService({})).toThrow(/mfaRepository/);
  });
});

describe('mfaService.iniciarEnrolamiento', () => {
  test('cifra el secreto antes de persistirlo y devuelve el secreto en claro solo en la respuesta', async () => {
    const repo = crearRepoFalso();
    const service = createMfaService({ mfaRepository: repo });

    const resultado = await service.iniciarEnrolamiento({ usuarioId: 1, etiqueta: 'juan@example.com', emisor: 'Prestamesta' });

    expect(repo.iniciarEnrolamiento).toHaveBeenCalledTimes(1);
    const args = repo.iniciarEnrolamiento.mock.calls[0][0];
    expect(args.usuarioId).toBe(1);
    expect(Buffer.isBuffer(args.ciphertext)).toBe(true);
    expect(Buffer.isBuffer(args.nonce)).toBe(true);
    expect(Buffer.isBuffer(args.tag)).toBe(true);
    expect(args.ciphertext.toString('utf8')).not.toContain(resultado.secretoBase32);

    expect(resultado.secretoBase32).toMatch(/^[A-Z2-7]+=*$/);
    expect(resultado.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect(resultado.otpauthUri).toContain('secret=');
  });
});

describe('mfaService.confirmarEnrolamiento', () => {
  test('activa el MFA con el primer codigo correcto y devuelve 10 codigos de recuperacion', async () => {
    const { codigo, filaBD } = fixtureEnrolamiento();
    const repo = crearRepoFalso({
      obtenerEstado: jest.fn().mockResolvedValue(filaBD),
      marcarTimestepUsado: jest.fn().mockResolvedValue(true),
      confirmarEnrolamiento: jest.fn().mockResolvedValue(true)
    });
    const service = createMfaService({ mfaRepository: repo });

    const resultado = await service.confirmarEnrolamiento({ usuarioId: 1, codigo, marcaDeTiempoMs: AHORA_MS });

    expect(resultado.codigosRecuperacion).toHaveLength(10);
    expect(new Set(resultado.codigosRecuperacion).size).toBe(10);
    expect(repo.marcarTimestepUsado).toHaveBeenCalledWith({ usuarioId: 1, timestep: expect.any(Number) });
    expect(repo.confirmarEnrolamiento).toHaveBeenCalledWith(1);
    expect(repo.reemplazarCodigosRecuperacion).toHaveBeenCalledWith({
      usuarioId: 1,
      hashes: expect.arrayContaining([expect.any(String)])
    });
    // Los hashes persistidos nunca son los codigos en claro devueltos.
    const hashesPersistidos = repo.reemplazarCodigosRecuperacion.mock.calls[0][0].hashes;
    for (const codigoEnClaro of resultado.codigosRecuperacion) {
      expect(hashesPersistidos).not.toContain(codigoEnClaro);
    }
  });

  test('rechaza si no hay enrolamiento pendiente para el usuario', async () => {
    const repo = crearRepoFalso({ obtenerEstado: jest.fn().mockResolvedValue(null) });
    const service = createMfaService({ mfaRepository: repo });

    await expect(
      service.confirmarEnrolamiento({ usuarioId: 1, codigo: '123456', marcaDeTiempoMs: AHORA_MS })
    ).rejects.toThrow(/pendiente de confirmacion/);
  });

  test('rechaza si el estado ya no es PENDIENTE_CONFIRMACION (ej. ya ACTIVO)', async () => {
    const { filaBD } = fixtureEnrolamiento('ACTIVO');
    const repo = crearRepoFalso({ obtenerEstado: jest.fn().mockResolvedValue(filaBD) });
    const service = createMfaService({ mfaRepository: repo });

    await expect(
      service.confirmarEnrolamiento({ usuarioId: 1, codigo: '123456', marcaDeTiempoMs: AHORA_MS })
    ).rejects.toThrow(/pendiente de confirmacion/);
  });

  test('un codigo incorrecto se rechaza y no llega a tocar el repositorio de escritura', async () => {
    const { filaBD } = fixtureEnrolamiento();
    const repo = crearRepoFalso({ obtenerEstado: jest.fn().mockResolvedValue(filaBD) });
    const service = createMfaService({ mfaRepository: repo });

    await expect(
      service.confirmarEnrolamiento({ usuarioId: 1, codigo: '000000', marcaDeTiempoMs: AHORA_MS })
    ).rejects.toThrow(/invalido o expirado/);

    expect(repo.marcarTimestepUsado).not.toHaveBeenCalled();
    expect(repo.confirmarEnrolamiento).not.toHaveBeenCalled();
    expect(repo.reemplazarCodigosRecuperacion).not.toHaveBeenCalled();
  });

  test('un codigo correcto pero de timestep ya usado (reutilizacion) se rechaza', async () => {
    const { codigo, filaBD } = fixtureEnrolamiento();
    const repo = crearRepoFalso({
      obtenerEstado: jest.fn().mockResolvedValue(filaBD),
      marcarTimestepUsado: jest.fn().mockResolvedValue(false) // el repo dice: timestep ya usado
    });
    const service = createMfaService({ mfaRepository: repo });

    await expect(
      service.confirmarEnrolamiento({ usuarioId: 1, codigo, marcaDeTiempoMs: AHORA_MS })
    ).rejects.toThrow(/ya utilizado/);

    expect(repo.confirmarEnrolamiento).not.toHaveBeenCalled();
    expect(repo.reemplazarCodigosRecuperacion).not.toHaveBeenCalled();
  });

  test('un codigo incorrecto en confirmarEnrolamiento nunca revela el secreto en el error', async () => {
    const { secretoBase32, filaBD } = fixtureEnrolamiento();
    const repo = crearRepoFalso({ obtenerEstado: jest.fn().mockResolvedValue(filaBD) });
    const service = createMfaService({ mfaRepository: repo });

    let errorCapturado;
    try {
      await service.confirmarEnrolamiento({ usuarioId: 1, codigo: '000000', marcaDeTiempoMs: AHORA_MS });
    } catch (error) {
      errorCapturado = error;
    }

    expect(errorCapturado).toBeDefined();
    const serializado = JSON.stringify(errorCapturado, Object.getOwnPropertyNames(errorCapturado));
    expect(errorCapturado.message).not.toContain(secretoBase32);
    expect(serializado).not.toContain(secretoBase32);
    expect(serializado).not.toContain(CLAVE);
  });
});

describe('mfaService.verificarCodigoTotp', () => {
  test('acepta un codigo correcto contra el secreto ACTIVO', async () => {
    const { codigo, filaBD } = fixtureEnrolamiento('ACTIVO');
    const repo = crearRepoFalso({
      obtenerEstado: jest.fn().mockResolvedValue(filaBD),
      marcarTimestepUsado: jest.fn().mockResolvedValue(true)
    });
    const service = createMfaService({ mfaRepository: repo });

    const resultado = await service.verificarCodigoTotp({ usuarioId: 1, codigo, marcaDeTiempoMs: AHORA_MS });
    expect(resultado.valido).toBe(true);
  });

  test('rechaza si el MFA no esta ACTIVO (ej. NO_ENROLADO o PENDIENTE_CONFIRMACION)', async () => {
    const repo = crearRepoFalso({ obtenerEstado: jest.fn().mockResolvedValue(null) });
    const service = createMfaService({ mfaRepository: repo });

    const resultado = await service.verificarCodigoTotp({ usuarioId: 1, codigo: '123456', marcaDeTiempoMs: AHORA_MS });
    expect(resultado.valido).toBe(false);
  });

  test('dos verificaciones concurrentes con el MISMO codigo (mismo timestep): solo una se acepta', async () => {
    // Simula, a nivel de servicio, el UPDATE condicional atomico real de
    // repositories/clienteMfaRepository.js#marcarTimestepUsado (WHERE
    // totp_ultimo_timestep_usado IS NULL OR < ?) con un "lock" + estado compartido, mismo
    // patron que ya usa tests/unit/prestamoService.test.js para la transicion de estado de
    // prestamos. Esto NO prueba el locking real de MySQL (no hay MySQL en este sandbox);
    // prueba que mfaService.verificarCodigoTotp traduce correctamente el resultado del
    // repositorio a una unica respuesta valida y un unico rechazo, sin importar el orden de
    // llegada.
    const { codigo, filaBD } = fixtureEnrolamiento('ACTIVO');
    let ultimoTimestepUsado = null;
    let lockTomado = false;
    const marcarTimestepUsado = jest.fn().mockImplementation(async ({ timestep }) => {
      while (lockTomado) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      lockTomado = true;
      try {
        await new Promise((resolve) => setImmediate(resolve));
        if (ultimoTimestepUsado !== null && ultimoTimestepUsado >= timestep) {
          return false;
        }
        ultimoTimestepUsado = timestep;
        return true;
      } finally {
        lockTomado = false;
      }
    });
    const repo = crearRepoFalso({
      obtenerEstado: jest.fn().mockResolvedValue(filaBD),
      marcarTimestepUsado
    });
    const service = createMfaService({ mfaRepository: repo });

    const resultados = await Promise.all([
      service.verificarCodigoTotp({ usuarioId: 1, codigo, marcaDeTiempoMs: AHORA_MS }),
      service.verificarCodigoTotp({ usuarioId: 1, codigo, marcaDeTiempoMs: AHORA_MS })
    ]);

    const aceptados = resultados.filter((r) => r.valido);
    expect(aceptados).toHaveLength(1);
    expect(marcarTimestepUsado).toHaveBeenCalledTimes(2);
  });
});

describe('mfaService.consumirCodigoRecuperacion', () => {
  test('consume el codigo cuando coincide con un hash no usado', async () => {
    const [codigo] = generarCodigosRecuperacion(1);
    const hash = await hashCodigoRecuperacion(codigo);
    const repo = crearRepoFalso({
      obtenerCodigosRecuperacion: jest.fn().mockResolvedValue([{ id: 5, codigo_hash: hash, usado_en: null }]),
      consumirCodigoRecuperacion: jest.fn().mockResolvedValue(true)
    });
    const service = createMfaService({ mfaRepository: repo });

    const resultado = await service.consumirCodigoRecuperacion({ usuarioId: 1, codigo });

    expect(resultado.valido).toBe(true);
    expect(repo.consumirCodigoRecuperacion).toHaveBeenCalledWith({ id: 5, usuarioId: 1 });
  });

  test('un codigo que no coincide con ningun hash se rechaza (MFA_INVALID_CODE) sin consumir nada', async () => {
    const [codigoReal, codigoFalso] = generarCodigosRecuperacion(2);
    const hash = await hashCodigoRecuperacion(codigoReal);
    const repo = crearRepoFalso({
      obtenerCodigosRecuperacion: jest.fn().mockResolvedValue([{ id: 5, codigo_hash: hash, usado_en: null }])
    });
    const service = createMfaService({ mfaRepository: repo });

    const resultado = await service.consumirCodigoRecuperacion({ usuarioId: 1, codigo: codigoFalso });

    expect(resultado.valido).toBe(false);
    expect(resultado.motivo).toBe('CODIGO_INVALIDO');
    expect(repo.consumirCodigoRecuperacion).not.toHaveBeenCalled();
  });

  test('un codigo que coincide pero ya estaba usado se rechaza (CODIGO_YA_USADO) sin re-consumir', async () => {
    const [codigo] = generarCodigosRecuperacion(1);
    const hash = await hashCodigoRecuperacion(codigo);
    const repo = crearRepoFalso({
      obtenerCodigosRecuperacion: jest.fn().mockResolvedValue([{ id: 5, codigo_hash: hash, usado_en: new Date() }])
    });
    const service = createMfaService({ mfaRepository: repo });

    const resultado = await service.consumirCodigoRecuperacion({ usuarioId: 1, codigo });

    expect(resultado.valido).toBe(false);
    expect(resultado.motivo).toBe('CODIGO_YA_USADO');
    expect(repo.consumirCodigoRecuperacion).not.toHaveBeenCalled();
  });

  test('dos consumos concurrentes del MISMO codigo de recuperacion: solo uno se acepta', async () => {
    // Mismo patron de simulacion de UPDATE condicional atomico que el test de
    // verificarCodigoTotp de arriba, aplicado a
    // repositories/clienteMfaRepository.js#consumirCodigoRecuperacion.
    const [codigo] = generarCodigosRecuperacion(1);
    const hash = await hashCodigoRecuperacion(codigo);
    let usado = false;
    let lockTomado = false;
    const consumirCodigoRecuperacion = jest.fn().mockImplementation(async () => {
      while (lockTomado) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      lockTomado = true;
      try {
        await new Promise((resolve) => setImmediate(resolve));
        if (usado) return false;
        usado = true;
        return true;
      } finally {
        lockTomado = false;
      }
    });
    const repo = crearRepoFalso({
      obtenerCodigosRecuperacion: jest.fn().mockResolvedValue([{ id: 9, codigo_hash: hash, usado_en: null }]),
      consumirCodigoRecuperacion
    });
    const service = createMfaService({ mfaRepository: repo });

    const resultados = await Promise.all([
      service.consumirCodigoRecuperacion({ usuarioId: 1, codigo }),
      service.consumirCodigoRecuperacion({ usuarioId: 1, codigo })
    ]);

    const aceptados = resultados.filter((r) => r.valido);
    expect(aceptados).toHaveLength(1);
    expect(consumirCodigoRecuperacion).toHaveBeenCalledTimes(2);
  });
});

describe('mfaService: ausencia de logs', () => {
  test('ninguna operacion escribe en consola (nunca se registran secretos ni datos cifrados)', async () => {
    const spyLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    const spyError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const spyWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { codigo, filaBD } = fixtureEnrolamiento();
    const repo = crearRepoFalso({
      obtenerEstado: jest.fn().mockResolvedValue(filaBD),
      marcarTimestepUsado: jest.fn().mockResolvedValue(true),
      confirmarEnrolamiento: jest.fn().mockResolvedValue(true)
    });
    const service = createMfaService({ mfaRepository: repo });

    await service.iniciarEnrolamiento({ usuarioId: 1, etiqueta: 'x', emisor: 'Prestamesta' });
    await service.confirmarEnrolamiento({ usuarioId: 1, codigo, marcaDeTiempoMs: AHORA_MS });
    try {
      await service.confirmarEnrolamiento({ usuarioId: 1, codigo: '000000', marcaDeTiempoMs: AHORA_MS });
    } catch {
      // esperado: el estado ya no es PENDIENTE_CONFIRMACION tras confirmar arriba
    }

    expect(spyLog).not.toHaveBeenCalled();
    expect(spyError).not.toHaveBeenCalled();
    expect(spyWarn).not.toHaveBeenCalled();

    spyLog.mockRestore();
    spyError.mockRestore();
    spyWarn.mockRestore();
  });
});
