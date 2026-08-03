const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const {
  signClienteToken,
  signAdminToken,
  verifyClienteToken,
  verifyAdminToken,
  verifyAnyToken
} = require('../../utils/jwt');

const cliente = { id: 1, email: 'juan@example.com' };
const admin = { id: 2, email: 'admin@prestamesta.com', rol: 'SUPERADMIN' };

function expectAppError(fn, codigo) {
  try {
    fn();
    throw new Error('se esperaba que lanzara un AppError');
  } catch (error) {
    expect(error.codigo).toBe(codigo);
  }
}

describe('contrato JWT', () => {
  test('token de cliente incluye sub/email/tipoUsuario, audiencia de cliente, y NO rol', () => {
    const token = signClienteToken(cliente);
    const payload = verifyClienteToken(token);
    expect(payload.sub).toBe(String(cliente.id));
    expect(payload.email).toBe(cliente.email);
    expect(payload.tipoUsuario).toBe('CLIENTE');
    expect(payload.rol).toBeUndefined();
    expect(payload.iss).toBe(env.JWT_ISS);
    expect(payload.aud).toBe(env.JWT_AUD_CLIENTE);
    expect(payload.iat).toEqual(expect.any(Number));
    expect(payload.exp).toEqual(expect.any(Number));
  });

  test('token de admin incluye rol, tipoUsuario=ADMIN y audiencia de admin', () => {
    const token = signAdminToken(admin);
    const payload = verifyAdminToken(token);
    expect(payload.tipoUsuario).toBe('ADMIN');
    expect(payload.rol).toBe('SUPERADMIN');
    expect(payload.aud).toBe(env.JWT_AUD_ADMIN);
  });

  test('un token de CLIENTE es rechazado por verifyAdminToken (audiencias separadas)', () => {
    const tokenCliente = signClienteToken(cliente);
    expectAppError(() => verifyAdminToken(tokenCliente), 'TOKEN_INVALID');
  });

  test('un token de ADMIN es rechazado por verifyClienteToken (audiencias separadas)', () => {
    const tokenAdmin = signAdminToken(admin);
    expectAppError(() => verifyClienteToken(tokenAdmin), 'TOKEN_INVALID');
  });

  test('verifyAnyToken acepta ambas audiencias conocidas', () => {
    expect(verifyAnyToken(signClienteToken(cliente)).tipoUsuario).toBe('CLIENTE');
    expect(verifyAnyToken(signAdminToken(admin)).tipoUsuario).toBe('ADMIN');
  });

  test('verifyAnyToken rechaza una audiencia desconocida aunque la firma sea valida', () => {
    const tokenOtraAudiencia = jwt.sign(
      { sub: '1', email: cliente.email, tipoUsuario: 'CLIENTE' },
      env.JWT_SECRET,
      { algorithm: 'HS256', issuer: env.JWT_ISS, audience: 'otra-audiencia-cualquiera' }
    );
    expectAppError(() => verifyAnyToken(tokenOtraAudiencia), 'TOKEN_INVALID');
  });

  test('rechaza tokens firmados con otro secreto', () => {
    const tokenAjeno = jwt.sign(
      { sub: '1', email: cliente.email, tipoUsuario: 'CLIENTE' },
      'otro-secreto-cualquiera',
      { algorithm: 'HS256', issuer: env.JWT_ISS, audience: env.JWT_AUD_CLIENTE }
    );
    expectAppError(() => verifyClienteToken(tokenAjeno), 'TOKEN_INVALID');
  });

  test('rechaza tokens con algoritmo "none" (evita bypass de confusion de algoritmo)', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: '2',
        email: admin.email,
        tipoUsuario: 'ADMIN',
        rol: 'SUPERADMIN',
        iss: env.JWT_ISS,
        aud: env.JWT_AUD_ADMIN
      })
    ).toString('base64url');
    const tokenSinFirma = `${header}.${payload}.`;
    expectAppError(() => verifyAdminToken(tokenSinFirma), 'TOKEN_INVALID');
  });

  test('rechaza tokens sin issuer/audience esperados', () => {
    const tokenSinIssAud = jwt.sign(
      { sub: '1', email: cliente.email, tipoUsuario: 'CLIENTE' },
      env.JWT_SECRET,
      { algorithm: 'HS256' }
    );
    expectAppError(() => verifyClienteToken(tokenSinIssAud), 'TOKEN_INVALID');
  });

  test('rechaza un payload manipulado sin tipoUsuario aunque la firma sea valida', () => {
    const tokenSinTipoUsuario = jwt.sign({ sub: '1', email: cliente.email }, env.JWT_SECRET, {
      algorithm: 'HS256',
      issuer: env.JWT_ISS,
      audience: env.JWT_AUD_CLIENTE
    });
    expectAppError(() => verifyClienteToken(tokenSinTipoUsuario), 'TOKEN_INVALID');
  });

  test('rechaza un token ADMIN sin claim de rol', () => {
    const tokenAdminSinRol = jwt.sign(
      { sub: '2', email: admin.email, tipoUsuario: 'ADMIN' },
      env.JWT_SECRET,
      { algorithm: 'HS256', issuer: env.JWT_ISS, audience: env.JWT_AUD_ADMIN }
    );
    expectAppError(() => verifyAdminToken(tokenAdminSinRol), 'TOKEN_INVALID');
  });

  test('un token expirado devuelve el codigo TOKEN_EXPIRED (distinto de TOKEN_INVALID)', () => {
    const tokenExpirado = jwt.sign(
      { sub: '1', email: cliente.email, tipoUsuario: 'CLIENTE' },
      env.JWT_SECRET,
      { algorithm: 'HS256', issuer: env.JWT_ISS, audience: env.JWT_AUD_CLIENTE, expiresIn: -10 }
    );
    expectAppError(() => verifyClienteToken(tokenExpirado), 'TOKEN_EXPIRED');
  });

  test('un token malformado (no expirado) devuelve TOKEN_INVALID, no TOKEN_EXPIRED', () => {
    expectAppError(() => verifyClienteToken('esto-no-es-un-jwt'), 'TOKEN_INVALID');
  });
});
