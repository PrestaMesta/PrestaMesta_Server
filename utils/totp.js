// Envoltorio delgado sobre `otpauth` (RFC 6238 TOTP), Checkpoint 6B-1. No se implementa
// TOTP a mano: `otpauth` hace el HMAC/base32/comparacion de tiempo, aqui solo se fijan los
// parametros del proyecto (periodo, digitos, ventana de tolerancia) y se traduce su
// resultado a la forma que necesita el resto del sistema (incluyendo el indice de paso
// validado, para el anti-replay). Elegida sobre alternativas como `speakeasy`
// (practicamente sin mantenimiento) por estar activamente mantenida, sin dependencias
// nativas, y depender solo de `@noble/hashes` (libreria de criptografia auditada y muy
// usada). Compatible con Node >=22 (motor pineado del proyecto, ver package.json#engines).
const { TOTP, Secret } = require('otpauth');

const PERIODO_SEGUNDOS = 30; // RFC 6238 default, requerido explicitamente por este checkpoint
const DIGITOS = 6;
const ALGORITMO = 'SHA1'; // compatible con Google Authenticator / Authy / apps estandar
const VENTANA_PASOS = 1; // tolerancia MAXIMA actual: ±1 paso (90s de ventana total), no mas amplia
const TAMANO_SECRETO_BYTES = 20; // 160 bits, tamano recomendado por RFC 4226/6238 para SHA1

// Genera un secreto aleatorio nuevo, codificado en base32 (formato estandar otpauth/QR).
// Nunca se deriva de datos del usuario (email, id, etc.).
function generarSecreto() {
  return new Secret({ size: TAMANO_SECRETO_BYTES }).base32;
}

function construirTotp(secretoBase32, { etiqueta, emisor } = {}) {
  return new TOTP({
    issuer: emisor,
    label: etiqueta,
    algorithm: ALGORITMO,
    digits: DIGITOS,
    period: PERIODO_SEGUNDOS,
    secret: Secret.fromBase32(secretoBase32)
  });
}

// URI `otpauth://` para que el frontend renderice el QR de enrolamiento. Unico lugar donde
// `etiqueta`/`emisor` importan (no afectan el calculo criptografico del codigo).
function generarUri({ secretoBase32, etiqueta, emisor }) {
  return construirTotp(secretoBase32, { etiqueta, emisor }).toString();
}

// Genera el codigo TOTP vigente. `marcaDeTiempoMs` es el reloj INYECTABLE (default
// Date.now(), pero las pruebas pasan un valor fijo) -- nunca se lee la hora del sistema
// directamente dentro de esta funcion mas que como valor por defecto del parametro.
function generarCodigo({ secretoBase32, marcaDeTiempoMs = Date.now() }) {
  return construirTotp(secretoBase32).generate({ timestamp: marcaDeTiempoMs });
}

// Valida un codigo contra el secreto, con tolerancia ±1 paso. Devuelve
// `{ valido, timestep }`: `timestep` es el INDICE DE PASO RFC 6238
// (floor(segundos_unix / 30)) que realmente acepto el codigo -- no solo un booleano --
// porque el anti-replay (clientes_mfa.totp_ultimo_timestep_usado /
// administradores_mfa.totp_ultimo_timestep_usado) necesita comparar indices de paso, no
// marcas de tiempo de "ultimo uso" (ver docs/mfa-identidad-ine.md seccion 3.3 para el
// razonamiento completo). `timestep` es `null` cuando el codigo no es valido.
function validarCodigo({ secretoBase32, codigo, marcaDeTiempoMs = Date.now() }) {
  if (typeof codigo !== 'string' || !/^\d{6}$/.test(codigo)) {
    return { valido: false, timestep: null };
  }

  const delta = construirTotp(secretoBase32).validate({
    token: codigo,
    timestamp: marcaDeTiempoMs,
    window: VENTANA_PASOS
  });

  if (delta === null) {
    return { valido: false, timestep: null };
  }

  const pasoActual = Math.floor(marcaDeTiempoMs / 1000 / PERIODO_SEGUNDOS);
  return { valido: true, timestep: pasoActual + delta };
}

module.exports = {
  generarSecreto,
  generarUri,
  generarCodigo,
  validarCodigo,
  PERIODO_SEGUNDOS,
  DIGITOS,
  VENTANA_PASOS
};
