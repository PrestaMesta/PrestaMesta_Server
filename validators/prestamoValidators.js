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

// --- Paginacion y filtros de los listados de prestamos (GET .../prestamos) ---
//
// Los query params llegan siempre como string (o arreglo de strings si el cliente repite
// la misma clave, ej. `?page=1&page=2`). `unico()` rechaza explicitamente esa forma de
// arreglo ANTES de intentar coerción de tipo: sustituye cualquier valor arreglo por NaN, que
// despues falla la validacion de tipo del schema interno sin importar cual sea (numero,
// enum o string con regex) -- asi un parametro repetido siempre termina en
// VALIDATION_ERROR, nunca se usa "el primero" ni "el ultimo" en silencio.
function unico(schemaInterno) {
  return z.preprocess((valor) => (Array.isArray(valor) ? Number.NaN : valor), schemaInterno);
}

const PAGE_DEFAULT = 1;
const LIMIT_DEFAULT = 20;
const LIMIT_MAXIMO = 100;

const paginacionSchema = z
  .object({
    page: unico(z.coerce.number().int().min(1)).default(PAGE_DEFAULT),
    limit: unico(z.coerce.number().int().min(1).max(LIMIT_MAXIMO)).default(LIMIT_DEFAULT)
  })
  .strict();

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// z.string().date() valida el formato pero no rechaza fechas de calendario imposibles como
// "2026-02-30" en todas las versiones; se revalida reconstruyendo la fecha y comparando sus
// componentes contra los originales.
function esFechaCalendarioValida(fechaStr) {
  const [anio, mes, dia] = fechaStr.split('-').map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  return fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia;
}

const fechaQuerySchema = unico(
  z
    .string()
    .regex(FECHA_REGEX, 'Formato esperado YYYY-MM-DD')
    .refine(esFechaCalendarioValida, 'Fecha invalida')
).optional();

const filtrosAdminPrestamoSchema = z
  .object({
    page: unico(z.coerce.number().int().min(1)).default(PAGE_DEFAULT),
    limit: unico(z.coerce.number().int().min(1).max(LIMIT_MAXIMO)).default(LIMIT_DEFAULT),
    estado: unico(z.enum(['PENDIENTE', 'APROBADO', 'RECHAZADO'])).optional(),
    cliente_id: unico(z.coerce.number().int().positive()).optional(),
    credito_id: unico(z.coerce.number().int().positive()).optional(),
    fecha_desde: fechaQuerySchema,
    fecha_hasta: fechaQuerySchema
  })
  .strict()
  .refine(
    (datos) => !datos.fecha_desde || !datos.fecha_hasta || datos.fecha_desde <= datos.fecha_hasta,
    {
      message: 'fecha_desde no puede ser posterior a fecha_hasta',
      path: ['fecha_hasta']
    }
  );

module.exports = {
  crearCreditoSchema,
  solicitarPrestamoSchema,
  cambiarEstadoSchema,
  idParamSchema,
  paginacionSchema,
  filtrosAdminPrestamoSchema
};
