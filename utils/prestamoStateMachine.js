// Maquina de estados del prestamo (Fase 9, diseño aprobado en Checkpoint 1: solo los
// estados que el codigo actual realmente usa). PENDIENTE es el unico estado no terminal;
// APROBADO y RECHAZADO son terminales, ninguna transicion sale de ellos.
//
// PENDIENTE DE DECISION DE PRODUCTO (no implementado, fuera de alcance de esta
// estabilizacion): ACTIVO, PAGADO/LIQUIDADO, EN_MORA, CANCELADO. No existen en el codigo
// actual, no hay endpoint de pagos (HistorialPago en Mongo esta definido pero no
// conectado), y no hay reglas de mora/pagos parciales/anticipados definidas en ningun
// lugar del repositorio. Se documentan aqui para que el siguiente incremento del dominio
// de prestamos tenga un punto de partida, no para pretender que estan implementados.
const ESTADOS = Object.freeze({
  PENDIENTE: 'PENDIENTE',
  APROBADO: 'APROBADO',
  RECHAZADO: 'RECHAZADO'
});

const ESTADOS_TERMINALES = [ESTADOS.APROBADO, ESTADOS.RECHAZADO];

const TRANSICIONES_VALIDAS = {
  [ESTADOS.PENDIENTE]: [ESTADOS.APROBADO, ESTADOS.RECHAZADO]
};

function puedeTransicionar(estadoActual, estadoNuevo) {
  const permitidos = TRANSICIONES_VALIDAS[estadoActual] || [];
  return permitidos.includes(estadoNuevo);
}

// Nota de diseño: esta funcion es una comprobacion previa (mejor mensaje de error, falla
// rapido antes de tocar la base de datos). La garantia real contra condiciones de carrera
// (dos administradores aprobando el mismo prestamo a la vez) es el UPDATE condicional
// atomico en el repositorio: `UPDATE prestamos SET estado = ? WHERE id = ? AND estado =
// 'PENDIENTE'` dentro de una transaccion; si affectedRows === 0, ya no estaba PENDIENTE y
// el servicio responde 409, sin importar lo que haya dicho esta funcion.
module.exports = { ESTADOS, ESTADOS_TERMINALES, TRANSICIONES_VALIDAS, puedeTransicionar };
