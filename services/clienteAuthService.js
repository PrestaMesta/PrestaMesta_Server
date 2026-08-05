const bcrypt = require('bcryptjs');
const AppError = require('../utils/AppError');
const { signClientePreMfaToken, signClienteSessionToken } = require('../utils/jwt');
const clienteRepositoryReal = require('../repositories/clienteRepository');
const clienteMfaRepositoryReal = require('../repositories/clienteMfaRepository');
const { createMfaAuthService } = require('./mfaAuthService');

// Factory con inyeccion de dependencias (patron minimo, sin framework de DI): permite que
// las pruebas unitarias inyecten repositorios falsos sin tocar MySQL. La app real usa
// module.exports de mas abajo, ya instanciado con los repositorios reales.
function createClienteAuthService({ clienteRepository, mfaRepository } = {}) {
  const repo = clienteRepository || clienteRepositoryReal;
  const mfaRepo = mfaRepository || clienteMfaRepositoryReal;

  // mfaAuth conoce el contrato HTTP de MFA (codigos AppError, forma de los JWT) pero no
  // sabe nada de clientes especificamente -- se le inyectan las funciones de firma de este
  // dominio (Checkpoint 6B-2, ver services/mfaAuthService.js).
  const mfaAuth = createMfaAuthService({
    mfaRepository: mfaRepo,
    firmarPreMfa: signClientePreMfaToken,
    firmarSesion: signClienteSessionToken
  });

  async function registrar({ nombre, email, password, telefono }) {
    const yaExiste = await repo.existePorEmail(email);
    if (yaExiste) {
      throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'El correo ya esta registrado.');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const clienteId = await repo.crear({ nombre, email, passwordHash, telefono });

    return { clienteId };
  }

  // Checkpoint 6B-2: cambio de contrato (breaking, documentado en CLAUDE.md/openapi.yaml).
  // Ya NO devuelve un token de sesion utilizable de inmediato -- tras password correcto,
  // devuelve un token PRE-MFA y el discriminador `siguientePaso`
  // (MFA_ENROLLMENT_REQUIRED | MFA_CHALLENGE_REQUIRED). El colapso de "email no existe" vs
  // "password incorrecto" en un unico 401 INVALID_CREDENTIALS NO cambia: ese chequeo ocurre
  // exactamente igual, antes de siquiera consultar el estado de MFA.
  async function login({ email, password }) {
    const cliente = await repo.obtenerPorEmail(email);

    if (!cliente) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Credenciales invalidas.');
    }
    const coincide = await bcrypt.compare(password, cliente.password);
    if (!coincide) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Credenciales invalidas.');
    }

    return mfaAuth.iniciarPreMfa(cliente);
  }

  // --- MFA de acceso (Checkpoint 6B-2) --- El `cliente` que reciben estas tres funciones
  // sale del token PRE-MFA/verificado por el controller (`{ id, email }`), nunca de query
  // ni body: no hay forma de enrolar/confirmar/verificar el MFA de otro cliente.

  async function iniciarEnrolamientoMfa(cliente) {
    return mfaAuth.iniciarEnrolamiento(cliente);
  }

  // Revision post-6B-2: no existe un endpoint /me, y el frontend necesita el perfil minimo
  // para construir la sesion apenas recibe el token DEFINITIVO -- por eso estas dos
  // respuestas (las unicas que emiten sesion completa) tambien devuelven `cliente`, con el
  // mismo shape minimo que ya devolvia el login anterior a 6B-2: { id, nombre, email }. El
  // perfil se relee de BD por `cliente.id` (el `id` verificado del token, nunca un dato que
  // el usuario pueda enviar) porque el token pre-MFA no trae `nombre` (deliberadamente
  // minimo, ver utils/jwt.js). Se relee ANTES de tocar mfaAuth para no dejar un codigo
  // TOTP/recuperacion ya consumido sin poder devolver la respuesta si esta lectura fallara.
  async function confirmarEnrolamientoMfa(cliente, codigo) {
    const perfil = await obtenerPerfil(cliente.id);
    const resultado = await mfaAuth.confirmarEnrolamiento(cliente, codigo);
    return { ...resultado, cliente: perfil };
  }

  async function verificarDesafioMfa(cliente, { codigo, codigoRecuperacion }) {
    const perfil = await obtenerPerfil(cliente.id);
    const resultado = await mfaAuth.verificarDesafio(cliente, { codigo, codigoRecuperacion });
    return { ...resultado, cliente: perfil };
  }

  async function obtenerPerfil(clienteId) {
    const fila = await repo.obtenerPorId(clienteId);
    if (!fila) {
      // El cliente del token verificado ya no existe en BD (caso extremo). Mismo codigo que
      // el resto del sistema usa para "esta identidad ya no es valida".
      throw new AppError(401, 'TOKEN_INVALID', 'Token invalido.');
    }
    return { id: fila.id, nombre: fila.nombre, email: fila.email };
  }

  return { registrar, login, iniciarEnrolamientoMfa, confirmarEnrolamientoMfa, verificarDesafioMfa };
}

module.exports = createClienteAuthService();
module.exports.createClienteAuthService = createClienteAuthService;
