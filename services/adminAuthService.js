const bcrypt = require('bcryptjs');
const AppError = require('../utils/AppError');
const { signAdminToken } = require('../utils/jwt');
const logger = require('../utils/logger');
const administradorRepositoryReal = require('../repositories/administradorRepository');
const auditoriaRepositoryReal = require('../repositories/auditoriaRepository');

function createAdminAuthService({ administradorRepository, auditoriaRepository } = {}) {
  const adminRepo = administradorRepository || administradorRepositoryReal;
  const auditRepo = auditoriaRepository || auditoriaRepositoryReal;

  async function login({ email, password }) {
    const admin = await adminRepo.obtenerPorEmail(email); // ya filtra activo = TRUE

    // Mismo status/codigo/mensaje si el email no existe, el password es incorrecto, o la
    // cuenta esta desactivada: no se revela cual de los tres paso.
    if (!admin) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Credenciales invalidas.');
    }
    const coincide = await bcrypt.compare(password, admin.password);
    if (!coincide) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Credenciales invalidas.');
    }

    const token = signAdminToken(admin);

    await registrarAuditoriaSinFallar({
      usuarioId: admin.id,
      tipoUsuario: 'ADMIN',
      accion: 'LOGIN_ADMIN',
      detalles: { adminId: admin.id }
    });

    return {
      token,
      admin: { id: admin.id, nombre: admin.nombre, email: admin.email, rol: admin.rol }
    };
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

  return { login, crearAdministrador };
}

module.exports = createAdminAuthService();
module.exports.createAdminAuthService = createAdminAuthService;
