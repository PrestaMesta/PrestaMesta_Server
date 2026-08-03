// Politica minima de password, compartida entre scripts/seed-superadmin.js y los
// validadores Zod (validators/). Linea base tecnica de seguridad, no una regla de negocio
// inventada: coincide con el formato de los ejemplos ya usados en el propio repo (README,
// generador de docs), que combinan mayusculas, minusculas y digitos.
const MIN_LENGTH = 12;

// bcrypt (bcryptjs incluido) solo usa los primeros 72 BYTES de la contrasena; cualquier
// byte extra se ignora silenciosamente. Dos contrasenas distintas que compartan esos
// primeros 72 bytes hashean igual, lo que el usuario nunca esperaria. Por eso se rechaza
// (nunca se trunca ni se normaliza) cualquier contrasena que exceda el limite, medido en
// BYTES (no en caracteres: un caracter multibyte en UTF-8, como acentos o emoji, puede
// ocupar 2-4 bytes y hacer que un password de "72 caracteres" ya exceda el limite real).
const MAX_BYTES = 72;

function checkPasswordStrength(password) {
  const problemas = [];

  if (typeof password !== 'string' || password.length === 0) {
    return { valido: false, problemas: ['debe ser un texto no vacio'] };
  }

  if (password.length < MIN_LENGTH) {
    problemas.push(`debe tener al menos ${MIN_LENGTH} caracteres`);
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_BYTES) {
    problemas.push(`no puede exceder ${MAX_BYTES} bytes (bcrypt trunca silenciosamente mas alla de eso)`);
  }
  if (!/[a-z]/.test(password)) problemas.push('debe incluir una minuscula');
  if (!/[A-Z]/.test(password)) problemas.push('debe incluir una mayuscula');
  if (!/[0-9]/.test(password)) problemas.push('debe incluir un digito');

  return { valido: problemas.length === 0, problemas };
}

module.exports = { checkPasswordStrength, MIN_LENGTH, MAX_BYTES };
