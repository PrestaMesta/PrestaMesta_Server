const { calcularMontoTotalAPagar } = require('../../utils/money');

describe('calcularMontoTotalAPagar', () => {
  test('reproduce la formula existente: interes simple anual prorrateado', () => {
    // Ejemplo del propio README/generador de docs: 10000 a 24% anual, 12 meses -> 12400.00
    const total = calcularMontoTotalAPagar({
      montoSolicitado: 10000,
      tasaInteresAnual: 24,
      plazoMeses: 12
    });
    expect(total).toBe('12400.00');
  });

  test('prorratea correctamente plazos menores a 12 meses', () => {
    const total = calcularMontoTotalAPagar({
      montoSolicitado: 5000,
      tasaInteresAnual: 24,
      plazoMeses: 6
    });
    // interes = 5000 * 0.24 * (6/12) = 600 -> total 5600.00
    expect(total).toBe('5600.00');
  });

  test('redondea a 2 decimales (ROUND_HALF_UP) en vez de arrastrar error flotante', () => {
    const total = calcularMontoTotalAPagar({
      montoSolicitado: 1000,
      tasaInteresAnual: 13,
      plazoMeses: 7
    });
    // interes = 1000 * 0.13 * (7/12) = 75.8333... -> total 1075.833... -> 1075.83
    expect(total).toBe('1075.83');
  });

  test('siempre devuelve un string con 2 decimales, nunca un float crudo', () => {
    const total = calcularMontoTotalAPagar({
      montoSolicitado: 1,
      tasaInteresAnual: 0,
      plazoMeses: 1
    });
    expect(typeof total).toBe('string');
    expect(total).toBe('1.00');
  });
});
