-- Probado por controllers/prestamoController.js:
--   INSERT INTO prestamos (cliente_id, credito_id, monto_solicitado, monto_total_a_pagar, saldo_pendiente) VALUES (...)
--   UPDATE prestamos SET estado = ?, fecha_aprobacion = ? WHERE id = ?
-- estado ENUM y DEFAULT 'PENDIENTE' probados: el INSERT no fija estado y la respuesta HTTP
-- de solicitarPrestamo() devuelve "estado": "PENDIENTE"; cambiarEstadoPrestamo() solo
-- escribe 'APROBADO' o 'RECHAZADO'. Los estados futuros (ACTIVO, PAGADO, EN_MORA,
-- CANCELADO) NO se incluyen: no hay codigo que los use ni reglas de pagos definidas
-- (pendiente de decision de producto).
--
-- DECISION EXPLICITA DEL USUARIO (Checkpoint 2, resuelta antes de aplicar migraciones,
-- con las bases todavia vacias): el codigo original solo escribia `fecha_aprobacion`, que
-- quedaba NULL para RECHAZADO -- no habia forma de saber CUANDO se rechazo un prestamo. Se
-- reemplaza por una sola columna `fecha_decision`, aplicable tanto a APROBADO como a
-- RECHAZADO (la decision del administrador ocurre en un unico instante sin importar el
-- resultado). No existe `fecha_aprobacion` en el esquema final.
--
-- FKs con ON DELETE RESTRICT confirmado por el usuario: evita borrar un cliente o un
-- credito del catalogo mientras tenga prestamos asociados. En este sistema no debe existir
-- eliminacion fisica normal de prestamos ni de sus registros financieros; las bajas futuras
-- se manejaran por estados o una estrategia de soft delete disenada aparte, no por DELETE.
-- Indices en cliente_id/credito_id/estado por ser columnas usadas en WHERE en las consultas
-- de listado que consumira el dashboard/app.
-- CHECK constraints de coherencia (confirmados por el usuario, no son reglas comerciales
-- nuevas: solo encapsulan invariantes aritmeticos obvios). Requiere MySQL >= 8.0.16.
--
-- RESUELTO (antes "pendiente de decision"): se agrega `fecha_solicitud`, distinta de
-- `fecha_decision` (que es la fecha de la RESPUESTA del administrador, NULL mientras el
-- prestamo sigue PENDIENTE). Confirmada por el usuario, con las bases todavia vacias.
-- Permite ordenar cronologicamente las solicitudes, medir el tiempo de revision
-- (fecha_decision - fecha_solicitud), y auditar el flujo completo. No se agrega ninguna
-- otra columna especulativa junto con esta.
CREATE TABLE IF NOT EXISTS prestamos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id INT UNSIGNED NOT NULL,
  credito_id INT UNSIGNED NOT NULL,
  monto_solicitado DECIMAL(12, 2) NOT NULL,
  monto_total_a_pagar DECIMAL(12, 2) NOT NULL,
  saldo_pendiente DECIMAL(12, 2) NOT NULL,
  estado ENUM('PENDIENTE', 'APROBADO', 'RECHAZADO') NOT NULL DEFAULT 'PENDIENTE',
  fecha_solicitud TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_decision DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_prestamos_cliente_id (cliente_id),
  KEY idx_prestamos_credito_id (credito_id),
  KEY idx_prestamos_estado (estado),
  CONSTRAINT fk_prestamos_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_prestamos_credito FOREIGN KEY (credito_id) REFERENCES creditos (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_prestamos_monto_solicitado_positivo CHECK (monto_solicitado > 0),
  CONSTRAINT chk_prestamos_total_gte_solicitado CHECK (monto_total_a_pagar >= monto_solicitado),
  CONSTRAINT chk_prestamos_saldo_no_negativo CHECK (saldo_pendiente >= 0),
  CONSTRAINT chk_prestamos_saldo_lte_total CHECK (saldo_pendiente <= monto_total_a_pagar)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
