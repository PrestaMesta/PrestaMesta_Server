// Orquestacion MFA de acceso (Checkpoint 6B-2): agnostica de dominio (cliente/admin), igual
// que repositories/clienteMfaRepository.js / repositories/administradorMfaRepository.js son
// intercambiables entre si. A diferencia de services/mfaService.js (que solo lanza Error
// planos, sin superficie HTTP), esta capa SI conoce el contrato HTTP: traduce los
// resultados/errores de mfaService a AppError con los codigos definidos en
// docs/mfa-identidad-ine.md (extendidos/ajustados para esta fase, ver el reporte del
// checkpoint), y es quien firma los tokens (pre-MFA en login, sesion tras completar MFA).
//
// `firmarPreMfa`/`firmarSesion` se inyectan desde quien instancia este servicio
// (services/clienteAuthService.js / services/adminAuthService.js) porque la forma exacta
// del JWT (con o sin `rol`) es especifica de cada dominio -- esta capa no sabe ni le
// importa cual es.
const AppError = require('../utils/AppError');
const { createMfaService, TIPO_MFA } = require('./mfaService');

function createMfaAuthService({ mfaRepository, firmarPreMfa, firmarSesion }) {
  if (!mfaRepository || !firmarPreMfa || !firmarSesion) {
    throw new Error('createMfaAuthService requiere mfaRepository, firmarPreMfa y firmarSesion.');
  }
  const mfaService = createMfaService({ mfaRepository });

  async function obtenerEstadoMfa(usuarioId) {
    const fila = await mfaRepository.obtenerEstado(usuarioId);
    return fila ? fila.estado : 'NO_ENROLADO';
  }

  // Unico lugar donde se decide el discriminador `siguientePaso` -- el cliente HTTP nunca
  // debe inferirlo el mismo a partir de `mfaEstado` (docs/mfa-identidad-ine.md, seccion 3.1).
  function siguientePasoDesdeEstado(estadoMfa) {
    return estadoMfa === 'ACTIVO' ? 'MFA_CHALLENGE_REQUIRED' : 'MFA_ENROLLMENT_REQUIRED';
  }

  // Llamado desde login tras verificar el password. Nunca emite un token de sesion: eso
  // solo ocurre al completar enrolamiento o desafio.
  async function iniciarPreMfa(usuario) {
    const estadoMfa = await obtenerEstadoMfa(usuario.id);
    return {
      preMfaToken: firmarPreMfa(usuario),
      siguientePaso: siguientePasoDesdeEstado(estadoMfa),
      mfaEstado: estadoMfa
    };
  }

  // Si el MFA ya esta ACTIVO, un token pre-MFA (sin step-up) no puede re-enrolar --
  // MFA_CHALLENGE_REQUIRED le dice al cliente que complete el desafio en su lugar (ver
  // docs/mfa-identidad-ine.md seccion 3.2, "reenrolar exige sesion completa + step-up").
  async function iniciarEnrolamiento(usuario) {
    const estadoMfa = await obtenerEstadoMfa(usuario.id);
    if (estadoMfa === 'ACTIVO') {
      throw new AppError(
        409,
        'MFA_CHALLENGE_REQUIRED',
        'El MFA ya esta activo para esta cuenta. Completa el desafio en vez de enrolar de nuevo.'
      );
    }
    const { secretoBase32, otpauthUri } = await mfaService.iniciarEnrolamiento({
      usuarioId: usuario.id,
      etiqueta: usuario.email,
      emisor: 'Prestamesta'
    });
    return { secretoBase32, otpauthUri };
  }

  async function confirmarEnrolamiento(usuario, codigo) {
    let resultado;
    try {
      resultado = await mfaService.confirmarEnrolamiento({ usuarioId: usuario.id, codigo });
    } catch (error) {
      if (error.tipoMfa === TIPO_MFA.SIN_ENROLAMIENTO_PENDIENTE) {
        throw new AppError(
          409,
          'MFA_ENROLLMENT_REQUIRED',
          'No hay un enrolamiento MFA pendiente de confirmacion. Inicia el enrolamiento primero.'
        );
      }
      // CODIGO_INVALIDO o CODIGO_REUTILIZADO durante la confirmacion del enrolamiento: en
      // esta fase (primer codigo, recien generado) ambos casos son igual de accionables
      // ("vuelve a intentar con un codigo vigente"), asi que comparten un unico codigo,
      // distinto de MFA_INVALID_CODE/MFA_CODE_REUSED (esos son especificos del desafio de
      // login, ver verificarDesafio).
      throw new AppError(400, 'MFA_ENROLLMENT_INVALID', 'El codigo de confirmacion no es valido.');
    }

    return {
      token: firmarSesion(usuario, { amr: ['pwd', 'totp'] }),
      codigosRecuperacion: resultado.codigosRecuperacion
    };
  }

  async function verificarDesafio(usuario, { codigo, codigoRecuperacion }) {
    const estadoMfa = await obtenerEstadoMfa(usuario.id);
    if (estadoMfa !== 'ACTIVO') {
      throw new AppError(
        409,
        'MFA_ENROLLMENT_REQUIRED',
        'El MFA no esta activo para esta cuenta. Completa el enrolamiento primero.'
      );
    }

    if (codigo) {
      const { valido, motivo } = await mfaService.verificarCodigoTotp({ usuarioId: usuario.id, codigo });
      if (!valido) {
        if (motivo === TIPO_MFA.CODIGO_REUTILIZADO) {
          throw new AppError(401, 'MFA_CODE_REUSED', 'Este codigo TOTP ya fue utilizado.');
        }
        throw new AppError(401, 'MFA_INVALID_CODE', 'Codigo TOTP invalido o expirado.');
      }
      return { token: firmarSesion(usuario, { amr: ['pwd', 'totp'] }) };
    }

    const { valido, motivo } = await mfaService.consumirCodigoRecuperacion({
      usuarioId: usuario.id,
      codigo: codigoRecuperacion
    });
    if (!valido) {
      if (motivo === 'CODIGO_YA_USADO') {
        throw new AppError(401, 'RECOVERY_CODE_ALREADY_USED', 'Este codigo de recuperacion ya fue utilizado.');
      }
      throw new AppError(401, 'MFA_INVALID_CODE', 'Codigo de recuperacion invalido.');
    }
    return { token: firmarSesion(usuario, { amr: ['pwd', 'recovery'] }) };
  }

  return { iniciarPreMfa, iniciarEnrolamiento, confirmarEnrolamiento, verificarDesafio };
}

module.exports = { createMfaAuthService };
