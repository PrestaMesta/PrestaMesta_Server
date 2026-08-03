const { z } = require('zod');
const { checkPasswordStrength } = require('../utils/passwordPolicy');

const passwordSchema = z.string().superRefine((password, ctx) => {
  const { valido, problemas } = checkPasswordStrength(password);
  if (!valido) {
    ctx.addIssue({ code: 'custom', message: `Contrasena invalida: ${problemas.join(', ')}` });
  }
});

const emailSchema = z.string().trim().toLowerCase().max(190).pipe(z.email());

// rol es obligatorio y sin valor por defecto (Checkpoint 1): el fallback silencioso a
// 'ANALISTA' del controlador original se elimina, ninguna omision debe otorgar permisos
// administrativos.
const rolSchema = z.enum(['SUPERADMIN', 'ANALISTA', 'COBRADOR'], {
  message: 'rol debe ser SUPERADMIN, ANALISTA o COBRADOR'
});

// Usado por POST /api/v1/admin/administradores (no por /admin/auth/*: crear
// administradores dejo de ser una operacion de autenticacion publica).
const crearAdministradorSchema = z
  .object({
    nombre: z.string().trim().min(1, 'nombre es obligatorio').max(150),
    email: emailSchema,
    password: passwordSchema,
    rol: rolSchema
  })
  .strict();

const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1, 'password es obligatorio').max(200)
  })
  .strict();

module.exports = { crearAdministradorSchema, loginSchema, rolSchema };
