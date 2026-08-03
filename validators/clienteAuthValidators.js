const { z } = require('zod');
const { checkPasswordStrength } = require('../utils/passwordPolicy');

// bcrypt solo usa los primeros 72 BYTES; passwordPolicy.checkPasswordStrength ya rechaza
// (nunca trunca) cualquier password que exceda ese limite medido en bytes, no caracteres.
// La contrasena NUNCA se normaliza (sin trim, sin lowercase, sin ningun cambio): un
// espacio al inicio/final es parte del password que el usuario eligio.
const passwordSchema = z.string().superRefine((password, ctx) => {
  const { valido, problemas } = checkPasswordStrength(password);
  if (!valido) {
    ctx.addIssue({ code: 'custom', message: `Contrasena invalida: ${problemas.join(', ')}` });
  }
});

// email: trim + lowercase antes de buscar/insertar, para que "Juan@Example.com" y
// "juan@example.com" se traten como el mismo correo tanto en la app como en el
// UNIQUE(email) de MySQL. No se aplican transformaciones mas agresivas especificas de
// proveedores (por ejemplo normalizar alias "+" de Gmail).
const emailSchema = z.string().trim().toLowerCase().max(190).pipe(z.email());

const registerSchema = z
  .object({
    nombre: z.string().trim().min(1, 'nombre es obligatorio').max(150),
    email: emailSchema,
    password: passwordSchema,
    telefono: z.string().trim().min(7).max(20).optional()
  })
  .strict();

const loginSchema = z
  .object({
    email: emailSchema,
    // Limite generoso de forma de payload (no la politica de fortaleza: eso solo aplica
    // al crear/cambiar un password, no al compararlo contra un hash ya existente).
    password: z.string().min(1, 'password es obligatorio').max(200)
  })
  .strict();

module.exports = { registerSchema, loginSchema };
