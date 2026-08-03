const { ESTADOS, ESTADOS_TERMINALES, puedeTransicionar } = require('../../utils/prestamoStateMachine');

describe('maquina de estados de prestamos', () => {
  test('PENDIENTE puede pasar a APROBADO o RECHAZADO', () => {
    expect(puedeTransicionar(ESTADOS.PENDIENTE, ESTADOS.APROBADO)).toBe(true);
    expect(puedeTransicionar(ESTADOS.PENDIENTE, ESTADOS.RECHAZADO)).toBe(true);
  });

  test('los estados terminales no permiten ninguna transicion (sin doble aprobacion/rechazo)', () => {
    for (const terminal of ESTADOS_TERMINALES) {
      expect(puedeTransicionar(terminal, ESTADOS.APROBADO)).toBe(false);
      expect(puedeTransicionar(terminal, ESTADOS.RECHAZADO)).toBe(false);
      expect(puedeTransicionar(terminal, ESTADOS.PENDIENTE)).toBe(false);
    }
  });

  test('no existen estados fuera de PENDIENTE/APROBADO/RECHAZADO (sin decisiones de producto pendientes)', () => {
    expect(Object.values(ESTADOS).sort()).toEqual(['APROBADO', 'PENDIENTE', 'RECHAZADO']);
  });
});
