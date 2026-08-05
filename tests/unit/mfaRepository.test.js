// Verifica el TEXTO SQL que construyen los repositorios MFA (automockea `config/db.mysql`,
// mismo patron que tests/unit/prestamoRepository.consultas.test.js): sin MySQL real en este
// sandbox, esto NO prueba el locking real de MySQL, prueba que las clausulas de guarda
// condicionales (anti-replay, consumo de un solo uso) estan realmente en el SQL, no solo
// asumidas.
jest.mock('../../config/db.mysql');

const pool = require('../../config/db.mysql');
const clienteMfaRepository = require('../../repositories/clienteMfaRepository');
const administradorMfaRepository = require('../../repositories/administradorMfaRepository');

beforeEach(() => {
  pool.query.mockReset();
  pool.query.mockResolvedValue([{ affectedRows: 0 }, []]);
  pool.getConnection = jest.fn();
});

describe.each([
  ['clienteMfaRepository', clienteMfaRepository, 'cliente_id', 'clientes_mfa', 'clientes_mfa_codigos_recuperacion'],
  [
    'administradorMfaRepository',
    administradorMfaRepository,
    'administrador_id',
    'administradores_mfa',
    'administradores_mfa_codigos_recuperacion'
  ]
])('%s', (_nombre, repo, columnaId, tablaMfa, tablaCodigos) => {
  test('iniciarEnrolamiento hace un upsert parametrizado (nunca interpola valores)', async () => {
    await repo.iniciarEnrolamiento({
      usuarioId: 1,
      ciphertext: Buffer.from('c'),
      nonce: Buffer.from('n'),
      tag: Buffer.from('t')
    });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(new RegExp(`INSERT INTO ${tablaMfa}`));
    expect(sql).toMatch(/ON DUPLICATE KEY UPDATE/);
    expect(sql).toMatch(/totp_ultimo_timestep_usado = NULL/);
    expect(sql).toMatch(/intentos_fallidos = 0/);
    expect(params).toEqual([1, Buffer.from('c'), Buffer.from('n'), Buffer.from('t')]);
  });

  test('confirmarEnrolamiento es un UPDATE condicional (solo transiciona desde PENDIENTE_CONFIRMACION)', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const resultado = await repo.confirmarEnrolamiento(1);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(new RegExp(`WHERE ${columnaId} = \\? AND estado = 'PENDIENTE_CONFIRMACION'`));
    expect(params).toEqual([1]);
    expect(resultado).toBe(true);
  });

  test('marcarTimestepUsado es un UPDATE condicional atomico (anti-replay por indice de paso)', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const aceptado = await repo.marcarTimestepUsado({ usuarioId: 1, timestep: 42 });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(
      new RegExp(`WHERE ${columnaId} = \\? AND \\(totp_ultimo_timestep_usado IS NULL OR totp_ultimo_timestep_usado < \\?\\)`)
    );
    expect(params).toEqual([42, 1, 42]);
    expect(aceptado).toBe(true);
  });

  test('marcarTimestepUsado devuelve false cuando el UPDATE no afecta filas (timestep ya usado)', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 0 }, []]);
    const aceptado = await repo.marcarTimestepUsado({ usuarioId: 1, timestep: 42 });
    expect(aceptado).toBe(false);
  });

  test('consumirCodigoRecuperacion es un UPDATE condicional de un solo uso, parametrizado', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const consumido = await repo.consumirCodigoRecuperacion({ id: 5, usuarioId: 1 });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(new RegExp(`FROM ${tablaCodigos}|UPDATE ${tablaCodigos}`));
    expect(sql).toMatch(new RegExp(`WHERE id = \\? AND ${columnaId} = \\? AND usado_en IS NULL`));
    expect(params).toEqual([5, 1]);
    expect(consumido).toBe(true);
  });

  test('consumirCodigoRecuperacion devuelve false cuando ya estaba consumido', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 0 }, []]);
    const consumido = await repo.consumirCodigoRecuperacion({ id: 5, usuarioId: 1 });
    expect(consumido).toBe(false);
  });

  test('reemplazarCodigosRecuperacion borra e inserta dentro de una transaccion', async () => {
    const connection = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([{}, []]),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn()
    };
    pool.getConnection.mockResolvedValue(connection);

    await repo.reemplazarCodigosRecuperacion({ usuarioId: 1, hashes: ['hashA', 'hashB'] });

    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.query).toHaveBeenNthCalledWith(1, expect.stringMatching(`DELETE FROM ${tablaCodigos}`), [1]);
    expect(connection.query).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(`INSERT INTO ${tablaCodigos}`),
      [
        [
          [1, 'hashA'],
          [1, 'hashB']
        ]
      ]
    );
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  test('reemplazarCodigosRecuperacion revierte la transaccion si algo falla', async () => {
    const connection = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockRejectedValue(new Error('fallo de BD simulado')),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn()
    };
    pool.getConnection.mockResolvedValue(connection);

    await expect(repo.reemplazarCodigosRecuperacion({ usuarioId: 1, hashes: ['hashA'] })).rejects.toThrow(
      'fallo de BD simulado'
    );

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});
