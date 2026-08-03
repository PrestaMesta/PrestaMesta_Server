const bcrypt = require('bcryptjs');
const AppError = require('../utils/AppError');
const { signClienteToken } = require('../utils/jwt');
const clienteRepositoryReal = require('../repositories/clienteRepository');

// Factory con inyeccion de dependencias (patron minimo, sin framework de DI): permite que
// las pruebas unitarias inyecten un repositorio falso sin tocar MySQL. La app real usa
// module.exports de mas abajo, ya instanciado con el repositorio real.
function createClienteAuthService({ clienteRepository } = {}) {
  const repo = clienteRepository || clienteRepositoryReal;

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

  async function login({ email, password }) {
    const cliente = await repo.obtenerPorEmail(email);

    // Mismo status/codigo/mensaje tanto si el email no existe como si el password es
    // incorrecto: cierra el oraculo de enumeracion de correos detectado en el diagnostico.
    if (!cliente) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Credenciales invalidas.');
    }
    const coincide = await bcrypt.compare(password, cliente.password);
    if (!coincide) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Credenciales invalidas.');
    }

    const token = signClienteToken(cliente);
    return {
      token,
      cliente: { id: cliente.id, nombre: cliente.nombre, email: cliente.email }
    };
  }

  return { registrar, login };
}

module.exports = createClienteAuthService();
module.exports.createClienteAuthService = createClienteAuthService;
