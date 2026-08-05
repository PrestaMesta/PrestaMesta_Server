const bcrypt = require('bcryptjs');
const AppError = require('../utils/AppError');
const { signAdminPreMfaToken, signAdminSessionToken } = require('../utils/jwt');
const logger = require('../utils/logger');
const administradorRepositoryReal = require('../repositories/administradorRepository');
const administradorMfaRepositoryReal = require('../repositories/administradorMfaRepository');
const auditoriaRepositoryReal = require('../repositories/auditoriaRepository');
const { createMfaAuthService } = require('./mfaAuthService');

function createAdminAuthService({ administradorRepository, mfaRepository, auditoriaRepository } = {}) {
  const adminRepo = administradorRepository || administradorRepositoryReal;
  const mfaRepo = mfaRepository || administradorMfaRepositoryReal;
  const auditRepo = auditoriaRepository || auditoriaRepositoryReal;

  // Ver services/clienteAuthService.js para el mismo patron (mfaAuth agnostico de dominio,
  // solo se le inyectan las funciones de firma especificas de administradores).
  const mfaAuth = createMfaAuthService({
    mfaRepository: mfaRepo,
    firmarPreMfa: signAdminPreMfaToken,
    firmarSesion: signAdminSessionToken
  });

  // Checkpoint 6B-2: cambio de contrato (breaking, documentado en CLAUDE.md/openapi.yaml).
  // Ya NO devuelve un token de sesion utilizable de inmediato -- tras password correcto,
  // devuelve un token PRE-MFA y el discriminador `siguientePaso`. El colapso de "email no
  // existe" vs "password incorrecto" vs "cuenta desactivada" en un unico 401
  // INVALID_CREDENTIALS NO cambia (adminRepo.obtenerPorEmail ya filtra activo = TRUE, igual
  // que antes): ese chequeo ocurre exactamente igual, antes de consultar el estado de MFA.
  async function login({ email, password }) {
    const admin = await adminRepo.obtenerPorEmail(email); // ya filtra activo = TRUE

    if (!admin) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Credenciales invalidas.');
    }
    const coincide = await bcrypt.compare(password, admin.password);
    if (!coincide) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Credenciales invalidas.');
    }

    return mfaAuth.iniciarPreMfa(admin);
  }

  // --- MFA de acceso (Checkpoint 6B-2) --- El `admin` que reciben estas tres funciones sale
  // de la combinacion de req.usuario (JWT pre-MFA/sesion) + req.administradorActual (releido
  // de BD por middleware/cargarAdministradorActual.js): el `rol` que termina en el token de
  // sesion nuevo SIEMPRE viene de la base de datos, nunca de un claim del token pre-MFA (que
  // ademas no lo incluye a proposito, ver utils/jwt.js).

  async function iniciarEnrolamientoMfa(admin) {
    return mfaAuth.iniciarEnrolamiento(admin);
  }

  // Revision post-6B-2: igual que services/clienteAuthService.js, estas dos respuestas
  // (las unicas que emiten sesion completa) devuelven `admin` con el mismo shape minimo que
  // ya devolvia el login anterior a 6B-2: { id, nombre, email, rol }. `nombre` se relee de
  // BD por `admin.id` (id ya verificado -- via el token pre-MFA + cargarAdministradorActual,
  // nunca un dato enviado por el usuario); `rol` en la respuesta usa el mismo valor
  // DB-releido que ya trae `admin.rol` (de cargarAdministradorActual), no uno nuevo, para no
  // depender de dos lecturas de BD potencialmente inconsistentes entre si dentro de la
  // misma peticion. Se relee ANTES de tocar mfaAuth por la misma razon que en el dominio
  // cliente: no dejar un codigo ya consumido sin poder devolver la respuesta.
  async function confirmarEnrolamientoMfa(admin, codigo) {
    const perfil = await obtenerPerfil(admin);
    const resultado = await mfaAuth.confirmarEnrolamiento(admin, codigo);
    return { ...resultado, admin: perfil };
  }

  async function verificarDesafioMfa(admin, { codigo, codigoRecuperacion }) {
    const perfil = await obtenerPerfil(admin);
    const resultado = await mfaAuth.verificarDesafio(admin, { codigo, codigoRecuperacion });
    return { ...resultado, admin: perfil };
  }

  async function obtenerPerfil(admin) {
    const fila = await adminRepo.obtenerPorId(admin.id);
    if (!fila) {
      throw new AppError(401, 'TOKEN_INVALID', 'Token invalido.');
    }
    return { id: fila.id, nombre: fila.nombre, email: fila.email, rol: admin.rol };
  }

  // El llamador (middleware/cargarAdministradorActual.js + autorizarRoles('SUPERADMIN'))
  // ya confirmo, releyendo de BD, que quien crea este administrador sigue siendo
  // SUPERADMIN activo; esta funcion no repite esa verificacion.
  async function crearAdministrador({ nombre, email, password, rol }, creadorId) {
    const yaExiste = await adminRepo.existePorEmail(email);
    if (yaExiste) {
      throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'El correo ya esta registrado para un administrador.');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const adminId = await adminRepo.crear({ nombre, email, passwordHash, rol });

    await registrarAuditoriaSinFallar({
      usuarioId: creadorId,
      tipoUsuario: 'ADMIN',
      accion: 'CREO_ADMINISTRADOR',
      detalles: { adminCreadoId: adminId, rolAsignado: rol }
    });

    return { adminId, rol };
  }

  // Politica documentada (Fase 11): MySQL y MongoDB no comparten transaccion distribuida.
  // Si la auditoria falla, la operacion de negocio YA se confirmo y se considera exitosa
  // igual; el fallo se registra como evento de seguridad estructurado, nunca se finge que
  // la auditoria se guardo ni se revierte la operacion principal por esto.
  async function registrarAuditoriaSinFallar(evento) {
    try {
      await auditRepo.registrar(evento);
    } catch (error) {
      logger.error('Auditoria no registrada', {
        evento: 'AUDITORIA_NO_REGISTRADA',
        accion: evento.accion,
        errorTipo: error.name || 'Error'
      });
    }
  }

  return {
    login,
    iniciarEnrolamientoMfa,
    confirmarEnrolamientoMfa,
    verificarDesafioMfa,
    crearAdministrador
  };
}

module.exports = createAdminAuthService();
module.exports.createAdminAuthService = createAdminAuthService;
