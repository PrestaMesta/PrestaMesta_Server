-- Checkpoint 6B-1 (docs/mfa-identidad-ine.md, seccion 4): codigos de recuperacion de un
-- cliente, uno por fila. Se guarda unicamente el HASH (bcrypt, mismo tratamiento que
-- clientes.password) -- el valor en claro solo existe en la respuesta HTTP del momento en
-- que se generan (ver services/mfaService.js#confirmarEnrolamiento), nunca se persiste.
--
-- usado_en NULL = no consumido. Un codigo es de un solo uso: se marca con un UPDATE
-- condicional atomico (`WHERE id = ? AND usado_en IS NULL`,
-- repositories/clienteMfaRepository.js#consumirCodigoRecuperacion) para que dos intentos
-- concurrentes de consumir el MISMO codigo solo dejen pasar a uno.
--
-- ON DELETE CASCADE: mismo criterio que clientes_mfa (seccion 4 del documento de diseño) --
-- un codigo de recuperacion no tiene valor independiente del cliente al que pertenece.
CREATE TABLE IF NOT EXISTS clientes_mfa_codigos_recuperacion (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id INT UNSIGNED NOT NULL,
  codigo_hash VARCHAR(255) NOT NULL,
  usado_en DATETIME NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_clientes_mfa_codigos_cliente_id (cliente_id),
  CONSTRAINT fk_clientes_mfa_codigos_cliente FOREIGN KEY (cliente_id)
    REFERENCES clientes (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
