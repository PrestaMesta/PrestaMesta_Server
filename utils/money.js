const Decimal = require('decimal.js');

// Formula de negocio EXISTENTE en prestamoController.js, preservada tal cual (interes
// simple anual, prorrateado linealmente por el plazo en meses, sin capitalizacion,
// aplicado una sola vez sobre el monto solicitado). No es un modelo financiero universal,
// es la regla que el codigo actual ya implementa; se documenta, no se inventa.
//
// Unico cambio tecnico: la aritmetica se hace con decimal.js en vez de Number nativo, y el
// resultado se redondea explicitamente a 2 decimales (ROUND_HALF_UP) antes de persistir,
// para no depender de floats sin control en un valor monetario autoritativo. Moneda: no
// especificada en ningun lugar del codigo actual (se asume MXN por contexto: formato de
// telefono mexicano, nombre "Prestamesta" — supuesto no confirmado, pendiente).
function calcularMontoTotalAPagar({ montoSolicitado, tasaInteresAnual, plazoMeses }) {
  const monto = new Decimal(montoSolicitado);
  const tasaDecimal = new Decimal(tasaInteresAnual).dividedBy(100);
  const interesGenerado = monto.times(tasaDecimal).times(new Decimal(plazoMeses).dividedBy(12));
  const total = monto.plus(interesGenerado);
  return total.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

module.exports = { calcularMontoTotalAPagar };
