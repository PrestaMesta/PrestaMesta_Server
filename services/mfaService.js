// Servicio MFA (Checkpoint 6B-1, extendido en 6B-2): compone utils/mfaCrypto.js +
// utils/totp.js + utils/recoveryCodes.js + un repositorio MFA. Sigue sin usar AppError
// (utils/AppError.js): esa clase representa una respuesta HTTP, y esta capa no tiene
// superficie HTTP propia -- la traduce services/mfaAuthService.js, que si conoce el
// contrato HTTP (codigos, status). En su lugar, los fallos esperables (codigo invalido,
// timestep repetido, sin enrolamiento pendiente) se lanzan/devuelven con un identificador
// de MAQUINA (`tipoMfa` en el Error, o `motivo` en el resultado) en vez de forzar a
// mfaAuthService a inspeccionar texto de mensajes de error -- mas fragil y exactamente el
// tipo de acoplamiento por string que este proyecto evita en el resto del codigo.
//
// Distinto del resto de servicios del proyecto (que exportan una instancia ya lista MAS la
// factory, ej. `module.exports = createPrestamoService(); module.exports.createPrestamoService = ...`):
// aqui NO hay una instancia por defecto sensata, porque hay dos repositorios MFA reales
// (clienteMfaRepository / administradorMfaRepository) y ninguno es "el" default. Este
// modulo exporta unicamente la factory; quien la use (services/mfaAuthService.js) decide
// con que repositorio instanciarla.
const mfaCrypto = require('../utils/mfaCrypto');
const totp = require('../utils/totp');
const { generarCodigosRecuperacion, hashCodigoRecuperacion, compararCodigoRecuperacion } = require('../utils/recoveryCodes');
const env = require('../config/env');

// Identificadores de fallo estables para services/mfaAuthService.js (nunca se le da forma
// de AppError aqui). Nunca se serializan en un mensaje visible al cliente por si solos.
const TIPO_MFA = {
  SIN_ENROLAMIENTO_PENDIENTE: 'SIN_ENROLAMIENTO_PENDIENTE',
  CODIGO_INVALIDO: 'CODIGO_INVALIDO',
  CODIGO_REUTILIZADO: 'CODIGO_REUTILIZADO'
};

function crearErrorMfa(mensaje, tipoMfa) {
  const error = new Error(mensaje);
  error.tipoMfa = tipoMfa;
  return error;
}

function createMfaService({ mfaRepository }) {
  if (!mfaRepository) {
    throw new Error('createMfaService requiere mfaRepository (clienteMfaRepository o administradorMfaRepository).');
  }

  // Genera un secreto nuevo, lo cifra y lo persiste como PENDIENTE_CONFIRMACION. Devuelve
  // el secreto en claro + la URI otpauth:// -- unica vez que el secreto sale en claro de
  // esta capa.
  async function iniciarEnrolamiento({ usuarioId, etiqueta, emisor }) {
    const secretoBase32 = totp.generarSecreto();
    const { ciphertext, nonce, tag } = mfaCrypto.cifrarSecretoTotp(secretoBase32, env.MFA_ENCRYPTION_KEY_BASE64);
    await mfaRepository.iniciarEnrolamiento({ usuarioId, ciphertext, nonce, tag });
    const otpauthUri = totp.generarUri({ secretoBase32, etiqueta, emisor });
    return { secretoBase32, otpauthUri };
  }

  // Valida el primer codigo TOTP contra el secreto pendiente; si es correcto, activa el
  // MFA y genera+persiste (hasheado) un lote nuevo de codigos de recuperacion, devueltos en
  // claro una unica vez.
  async function confirmarEnrolamiento({ usuarioId, codigo, marcaDeTiempoMs }) {
    const fila = await mfaRepository.obtenerEstado(usuarioId);
    if (!fila || fila.estado !== 'PENDIENTE_CONFIRMACION') {
      throw crearErrorMfa(
        'No hay un enrolamiento MFA pendiente de confirmacion para este usuario.',
        TIPO_MFA.SIN_ENROLAMIENTO_PENDIENTE
      );
    }

    const secretoBase32 = mfaCrypto.descifrarSecretoTotp(
      { ciphertext: fila.totp_secret_ciphertext, nonce: fila.totp_secret_nonce, tag: fila.totp_secret_tag },
      env.MFA_ENCRYPTION_KEY_BASE64
    );

    const { valido, timestep } = totp.validarCodigo({ secretoBase32, codigo, marcaDeTiempoMs });
    if (!valido) {
      throw crearErrorMfa('Codigo TOTP invalido o expirado.', TIPO_MFA.CODIGO_INVALIDO);
    }

    const timestepAceptado = await mfaRepository.marcarTimestepUsado({ usuarioId, timestep });
    if (!timestepAceptado) {
      throw crearErrorMfa('Codigo TOTP ya utilizado.', TIPO_MFA.CODIGO_REUTILIZADO);
    }

    const confirmado = await mfaRepository.confirmarEnrolamiento(usuarioId);
    if (!confirmado) {
      // Perdida de carrera contra otra confirmacion/reset concurrente sobre el mismo
      // usuario: el timestep ya se marco como usado arriba (no se revierte -- un codigo
      // gastado sigue gastado aunque esta segunda verificacion falle), pero la transicion
      // de estado en si perdio la carrera.
      throw crearErrorMfa(
        'No hay un enrolamiento MFA pendiente de confirmacion para este usuario.',
        TIPO_MFA.SIN_ENROLAMIENTO_PENDIENTE
      );
    }

    const codigosRecuperacion = generarCodigosRecuperacion();
    const hashes = await Promise.all(codigosRecuperacion.map((codigoEnClaro) => hashCodigoRecuperacion(codigoEnClaro)));
    await mfaRepository.reemplazarCodigosRecuperacion({ usuarioId, hashes });

    return { codigosRecuperacion };
  }

  // Verifica un codigo TOTP contra el secreto YA ACTIVO (no el de enrolamiento pendiente).
  // Devuelve `{ valido, motivo? }`: `motivo` distingue "codigo invalido" de "codigo
  // correcto pero de un timestep ya usado" (reutilizacion/replay) para que
  // services/mfaAuthService.js pueda responder codigos HTTP distintos
  // (MFA_INVALID_CODE vs MFA_CODE_REUSED).
  async function verificarCodigoTotp({ usuarioId, codigo, marcaDeTiempoMs }) {
    const fila = await mfaRepository.obtenerEstado(usuarioId);
    if (!fila || fila.estado !== 'ACTIVO') {
      return { valido: false, motivo: TIPO_MFA.CODIGO_INVALIDO };
    }

    const secretoBase32 = mfaCrypto.descifrarSecretoTotp(
      { ciphertext: fila.totp_secret_ciphertext, nonce: fila.totp_secret_nonce, tag: fila.totp_secret_tag },
      env.MFA_ENCRYPTION_KEY_BASE64
    );

    const { valido, timestep } = totp.validarCodigo({ secretoBase32, codigo, marcaDeTiempoMs });
    if (!valido) {
      return { valido: false, motivo: TIPO_MFA.CODIGO_INVALIDO };
    }

    const aceptado = await mfaRepository.marcarTimestepUsado({ usuarioId, timestep });
    if (!aceptado) {
      return { valido: false, motivo: TIPO_MFA.CODIGO_REUTILIZADO };
    }
    return { valido: true };
  }

  // Busca entre TODOS los codigos de recuperacion (usados o no) uno que coincida
  // (bcrypt.compare, secuencial: como mucho 10 hashes, comparar en paralelo no aporta nada)
  // y lo consume de forma atomica si coincide y no estaba usado. Se consultan tambien los
  // ya usados (no solo los disponibles) para poder distinguir "codigo invalido" de "codigo
  // valido pero ya consumido" -- distincion que services/mfaAuthService.js traduce a
  // MFA_INVALID_CODE vs RECOVERY_CODE_ALREADY_USED.
  async function consumirCodigoRecuperacion({ usuarioId, codigo }) {
    const candidatos = await mfaRepository.obtenerCodigosRecuperacion(usuarioId);

    for (const candidato of candidatos) {
      const coincide = await compararCodigoRecuperacion(codigo, candidato.codigo_hash);
      if (coincide) {
        if (candidato.usado_en) {
          return { valido: false, motivo: 'CODIGO_YA_USADO' };
        }
        const consumido = await mfaRepository.consumirCodigoRecuperacion({ id: candidato.id, usuarioId });
        // Carrera: alguien mas lo consumio entre el SELECT y este UPDATE condicional.
        return consumido ? { valido: true } : { valido: false, motivo: 'CODIGO_YA_USADO' };
      }
    }

    return { valido: false, motivo: TIPO_MFA.CODIGO_INVALIDO };
  }

  return {
    iniciarEnrolamiento,
    confirmarEnrolamiento,
    verificarCodigoTotp,
    consumirCodigoRecuperacion
  };
}

module.exports = { createMfaService, TIPO_MFA };
