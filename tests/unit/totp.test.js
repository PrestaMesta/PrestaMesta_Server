const { generarSecreto, generarUri, generarCodigo, validarCodigo, PERIODO_SEGUNDOS } = require('../../utils/totp');

const SECRETO = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const AHORA_MS = 1700000000000; // reloj fijo/inyectable, no Date.now()

describe('utils/totp', () => {
  test('generarSecreto produce un secreto base32 nuevo cada vez', () => {
    const a = generarSecreto();
    const b = generarSecreto();
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });

  test('generarUri produce una URI otpauth:// utilizable para el QR', () => {
    const uri = generarUri({ secretoBase32: SECRETO, etiqueta: 'juan@example.com', emisor: 'Prestamesta' });
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain('period=30');
  });

  test('genera y valida un codigo con un reloj inyectado (mismo instante)', () => {
    const codigo = generarCodigo({ secretoBase32: SECRETO, marcaDeTiempoMs: AHORA_MS });
    expect(codigo).toMatch(/^\d{6}$/);

    const resultado = validarCodigo({ secretoBase32: SECRETO, codigo, marcaDeTiempoMs: AHORA_MS });
    expect(resultado.valido).toBe(true);
    expect(resultado.timestep).toBe(Math.floor(AHORA_MS / 1000 / PERIODO_SEGUNDOS));
  });

  test('un codigo generado para un timestep se acepta dentro de la ventana ±1 (un paso despues)', () => {
    const codigo = generarCodigo({ secretoBase32: SECRETO, marcaDeTiempoMs: AHORA_MS });
    const unPasoDespues = AHORA_MS + PERIODO_SEGUNDOS * 1000;

    const resultado = validarCodigo({ secretoBase32: SECRETO, codigo, marcaDeTiempoMs: unPasoDespues });
    expect(resultado.valido).toBe(true);
    // El timestep devuelto es el que REALMENTE valido el codigo (el paso original, no el
    // paso "actual" en el que se hizo la verificacion).
    expect(resultado.timestep).toBe(Math.floor(AHORA_MS / 1000 / PERIODO_SEGUNDOS));
  });

  test('un codigo generado para un timestep se acepta dentro de la ventana ±1 (un paso antes)', () => {
    const codigo = generarCodigo({ secretoBase32: SECRETO, marcaDeTiempoMs: AHORA_MS });
    const unPasoAntes = AHORA_MS - PERIODO_SEGUNDOS * 1000;

    const resultado = validarCodigo({ secretoBase32: SECRETO, codigo, marcaDeTiempoMs: unPasoAntes });
    expect(resultado.valido).toBe(true);
  });

  test('un codigo fuera de la ventana ±1 (dos pasos de distancia) se rechaza', () => {
    const codigo = generarCodigo({ secretoBase32: SECRETO, marcaDeTiempoMs: AHORA_MS });
    const dosPasosDespues = AHORA_MS + PERIODO_SEGUNDOS * 1000 * 2;

    const resultado = validarCodigo({ secretoBase32: SECRETO, codigo, marcaDeTiempoMs: dosPasosDespues });
    expect(resultado.valido).toBe(false);
    expect(resultado.timestep).toBeNull();
  });

  test('un codigo de otro secreto se rechaza', () => {
    const otroSecreto = 'ABCDEFGHIJKLMNOPQRST234567ABCDEF';
    const codigo = generarCodigo({ secretoBase32: otroSecreto, marcaDeTiempoMs: AHORA_MS });

    const resultado = validarCodigo({ secretoBase32: SECRETO, codigo, marcaDeTiempoMs: AHORA_MS });
    expect(resultado.valido).toBe(false);
  });

  test('un codigo con formato invalido (no 6 digitos) se rechaza sin lanzar', () => {
    expect(validarCodigo({ secretoBase32: SECRETO, codigo: 'abcdef', marcaDeTiempoMs: AHORA_MS }).valido).toBe(false);
    expect(validarCodigo({ secretoBase32: SECRETO, codigo: '12345', marcaDeTiempoMs: AHORA_MS }).valido).toBe(false);
    expect(validarCodigo({ secretoBase32: SECRETO, codigo: '', marcaDeTiempoMs: AHORA_MS }).valido).toBe(false);
  });
});
