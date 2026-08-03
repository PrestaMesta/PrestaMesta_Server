// Logger propio minimo (JSON de una linea por evento). Alternativa considerada: pino o
// winston; se elige un logger propio por proporcionalidad al tamano actual de la API (sin
// necesidad de transports/streams/rotacion todavia). Migrar a pino despues es sencillo
// porque el formato ya es JSON estructurado. Nunca debe recibir password/token/secretos en
// `meta`: es responsabilidad de quien llama no pasarlos.
function log(nivel, mensaje, meta = {}) {
  console.log(JSON.stringify({ nivel, mensaje, ...meta, fecha: new Date().toISOString() }));
}

module.exports = {
  info: (mensaje, meta) => log('info', mensaje, meta),
  warn: (mensaje, meta) => log('warn', mensaje, meta),
  error: (mensaje, meta) => log('error', mensaje, meta)
};
