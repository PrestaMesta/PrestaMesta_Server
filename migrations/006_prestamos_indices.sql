-- Indices de soporte para los listados nuevos de prestamos
-- (GET /client/prestamos, GET /admin/prestamos). No modifica migrations/004_prestamos.sql
-- (ya aplicada); esta es una migracion nueva, solo de indices, sobre la tabla existente.
--
-- Revision de indices ya existentes antes de escribir esto (004_prestamos.sql,
-- 005_avales.sql):
--   prestamos:  PRIMARY KEY (id), idx_prestamos_cliente_id (cliente_id),
--               idx_prestamos_credito_id (credito_id), idx_prestamos_estado (estado)
--   avales:     PRIMARY KEY (id), idx_avales_prestamo_id (prestamo_id)
--   clientes:   PRIMARY KEY (id), uq_clientes_email (email)
--
-- Ninguno de los indices de una sola columna en `prestamos` cubre el patron real de los
-- listados nuevos, que siempre filtran + ordenan por (fecha_solicitud DESC, id DESC):
--   - Listado de cliente: WHERE cliente_id = ?           ORDER BY fecha_solicitud DESC, id DESC
--   - Listado admin (filtro estado): WHERE estado = ?    ORDER BY fecha_solicitud DESC, id DESC
-- Un indice compuesto (columna_filtro, fecha_solicitud, id) resuelve el WHERE y el ORDER BY
-- con el mismo indice, sin filesort.
--
-- credito_id: idx_prestamos_credito_id ya cubre las consultas por credito_id (igualdad
-- simple); en este checkpoint el filtro por credito_id no se combina con el orden por
-- fecha_solicitud lo suficientemente seguido como para justificar un compuesto nuevo. Se
-- confirma como suficiente, sin cambios.
--
-- Detalle por id + cliente_id (GET /client/prestamos/:id, WHERE id = ? AND cliente_id = ?):
-- no necesita indice nuevo. `id` ya es PRIMARY KEY (unico); MySQL localiza la fila por PK y
-- evalua cliente_id sobre esa unica fila. Un indice compuesto (id, cliente_id) seria
-- redundante con la PK (el primer componente ya es unico por si solo).
--
-- idx_prestamos_cliente_id e idx_prestamos_estado quedan redundantes una vez agregados los
-- compuestos de abajo: el prefijo izquierdo de un indice compuesto (cliente_id, ...) o
-- (estado, ...) ya resuelve cualquier busqueda de igualdad que antes resolvia el indice de
-- una sola columna. Se eliminan para no pagar el costo de escritura/espacio de un indice
-- que ya no aporta nada (pedido explicito: no dejar indices redundantes).
ALTER TABLE prestamos
  DROP INDEX idx_prestamos_cliente_id,
  DROP INDEX idx_prestamos_estado,
  ADD INDEX idx_prestamos_cliente_fecha_id (cliente_id, fecha_solicitud, id),
  ADD INDEX idx_prestamos_estado_fecha_id (estado, fecha_solicitud, id);
