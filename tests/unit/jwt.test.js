const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const {
  signClientePreMfaToken,
  signAdminPreMfaToken,
  signClienteSessionToken,
  signAdminSessionToken,
  verifyClienteSessionToken,
  verifyAdminSessionToken,
  verifyAnySessionToken,
  verifyClientePreMfaToken,
  verifyAdminPreMfaToken
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

describe('contrato JWT: sesion completa', () => {
  test('token de cliente incluye sub/email/tipoUsuario, token_use=session, amr, auth_time, audiencia de cliente, y NO rol', () => {
    const token = signClienteSessionToken(cliente, { amr: ['pwd', 'totp'] });
    const payload = verifyClienteSessionToken(token);
    expect(payload.sub).toBe(String(cliente.id));
    expect(payload.email).toBe(cliente.email);
    expect(payload.tipoUsuario).toBe('CLIENTE');
    expect(payload.rol).toBeUndefined();
    expect(payload.token_use).toBe('session');
    expect(payload.amr).toEqual(['pwd', 'totp']);
    expect(payload.auth_time).toEqual(expect.any(Number));
    expect(payload.iss).toBe(env.JWT_ISS);
    expect(payload.aud).toBe(env.JWT_AUD_CLIENTE);
    expect(payload.iat).toEqual(expect.any(Number));
    expect(payload.exp).toEqual(expect.any(Number));
  });

  test('signClienteSessionToken sin amr explicito usa ["pwd"] por defecto', () => {
    const payload = verifyClienteSessionToken(signClienteSessionToken(cliente));
    expect(payload.amr).toEqual(['pwd']);
  });

  test('token de admin incluye rol, tipoUsuario=ADMIN, token_use=session y audiencia de admin', () => {
    const token = signAdminSessionToken(admin, { amr: ['pwd', 'recovery'] });
    const payload = verifyAdminSessionToken(token);
    expect(payload.tipoUsuario).toBe('ADMIN');
    expect(payload.rol).toBe('SUPERADMIN');
    expect(payload.token_use).toBe('session');
    expect(payload.amr).toEqual(['pwd', 'recovery']);
    expect(payload.auth_time).toEqual(expect.any(Number));
    expect(payload.aud).toBe(env.JWT_AUD_ADMIN);
  });

  test('un token de CLIENTE es rechazado por verifyAdminSessionToken (audiencias separadas)', () => {
    const tokenCliente = signClienteSessionToken(cliente);
    expectAppError(() => verifyAdminSessionToken(tokenCliente), 'TOKEN_INVALID');
  });

  test('un token de ADMIN es rechazado por verifyClienteSessionToken (audiencias separadas)', () => {
    const tokenAdmin = signAdminSessionToken(admin);
    expectAppError(() => verifyClienteSessionToken(tokenAdmin), 'TOKEN_INVALID');
  });

  test('verifyAnySessionToken acepta ambas audiencias de sesion conocidas', () => {
    expect(verifyAnySessionToken(signClienteSessionToken(cliente)).tipoUsuario).toBe('CLIENTE');
    expect(verifyAnySessionToken(signAdminSessionToken(admin)).tipoUsuario).toBe('ADMIN');
  });

  test('verifyAnySessionToken rechaza una audiencia desconocida aunque la firma sea valida', () => {
    const tokenOtraAudiencia = jwt.sign(
      { sub: '1', email: cliente.email, tipoUsuario: 'CLIENTE', token_use: 'session' },
      env.JWT_SECRET,
      { algorithm: 'HS256', issuer: env.JWT_ISS, audience: 'otra-audiencia-cualquiera' }
    );
    expectAppError(() => verifyAnySessionToken(tokenOtraAudiencia), 'TOKEN_INVALID');
  });

  test('rechaza tokens firmados con otro secreto', () => {
    const tokenAjeno = jwt.sign(
      { sub: '1', email: cliente.email, tipoUsuario: 'CLIENTE', token_use: 'session' },
      'otro-secreto-cualquiera',
      { algorithm: 'HS256', issuer: env.JWT_ISS, audience: env.JWT_AUD_CLIENTE }
    );
    expectAppError(() => verifyClienteSessionToken(tokenAjeno), 'TOKEN_INVALID');
  });

  test('rechaza tokens con algoritmo "none" (evita bypass de confusion de algoritmo)', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: '2',
        email: admin.email,
        tipoUsuario: 'ADMIN',
        rol: 'SUPERADMIN',
        token_use: 'session',
        iss: env.JWT_ISS,
        aud: env.JWT_AUD_ADMIN
      })
    ).toString('base64url');
    const tokenSinFirma = `${header}.${payload}.`;
    expectAppError(() => verifyAdminSessionToken(tokenSinFirma), 'TOKEN_INVALID');
  });

  test('rechaza tokens sin issuer/audience esperados', () => {
    const tokenSinIssAud = jwt.sign(
      { sub: '1', email: cliente.email, tipoUsuario: 'CLIENTE', token_use: 'session' },
      env.JWT_SECRET,
      { algorithm: 'HS256' }
    );
    expectAppError(() => verifyClienteSessionToken(tokenSinIssAud), 'TOKEN_INVALID');
  });

  test('rechaza un payload manipulado sin tipoUsuario aunque la firma sea valida', () => {
    const tokenSinTipoUsuario = jwt.sign({ sub: '1', email: cliente.email, token_use: 'session' }, env.JWT_SECRET, {
      algorithm: 'HS256',
      issuer: env.JWT_ISS,
      audience: env.JWT_AUD_CLIENTE
    });
    expectAppError(() => verifyClienteSessionToken(tokenSinTipoUsuario), 'TOKEN_INVALID');
  });

  test('rechaza un token ADMIN sin claim de rol', () => {
    const tokenAdminSinRol = jwt.sign(
      { sub: '2', email: admin.email, tipoUsuario: 'ADMIN', token_use: 'session' },
      env.JWT_SECRET,
      { algorithm: 'HS256', issuer: env.JWT_ISS, audience: env.JWT_AUD_ADMIN }
    );
    expectAppError(() => verifyAdminSessionToken(tokenAdminSinRol), 'TOKEN_INVALID');
  });

  test('un token expirado devuelve el codigo TOKEN_EXPIRED (distinto de TOKEN_INVALID)', () => {
    const tokenExpirado = jwt.sign(
      { sub: '1', email: cliente.email, tipoUsuario: 'CLIENTE', token_use: 'session' },
      env.JWT_SECRET,
      { algorithm: 'HS256', issuer: env.JWT_ISS, audience: env.JWT_AUD_CLIENTE, expiresIn: -10 }
    );
    expectAppError(() => verifyClienteSessionToken(tokenExpirado), 'TOKEN_EXPIRED');
  });

  test('un token malformado (no expirado) devuelve TOKEN_INVALID, no TOKEN_EXPIRED', () => {
    expectAppError(() => verifyClienteSessionToken('esto-no-es-un-jwt'), 'TOKEN_INVALID');
  });
});

describe('contrato JWT: token_use mutuamente excluyente (sesion vs pre-MFA)', () => {
  test('un token de sesion (token_use=session) es rechazado por verifyClientePreMfaToken aunque comparta audiencia pre-MFA', () => {
    // Construido a mano con la audiencia pre-MFA pero token_use=session: ni siquiera con
    // audiencia "correcta" para el verificador pre-MFA debe aceptarse, porque token_use no
    // coincide (chequeo doble, ver utils/jwt.js).
    const tokenSesionConAudienciaPreMfa = jwt.sign(
      { sub: '1', email: cliente.email, tipoUsuario: 'CLIENTE', token_use: 'session' },
      env.JWT_SECRET,
      { algorithm: 'HS256', issuer: env.JWT_ISS, audience: env.JWT_AUD_CLIENTE_PRE_MFA }
    );
    expectAppError(() => verifyClientePreMfaToken(tokenSesionConAudienciaPreMfa), 'TOKEN_INVALID');
  });

  test('un token pre-MFA (token_use=pre_mfa) es rechazado por verifyClienteSessionToken aunque comparta audiencia de sesion', () => {
    const tokenPreMfaConAudienciaSesion = jwt.sign(
      { sub: '1', email: cliente.email, tipoUsuario: 'CLIENTE', token_use: 'pre_mfa' },
      env.JWT_SECRET,
      { algorithm: 'HS256', issuer: env.JWT_ISS, audience: env.JWT_AUD_CLIENTE }
    );
    expectAppError(() => verifyClienteSessionToken(tokenPreMfaConAudienciaSesion), 'TOKEN_INVALID');
  });

  test('un token pre-MFA real (audiencia Y token_use correctos) es rechazado por verifyClienteSessionToken', () => {
    const tokenPreMfa = signClientePreMfaToken(cliente);
    expectAppError(() => verifyClienteSessionToken(tokenPreMfa), 'TOKEN_INVALID');
  });

  test('un token de sesion real es rechazado por verifyClientePreMfaToken', () => {
    const tokenSesion = signClienteSessionToken(cliente);
    expectAppError(() => verifyClientePreMfaToken(tokenSesion), 'TOKEN_INVALID');
  });

  test('lo mismo aplica al dominio admin: pre-MFA real rechazado por verifyAdminSessionToken', () => {
    const tokenPreMfa = signAdminPreMfaToken(admin);
    expectAppError(() => verifyAdminSessionToken(tokenPreMfa), 'TOKEN_INVALID');
  });

  test('lo mismo aplica al dominio admin: sesion real rechazada por verifyAdminPreMfaToken', () => {
    const tokenSesion = signAdminSessionToken(admin);
    expectAppError(() => verifyAdminPreMfaToken(tokenSesion), 'TOKEN_INVALID');
  });

  test('verifyAnySessionToken rechaza un token pre-MFA de cualquiera de los dos dominios', () => {
    expectAppError(() => verifyAnySessionToken(signClientePreMfaToken(cliente)), 'TOKEN_INVALID');
    expectAppError(() => verifyAnySessionToken(signAdminPreMfaToken(admin)), 'TOKEN_INVALID');
  });
});

describe('contrato JWT: pre-MFA', () => {
  test('token pre-MFA de cliente incluye token_use=pre_mfa, audiencia pre-MFA, y NO amr/auth_time/rol', () => {
    const token = signClientePreMfaToken(cliente);
    const payload = verifyClientePreMfaToken(token);
    expect(payload.sub).toBe(String(cliente.id));
    expect(payload.tipoUsuario).toBe('CLIENTE');
    expect(payload.token_use).toBe('pre_mfa');
    expect(payload.aud).toBe(env.JWT_AUD_CLIENTE_PRE_MFA);
    expect(payload.amr).toBeUndefined();
    expect(payload.auth_time).toBeUndefined();
    expect(payload.rol).toBeUndefined();
  });

  test('token pre-MFA de admin incluye token_use=pre_mfa, audiencia pre-MFA de admin, y NO rol', () => {
    const token = signAdminPreMfaToken(admin);
    const payload = verifyAdminPreMfaToken(token);
    expect(payload.tipoUsuario).toBe('ADMIN');
    expect(payload.token_use).toBe('pre_mfa');
    expect(payload.aud).toBe(env.JWT_AUD_ADMIN_PRE_MFA);
    expect(payload.rol).toBeUndefined();
  });

  test('un token pre-MFA de cliente es rechazado por verifyAdminPreMfaToken (audiencias separadas)', () => {
    expectAppError(() => verifyAdminPreMfaToken(signClientePreMfaToken(cliente)), 'TOKEN_INVALID');
  });

  test('un token pre-MFA de admin es rechazado por verifyClientePreMfaToken (audiencias separadas)', () => {
    expectAppError(() => verifyClientePreMfaToken(signAdminPreMfaToken(admin)), 'TOKEN_INVALID');
  });
});
