const { checkPasswordStrength } = require('../../utils/passwordPolicy');

describe('checkPasswordStrength', () => {
  test('acepta un password que combina mayuscula, minuscula, digito y >=12 caracteres', () => {
    expect(checkPasswordStrength('AdminSuperSeguro123').valido).toBe(true);
  });

  test('rechaza un password corto', () => {
    expect(checkPasswordStrength('Ab1').valido).toBe(false);
  });

  test('rechaza un password sin mayuscula', () => {
    expect(checkPasswordStrength('minusculasydigitos123').valido).toBe(false);
  });

  test('rechaza un password sin digito', () => {
    expect(checkPasswordStrength('SoloLetrasMayYMin').valido).toBe(false);
  });

  test('rechaza un password que excede 72 bytes (nunca lo trunca)', () => {
    const largo = `Aa1${'x'.repeat(80)}`;
    expect(largo.length).toBeGreaterThan(72);
    const { valido, problemas } = checkPasswordStrength(largo);
    expect(valido).toBe(false);
    expect(problemas.join(' ')).toMatch(/72 bytes/);
  });

  test('rechaza por bytes (no solo caracteres) cuando hay multibyte UTF-8', () => {
    // 70 caracteres 'á' (2 bytes cada uno en UTF-8) = 140 bytes, aunque .length los
    // cuente distinto segun normalizacion; el punto es que byteLength() es la fuente de
    // verdad, no password.length.
    const conAcentos = `Aa1${'á'.repeat(70)}`;
    expect(Buffer.byteLength(conAcentos, 'utf8')).toBeGreaterThan(72);
    expect(checkPasswordStrength(conAcentos).valido).toBe(false);
  });

  test('acepta exactamente en el limite de 72 bytes con contenido ASCII', () => {
    const enElLimite = `Aa1${'x'.repeat(69)}`; // 3 + 69 = 72 bytes exactos
    expect(Buffer.byteLength(enElLimite, 'utf8')).toBe(72);
    expect(checkPasswordStrength(enElLimite).valido).toBe(true);
  });
});
