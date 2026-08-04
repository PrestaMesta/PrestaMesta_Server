const { inicioDelDia, inicioDelDiaSiguiente } = require('../../utils/rangoFechas');

describe('utils/rangoFechas', () => {
  test('inicioDelDia devuelve las 00:00:00.000 locales del dia indicado', () => {
    const fecha = inicioDelDia('2026-02-10');
    expect(fecha.getFullYear()).toBe(2026);
    expect(fecha.getMonth()).toBe(1); // 0-indexado: febrero
    expect(fecha.getDate()).toBe(10);
    expect(fecha.getHours()).toBe(0);
    expect(fecha.getMinutes()).toBe(0);
    expect(fecha.getSeconds()).toBe(0);
    expect(fecha.getMilliseconds()).toBe(0);
  });

  test('inicioDelDiaSiguiente devuelve las 00:00:00.000 del dia posterior (limite exclusivo)', () => {
    const fecha = inicioDelDiaSiguiente('2026-02-10');
    expect(fecha.getFullYear()).toBe(2026);
    expect(fecha.getMonth()).toBe(1);
    expect(fecha.getDate()).toBe(11);
    expect(fecha.getHours()).toBe(0);
  });

  test('inicioDelDiaSiguiente cruza correctamente el limite de mes', () => {
    const fecha = inicioDelDiaSiguiente('2026-01-31');
    expect(fecha.getFullYear()).toBe(2026);
    expect(fecha.getMonth()).toBe(1); // febrero
    expect(fecha.getDate()).toBe(1);
  });

  test('inicioDelDiaSiguiente cruza correctamente el limite de anio', () => {
    const fecha = inicioDelDiaSiguiente('2026-12-31');
    expect(fecha.getFullYear()).toBe(2027);
    expect(fecha.getMonth()).toBe(0);
    expect(fecha.getDate()).toBe(1);
  });

  test('un timestamp exactamente al inicio del dia cae dentro del rango [inicioDelDia, inicioDelDiaSiguiente)', () => {
    const inicio = inicioDelDia('2026-02-10');
    const finExclusivo = inicioDelDiaSiguiente('2026-02-10');
    const timestampAlInicio = new Date(2026, 1, 10, 0, 0, 0, 0);

    expect(timestampAlInicio.getTime() >= inicio.getTime()).toBe(true);
    expect(timestampAlInicio.getTime() < finExclusivo.getTime()).toBe(true);
  });

  test('un timestamp en el ultimo instante del dia cae dentro del rango, y el del dia siguiente ya no', () => {
    const finExclusivo = inicioDelDiaSiguiente('2026-02-10');
    const ultimoInstanteDelDia = new Date(2026, 1, 10, 23, 59, 59, 999);
    const primerInstanteDelDiaSiguiente = new Date(2026, 1, 11, 0, 0, 0, 0);

    expect(ultimoInstanteDelDia.getTime() < finExclusivo.getTime()).toBe(true);
    expect(primerInstanteDelDiaSiguiente.getTime() < finExclusivo.getTime()).toBe(false);
  });
});
