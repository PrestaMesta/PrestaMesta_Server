-- Checkpoint 6B-1: mismo shape que clientes_mfa_codigos_recuperacion
-- (008_clientes_mfa_codigos_recuperacion.sql) para el dominio de administradores. No se
-- repite el razonamiento completo aqui.
CREATE TABLE IF NOT EXISTS administradores_mfa_codigos_recuperacion (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  administrador_id INT UNSIGNED NOT NULL,
  codigo_hash VARCHAR(255) NOT NULL,
  usado_en DATETIME NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_administradores_mfa_codigos_administrador_id (administrador_id),
  CONSTRAINT fk_administradores_mfa_codigos_administrador FOREIGN KEY (administrador_id)
    REFERENCES administradores (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
