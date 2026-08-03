-- Probado por controllers/prestamoController.js:
--   INSERT INTO avales (prestamo_id, nombre, telefono, direccion, ingreso_mensual) VALUES (...)
-- ingreso_mensual DEFAULT 0 probado (`aval.ingreso_mensual || 0`).
-- ON DELETE RESTRICT confirmado por el usuario: aunque el aval es un sub-registro
-- dependiente del prestamo, en este sistema no debe existir eliminacion fisica normal de
-- prestamos ni de sus registros financieros asociados (el aval es un registro financiero).
-- Las bajas futuras se manejaran por estados o soft delete, nunca por DELETE en cascada.
CREATE TABLE IF NOT EXISTS avales (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  prestamo_id INT UNSIGNED NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  telefono VARCHAR(20) NOT NULL,
  direccion VARCHAR(255) NULL,
  ingreso_mensual DECIMAL(12, 2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_avales_prestamo_id (prestamo_id),
  CONSTRAINT fk_avales_prestamo FOREIGN KEY (prestamo_id) REFERENCES prestamos (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_avales_ingreso_no_negativo CHECK (ingreso_mensual >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
