// Limites de dia para los filtros fecha_desde/fecha_hasta de los listados de prestamos
// (repositories/prestamoRepository.js). Ambos limites se interpretan en la zona horaria del
// proceso Node del servidor: esta app no fija `TZ` ni la opcion `timezone` del pool de
// mysql2 (config/db.mysql.js), asi que usa la del sistema/contenedor donde corre — el mismo
// comportamiento ya heredado para como se interpretan fecha_solicitud/fecha_decision hoy.
// No es una zona horaria nueva introducida aqui, solo se documenta explicitamente: fijar
// una zona horaria explicita (ej. `TZ=America/Mexico_City` a nivel de proceso/contenedor)
// queda fuera de este checkpoint.
//
// fecha_desde es inclusiva desde las 00:00:00 de ese dia.
// fecha_hasta incluye todo el dia indicado: se implementa como limite EXCLUSIVO del dia
// siguiente (`< inicioDelDiaSiguiente(fecha_hasta)`), nunca concatenando "23:59:59" (que
// pierde precision de milisegundos/microsegundos frente a un TIMESTAMP).

function partesFecha(fechaStr) {
  const [anio, mes, dia] = fechaStr.split('-').map(Number);
  return { anio, mes, dia };
}

function inicioDelDia(fechaStr) {
  const { anio, mes, dia } = partesFecha(fechaStr);
  return new Date(anio, mes - 1, dia, 0, 0, 0, 0);
}

function inicioDelDiaSiguiente(fechaStr) {
  const { anio, mes, dia } = partesFecha(fechaStr);
  // Date normaliza automaticamente el desbordamiento de dia hacia el mes/anio siguiente
  // (ej. dia 31 de enero + 1 -> 1 de febrero), no hace falta un calculo de calendario propio.
  return new Date(anio, mes - 1, dia + 1, 0, 0, 0, 0);
}

module.exports = { inicioDelDia, inicioDelDiaSiguiente };
