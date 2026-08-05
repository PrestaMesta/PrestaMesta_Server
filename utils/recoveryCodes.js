// Codigos de recuperacion de MFA (Checkpoint 6B-1, docs/mfa-identidad-ine.md secciones 3.2
// y 3.4). Generacion con entropia suficiente, hash con bcrypt (mismo tratamiento que
// clientes.password/administradores.password -- no se introduce un primitivo de cifrado
// nuevo sin motivo), comparacion segura via bcrypt.compare. El valor en claro nunca se
// persiste ni se loguea: esta funcion solo lo devuelve al llamador, que es responsabilidad
// de la capa de servicio mostrarlo una unica vez.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const CANTIDAD_DEFECTO = 10;
const BYTES_ENTROPIA = 10; // 80 bits -- muy por encima de lo que un ataque de fuerza bruta online puede agotar
const SALT_ROUNDS = 10; // mismo valor que ya usa el resto del proyecto (bcrypt.genSalt(10))

// Un codigo: 20 caracteres hexadecimales (80 bits), agrupados en 5 bloques de 4 separados
// por guion para que sea legible/transcribible a mano (ej. "A1B2-C3D4-E5F6-0708-090A").
function generarUnCodigo() {
  return crypto
    .randomBytes(BYTES_ENTROPIA)
    .toString('hex')
    .toUpperCase()
    .match(/.{1,4}/g)
    .join('-');
}

// Genera N codigos UNICOS entre si (dedup defensivo: a 80 bits de entropia una colision es
// astronomicamente improbable, pero se verifica de todos modos para que la garantia de
// unicidad nunca dependa solo de la probabilidad).
function generarCodigosRecuperacion(cantidad = CANTIDAD_DEFECTO) {
  const codigos = new Set();
  while (codigos.size < cantidad) {
    codigos.add(generarUnCodigo());
  }
  return [...codigos];
}

// Nunca se loguea `codigo` aqui ni se incluye en ningun mensaje de error.
async function hashCodigoRecuperacion(codigo) {
  if (typeof codigo !== 'string' || codigo.length === 0) {
    throw new Error('Codigo de recuperacion invalido.');
  }
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  return bcrypt.hash(codigo, salt);
}

// Comparacion segura (bcrypt.compare es resistente a timing attacks por diseno, igual que
// ya se usa para password). Nunca se loguea `codigo` ni `hash`.
async function compararCodigoRecuperacion(codigo, hash) {
  if (typeof codigo !== 'string' || codigo.length === 0 || typeof hash !== 'string' || hash.length === 0) {
    return false;
  }
  return bcrypt.compare(codigo, hash);
}

module.exports = {
  generarCodigosRecuperacion,
  hashCodigoRecuperacion,
  compararCodigoRecuperacion,
  CANTIDAD_DEFECTO
};
