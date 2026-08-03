const { crearCargarAdministradorActual } = require('../../middleware/cargarAdministradorActual');
const { autorizarRoles } = require('../../middleware/autorizarRoles');

function crearReqRes(usuario) {
  return { req: { usuario }, res: {}, next: jest.fn() };
}

describe('cargarAdministradorActual (re-verificacion en BD)', () => {
  test('rechaza con TOKEN_INVALID si el administrador fue desactivado despues de emitir el token', async () => {
    const repo = { obtenerActivoPorId: jest.fn().mockResolvedValue(null) };
    const middleware = crearCargarAdministradorActual({ administradorRepository: repo });
    const { req, res, next } = crearReqRes({ sub: '5', rol: 'SUPERADMIN', tipoUsuario: 'ADMIN' });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'TOKEN_INVALID', status: 401 }));
    expect(req.administradorActual).toBeUndefined();
  });

  test('usa el rol ACTUAL de la base de datos, nunca el que traia el JWT', async () => {
    const repo = { obtenerActivoPorId: jest.fn().mockResolvedValue({ id: 5, rol: 'COBRADOR', activo: 1 }) };
    const middleware = crearCargarAdministradorActual({ administradorRepository: repo });
    // El JWT (emitido antes de que le cambiaran el rol) todavia dice SUPERADMIN.
    const { req, res, next } = crearReqRes({ sub: '5', rol: 'SUPERADMIN', tipoUsuario: 'ADMIN' });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.administradorActual.rol).toBe('COBRADOR');
  });
});

describe('autorizarRoles (usa req.administradorActual, no req.usuario)', () => {
  test('ANALISTA no puede crear administradores (solo SUPERADMIN)', () => {
    const { req, res, next } = crearReqRes();
    req.administradorActual = { id: 1, rol: 'ANALISTA', activo: 1 };

    autorizarRoles('SUPERADMIN')(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'FORBIDDEN', status: 403 }));
  });

  test('COBRADOR no puede aprobar/rechazar prestamos', () => {
    const { req, res, next } = crearReqRes();
    req.administradorActual = { id: 1, rol: 'COBRADOR', activo: 1 };

    autorizarRoles('SUPERADMIN', 'ANALISTA')(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'FORBIDDEN', status: 403 }));
  });

  test('SUPERADMIN si puede crear administradores', () => {
    const { req, res, next } = crearReqRes();
    req.administradorActual = { id: 1, rol: 'SUPERADMIN', activo: 1 };

    autorizarRoles('SUPERADMIN')(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  test('un rol previamente autorizado deja de estarlo si la BD ya no lo respalda (defensa en profundidad)', () => {
    const { req, res, next } = crearReqRes();
    // Simula que cargarAdministradorActual NO corrio (bug de orden de middlewares):
    // autorizarRoles debe fallar cerrado, no asumir nada.
    autorizarRoles('SUPERADMIN')(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'FORBIDDEN', status: 403 }));
  });
});
