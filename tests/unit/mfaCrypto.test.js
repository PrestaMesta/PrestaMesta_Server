const crypto = require('crypto');
const { cifrarSecretoTotp, descifrarSecretoTotp } = require('../../utils/mfaCrypto');

const CLAVE_VALIDA = crypto.randomBytes(32).toString('base64');
const SECRETO = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

describe('utils/mfaCrypto', () => {
  test('cifra y descifra el mismo secreto (round-trip)', () => {
    const { ciphertext, nonce, tag } = cifrarSecretoTotp(SECRETO, CLAVE_VALIDA);
    const resultado = descifrarSecretoTotp({ ciphertext, nonce, tag }, CLAVE_VALIDA);
    expect(resultado).toBe(SECRETO);
  });

  test('ciphertext, nonce y tag se devuelven como Buffers separados', () => {
    const { ciphertext, nonce, tag } = cifrarSecretoTotp(SECRETO, CLAVE_VALIDA);
    expect(Buffer.isBuffer(ciphertext)).toBe(true);
    expect(Buffer.isBuffer(nonce)).toBe(true);
    expect(Buffer.isBuffer(tag)).toBe(true);
    expect(nonce.length).toBe(12);
    expect(tag.length).toBe(16);
  });

  test('dos cifrados del MISMO secreto usan nonces distintos (nunca reutilizado)', () => {
    const a = cifrarSecretoTotp(SECRETO, CLAVE_VALIDA);
    const b = cifrarSecretoTotp(SECRETO, CLAVE_VALIDA);
    expect(a.nonce.equals(b.nonce)).toBe(false);
    // Con nonces distintos, aunque el secreto sea el mismo, el ciphertext tambien difiere
    // (propiedad de un cifrado de flujo como GCM).
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  test('un tag alterado hace fallar el descifrado (fallo cerrado, integridad autenticada)', () => {
    const { ciphertext, nonce, tag } = cifrarSecretoTotp(SECRETO, CLAVE_VALIDA);
    const tagAlterado = Buffer.from(tag);
    tagAlterado[0] ^= 0xff; // voltea el primer byte

    expect(() => descifrarSecretoTotp({ ciphertext, nonce, tag: tagAlterado }, CLAVE_VALIDA)).toThrow();
  });

  test('un ciphertext alterado hace fallar el descifrado (el tag ya no valida el contenido)', () => {
    const { ciphertext, nonce, tag } = cifrarSecretoTotp(SECRETO, CLAVE_VALIDA);
    const ciphertextAlterado = Buffer.from(ciphertext);
    ciphertextAlterado[0] ^= 0xff;

    expect(() => descifrarSecretoTotp({ ciphertext: ciphertextAlterado, nonce, tag }, CLAVE_VALIDA)).toThrow();
  });

  test('una clave de longitud invalida se rechaza al cifrar (fallo cerrado)', () => {
    const claveCorta = crypto.randomBytes(16).toString('base64'); // 16 bytes, no 32
    expect(() => cifrarSecretoTotp(SECRETO, claveCorta)).toThrow();
  });

  test('una clave de longitud invalida se rechaza al descifrar (fallo cerrado)', () => {
    const { ciphertext, nonce, tag } = cifrarSecretoTotp(SECRETO, CLAVE_VALIDA);
    const claveCorta = crypto.randomBytes(16).toString('base64');
    expect(() => descifrarSecretoTotp({ ciphertext, nonce, tag }, claveCorta)).toThrow();
  });

  test('descifrar con una clave DISTINTA (pero de longitud valida) falla', () => {
    const { ciphertext, nonce, tag } = cifrarSecretoTotp(SECRETO, CLAVE_VALIDA);
    const otraClaveValida = crypto.randomBytes(32).toString('base64');
    expect(() => descifrarSecretoTotp({ ciphertext, nonce, tag }, otraClaveValida)).toThrow();
  });

  test('un nonce de longitud invalida se rechaza al descifrar', () => {
    const { ciphertext, tag } = cifrarSecretoTotp(SECRETO, CLAVE_VALIDA);
    const nonceInvalido = crypto.randomBytes(8); // deberian ser 12
    expect(() => descifrarSecretoTotp({ ciphertext, nonce: nonceInvalido, tag }, CLAVE_VALIDA)).toThrow();
  });

  test('ningun error revela el secreto, la clave, el nonce, el ciphertext ni el tag', () => {
    const { ciphertext, nonce, tag } = cifrarSecretoTotp(SECRETO, CLAVE_VALIDA);
    const tagAlterado = Buffer.from(tag);
    tagAlterado[0] ^= 0xff;

    let errorCapturado;
    try {
      descifrarSecretoTotp({ ciphertext, nonce, tag: tagAlterado }, CLAVE_VALIDA);
    } catch (error) {
      errorCapturado = error;
    }

    expect(errorCapturado).toBeDefined();
    const mensaje = errorCapturado.message;
    const serializado = JSON.stringify(errorCapturado, Object.getOwnPropertyNames(errorCapturado));

    expect(mensaje).not.toContain(SECRETO);
    expect(mensaje).not.toContain(CLAVE_VALIDA);
    expect(mensaje.toLowerCase()).not.toMatch(/[0-9a-f]{16,}/); // sin volcados hex largos de material criptografico
    expect(serializado).not.toContain(SECRETO);
    expect(serializado).not.toContain(CLAVE_VALIDA);
    expect(serializado).not.toContain(ciphertext.toString('hex'));
    expect(serializado).not.toContain(nonce.toString('hex'));
    expect(serializado).not.toContain(tag.toString('hex'));
  });

  test('el error de clave invalida tampoco revela la clave provista', () => {
    const claveInvalida = 'esto-no-es-una-clave-de-32-bytes';
    let errorCapturado;
    try {
      cifrarSecretoTotp(SECRETO, claveInvalida);
    } catch (error) {
      errorCapturado = error;
    }
    expect(errorCapturado.message).not.toContain(claveInvalida);
  });
});
