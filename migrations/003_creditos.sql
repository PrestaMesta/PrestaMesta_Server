-- Probado por controllers/prestamoController.js:
--   INSERT INTO creditos (nombre, monto_minimo, monto_maximo, tasa_interes_anual, plazo_meses) VALUES (...)
--   SELECT * FROM creditos
-- creado_en probado por el JSON de ejemplo en documents/generar_documentacion.js
-- ("creado_en": "2026-08-02T02:43:54.000Z").
-- Dinero en DECIMAL(12,2), nunca FLOAT, segun lo pedido explicitamente.
-- CHECK constraints de coherencia (requeridos por el usuario, no son reglas comerciales
-- nuevas: solo encapsulan en la BD invariantes aritmeticos obvios sobre el catalogo).
-- Requiere MySQL >= 8.0.16 para que los CHECK se apliquen (no solo se acepten y se
-- ignoren). scripts/migrate.js verifica la version antes de aplicar esta migracion.
CREATE TABLE IF NOT EXISTS creditos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(150) NOT NULL,
  monto_minimo DECIMAL(12, 2) NOT NULL,
  monto_maximo DECIMAL(12, 2) NOT NULL,
  tasa_interes_anual DECIMAL(5, 2) NOT NULL,
  plazo_meses SMALLINT UNSIGNED NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_creditos_monto_minimo_positivo CHECK (monto_minimo > 0),
  CONSTRAINT chk_creditos_monto_maximo_gte_minimo CHECK (monto_maximo >= monto_minimo),
  CONSTRAINT chk_creditos_tasa_no_negativa CHECK (tasa_interes_anual >= 0),
  CONSTRAINT chk_creditos_plazo_positivo CHECK (plazo_meses > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
