const {
  generarCodigosRecuperacion,
  hashCodigoRecuperacion,
  compararCodigoRecuperacion,
  CANTIDAD_DEFECTO
} = require('../../utils/recoveryCodes');

describe('utils/recoveryCodes', () => {
  test('genera 10 codigos por defecto', () => {
    expect(CANTIDAD_DEFECTO).toBe(10);
    const codigos = generarCodigosRecuperacion();
    expect(codigos).toHaveLength(10);
  });

  test('los 10 codigos generados son unicos entre si', () => {
    const codigos = generarCodigosRecuperacion();
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  test('cada codigo tiene entropia suficiente (80 bits, formato agrupado legible)', () => {
    const [codigo] = generarCodigosRecuperacion(1);
    expect(codigo).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){4}$/);
  });

  test('dos lotes generados no se repiten entre si', () => {
    const loteA = generarCodigosRecuperacion();
    const loteB = generarCodigosRecuperacion();
    const interseccion = loteA.filter((codigo) => loteB.includes(codigo));
    expect(interseccion).toHaveLength(0);
  });

  test('hashCodigoRecuperacion + compararCodigoRecuperacion: el codigo original valida', async () => {
    const [codigo] = generarCodigosRecuperacion(1);
    const hash = await hashCodigoRecuperacion(codigo);
    expect(await compararCodigoRecuperacion(codigo, hash)).toBe(true);
  });

  test('un codigo distinto no valida contra el hash', async () => {
    const [codigoA, codigoB] = generarCodigosRecuperacion(2);
    const hash = await hashCodigoRecuperacion(codigoA);
    expect(await compararCodigoRecuperacion(codigoB, hash)).toBe(false);
  });

  test('el hash nunca es igual al codigo en claro (no es un passthrough)', async () => {
    const [codigo] = generarCodigosRecuperacion(1);
    const hash = await hashCodigoRecuperacion(codigo);
    expect(hash).not.toBe(codigo);
    expect(hash).not.toContain(codigo);
  });

  test('el mismo codigo produce hashes distintos en llamadas distintas (salt aleatorio)', async () => {
    const [codigo] = generarCodigosRecuperacion(1);
    const hashA = await hashCodigoRecuperacion(codigo);
    const hashB = await hashCodigoRecuperacion(codigo);
    expect(hashA).not.toBe(hashB);
    // Pero ambos siguen validando el mismo codigo en claro.
    expect(await compararCodigoRecuperacion(codigo, hashA)).toBe(true);
    expect(await compararCodigoRecuperacion(codigo, hashB)).toBe(true);
  });

  test('comparar contra un hash vacio/invalido nunca lanza, solo devuelve false', async () => {
    await expect(compararCodigoRecuperacion('ABCD-EFGH-IJKL-MNOP-QRST', '')).resolves.toBe(false);
  });
});
