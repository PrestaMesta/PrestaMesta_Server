const { z } = require('zod');

// Espejo de las CHECK constraints de migrations/003_creditos.sql, aprobadas en
// Checkpoint 1: la validacion de entrada debe rechazar antes de llegar a la base de datos,
// pero la base de datos sigue siendo la ultima linea de defensa (defensa en profundidad).
const crearCreditoSchema = z
  .object({
    nombre: z.string().trim().min(1, 'nombre es obligatorio').max(150),
    monto_minimo: z.coerce.number().positive('monto_minimo debe ser mayor a 0'),
    monto_maximo: z.coerce.number().positive('monto_maximo debe ser mayor a 0'),
    tasa_interes_anual: z.coerce.number().nonnegative('tasa_interes_anual no puede ser negativa'),
    plazo_meses: z.coerce.number().int().positive('plazo_meses debe ser un entero mayor a 0')
  })
  .strict()
  .refine((data) => data.monto_maximo >= data.monto_minimo, {
    message: 'monto_maximo debe ser mayor o igual a monto_minimo',
    path: ['monto_maximo']
  });

const avalSchema = z
  .object({
    nombre: z.string().trim().min(1, 'el nombre del aval es obligatorio').max(150),
    telefono: z.string().trim().min(7).max(20),
    direccion: z.string().trim().max(255).optional(),
    ingreso_mensual: z.coerce.number().nonnegative().optional()
  })
  .strict();

const solicitarPrestamoSchema = z
  .object({
    credito_id: z.coerce.number().int().positive(),
    monto_solicitado: z.coerce.number().positive('monto_solicitado debe ser mayor a 0'),
    aval: avalSchema.optional()
  })
  .strict();

// El motivo es opcional; nunca se acepta un estado libre: solo transiciones terminales
// validas desde PENDIENTE (ver utils/prestamoStateMachine.js).
const cambiarEstadoSchema = z
  .object({
    estado: z.enum(['APROBADO', 'RECHAZADO']),
    motivo: z.string().trim().max(500).optional()
  })
  .strict();

const idParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

module.exports = {
  crearCreditoSchema,
  solicitarPrestamoSchema,
  cambiarEstadoSchema,
  idParamSchema
};
