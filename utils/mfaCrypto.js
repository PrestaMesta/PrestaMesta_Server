// Cifrado autenticado (AES-256-GCM) del secreto TOTP en reposo (Checkpoint 6B-1,
// docs/mfa-identidad-ine.md seccion 4). Ninguna funcion de este archivo registra (log,
// console, error.message expuesto al llamador) el secreto en claro, la clave, el nonce, el
// ciphertext ni el tag -- todo fallo se traduce a un mensaje generico sin datos, para que
// ni siquiera un log/reporte de error accidental filtre material criptografico. No hay
// ninguna llamada a `console`/`logger` en este archivo a proposito: no hay nada seguro que
// loguear aqui.
const crypto = require('crypto');

const ALGORITMO = 'aes-256-gcm';
const LONGITUD_CLAVE_BYTES = 32; // AES-256
const LONGITUD_NONCE_BYTES = 12; // tamano recomendado (96 bits) para GCM
const LONGITUD_TAG_BYTES = 16; // tamano de tag por defecto de GCM (128 bits)

// Decodifica y valida la clave. Fallo cerrado: cualquier clave que no decodifique a
// EXACTAMENTE 32 bytes se rechaza aqui, antes de intentar cifrar/descifrar nada. Esta es
// una segunda capa de defensa (config/env.js ya valida esto al arrancar la app) para
// cualquier llamador que invoque esta utilidad directamente, incluidas las pruebas.
function decodificarClave(claveBase64) {
  if (typeof claveBase64 !== 'string' || claveBase64.length === 0) {
    throw new Error('Clave de cifrado MFA invalida.');
  }
  const clave = Buffer.from(claveBase64, 'base64');
  if (clave.length !== LONGITUD_CLAVE_BYTES) {
    throw new Error('Clave de cifrado MFA invalida.');
  }
  return clave;
}

// Cifra un secreto TOTP en claro (string). Devuelve ciphertext/nonce/tag como Buffers
// SEPARADOS (a proposito, distinto de la propuesta original en docs/mfa-identidad-ine.md de
// concatenarlos en una sola columna -- ver el reporte de este checkpoint): cada uno se
// persiste en su propia columna (repositories/clienteMfaRepository.js,
// repositories/administradorMfaRepository.js).
//
// El nonce es aleatorio y UNICO por cada llamada (crypto.randomBytes en cada invocacion,
// nunca derivado de datos previsibles): reusar un nonce con la misma clave rompe por
// completo la seguridad de GCM, asi que nunca se acepta un nonce como parametro de entrada.
function cifrarSecretoTotp(secretoPlano, claveBase64) {
  if (typeof secretoPlano !== 'string' || secretoPlano.length === 0) {
    throw new Error('Secreto TOTP invalido.');
  }
  const clave = decodificarClave(claveBase64);
  const nonce = crypto.randomBytes(LONGITUD_NONCE_BYTES);
  const cipher = crypto.createCipheriv(ALGORITMO, clave, nonce);
  const ciphertext = Buffer.concat([cipher.update(secretoPlano, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, nonce, tag };
}

// Descifra un secreto TOTP. Fallo cerrado: clave de longitud invalida, tag alterado
// (ciphertext o tag modificados/corruptos) o nonce de longitud invalida terminan TODOS en
// el mismo error generico -- nunca se distingue cual de los tres fallo en el mensaje, para
// no darle a un atacante informacion fina sobre por que el descifrado no funciono (mismo
// principio anti-enumeracion que ya usan login y la propiedad de prestamos en el resto del
// proyecto). `decipher.final()` de Node ya verifica el auth tag automaticamente y lanza si
// no coincide; ese throw se recatcha aqui y se re-lanza sin ningun detalle.
function descifrarSecretoTotp({ ciphertext, nonce, tag }, claveBase64) {
  const clave = decodificarClave(claveBase64);

  if (!Buffer.isBuffer(ciphertext) || ciphertext.length === 0) {
    throw new Error('No se pudo descifrar el secreto TOTP.');
  }
  if (!Buffer.isBuffer(nonce) || nonce.length !== LONGITUD_NONCE_BYTES) {
    throw new Error('No se pudo descifrar el secreto TOTP.');
  }
  if (!Buffer.isBuffer(tag) || tag.length !== LONGITUD_TAG_BYTES) {
    throw new Error('No se pudo descifrar el secreto TOTP.');
  }

  try {
    const decipher = crypto.createDecipheriv(ALGORITMO, clave, nonce);
    decipher.setAuthTag(tag);
    const secretoPlano = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return secretoPlano.toString('utf8');
  } catch {
    throw new Error('No se pudo descifrar el secreto TOTP.');
  }
}

module.exports = {
  cifrarSecretoTotp,
  descifrarSecretoTotp,
  LONGITUD_CLAVE_BYTES,
  LONGITUD_NONCE_BYTES,
  LONGITUD_TAG_BYTES
};
