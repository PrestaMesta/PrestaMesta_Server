const { z } = require('zod');

// POST .../mfa/enroll: sin body (el usuario sale del token pre-MFA/sesion, nunca de aqui).
// `.optional()` porque un cliente que no manda body en absoluto (sin Content-Type) deja
// req.body en `undefined`, no en `{}` -- express.json() solo puebla req.body cuando hay un
// body que parsear. `.strict()` en el objeto interno igual rechaza cualquier propiedad
// inesperada si el cliente SI manda un body.
const enrollSchema = z.object({}).strict().optional();

const codigoTotpSchema = z
  .string()
  .regex(/^\d{6}$/, 'codigo debe ser un TOTP de 6 digitos');

// POST .../mfa/enroll/confirm: unicamente el primer codigo TOTP (nunca un codigo de
// recuperacion -- todavia no existen codigos de recuperacion antes de confirmar).
const enrollConfirmSchema = z
  .object({
    codigo: codigoTotpSchema
  })
  .strict();

// POST .../mfa/verify: exactamente uno de los dos, nunca ambos ni ninguno (mismo patron que
// ya usa validators/prestamoValidators.js#filtrosAdminPrestamoSchema para exigir
// combinaciones exactas de campos opcionales via `.refine`).
const mfaVerifySchema = z
  .object({
    codigo: codigoTotpSchema.optional(),
    codigoRecuperacion: z.string().trim().min(1).max(64).optional()
  })
  .strict()
  .refine((datos) => Boolean(datos.codigo) !== Boolean(datos.codigoRecuperacion), {
    message: 'Envia exactamente uno: codigo o codigoRecuperacion.',
    path: ['codigo']
  });

module.exports = { enrollSchema, enrollConfirmSchema, mfaVerifySchema };
