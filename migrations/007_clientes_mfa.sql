-- Checkpoint 6B-1 (docs/mfa-identidad-ine.md, seccion 4): estado de enrolamiento TOTP de un
-- cliente. Estados: NO_ENROLADO (default, ninguna fila -> se trata como NO_ENROLADO),
-- PENDIENTE_CONFIRMACION (secreto generado, primer codigo aun no confirmado), ACTIVO,
-- DESHABILITADO (reset administrativo, obliga a re-enrolar).
--
-- DIFERENCIA respecto al documento de diseño original (Checkpoint 6B-1, pedido explicito
-- del usuario): la seccion 4 del documento proponia UNA columna `totp_secret_cifrado`
-- guardando nonce||ciphertext||tag concatenados. Este checkpoint pide guardarlos por
-- separado, asi que aqui son tres columnas: totp_secret_ciphertext, totp_secret_nonce,
-- totp_secret_tag. El CHECK de abajo mantiene la invariante de que las tres siempre estan
-- las tres presentes o las tres ausentes a la vez (nunca una fila con cifrado a medias).
--
-- Cifrado autenticado (AES-256-GCM, ver utils/mfaCrypto.js): nonce SIEMPRE de 12 bytes
-- (96 bits, tamano recomendado para GCM) y tag SIEMPRE de 16 bytes (128 bits, tamano de tag
-- por defecto de GCM) -- por eso son BINARY de longitud fija, no VARBINARY. La CLAVE de
-- cifrado (MFA_ENCRYPTION_KEY_BASE64, ver config/env.js) nunca vive en esta base de datos.
--
-- totp_ultimo_timestep_usado: anti-replay por INDICE DE PASO RFC 6238
-- (floor(unix_time/30)), no por marca de tiempo de "ultima vez" -- ver utils/totp.js y
-- docs/mfa-identidad-ine.md seccion 3.3 para la justificacion completa. Se actualiza con un
-- UPDATE condicional atomico (repositories/clienteMfaRepository.js#marcarTimestepUsado),
-- mismo patron de defensa por fila que ya usa prestamos.estado.
--
-- intentos_fallidos/bloqueado_hasta: bloqueo temporal por fuerza bruta, capa independiente
-- del rate limiting HTTP (que se agrega en middleware/, no en la BD).
--
-- ON DELETE CASCADE (a diferencia de RESTRICT en prestamos/avales): un secreto MFA no tiene
-- valor independiente del cliente al que pertenece: si algun proceso futuro llega a borrar
-- fisicamente un cliente, dejar secretos huerfanos seria en si mismo un problema de
-- privacidad. Ver docs/mfa-identidad-ine.md seccion 4 para el contraste explicito con el
-- criterio RESTRICT usado en prestamos.
CREATE TABLE IF NOT EXISTS clientes_mfa (
  cliente_id INT UNSIGNED NOT NULL,
  estado ENUM('NO_ENROLADO', 'PENDIENTE_CONFIRMACION', 'ACTIVO', 'DESHABILITADO')
    NOT NULL DEFAULT 'NO_ENROLADO',
  totp_secret_ciphertext VARBINARY(64) NULL,
  totp_secret_nonce BINARY(12) NULL,
  totp_secret_tag BINARY(16) NULL,
  totp_activado_en DATETIME NULL,
  totp_ultimo_timestep_usado BIGINT UNSIGNED NULL,
  intentos_fallidos SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  bloqueado_hasta DATETIME NULL,
  PRIMARY KEY (cliente_id),
  CONSTRAINT fk_clientes_mfa_cliente FOREIGN KEY (cliente_id)
    REFERENCES clientes (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_clientes_mfa_secreto_completo CHECK (
    (totp_secret_ciphertext IS NULL AND totp_secret_nonce IS NULL AND totp_secret_tag IS NULL)
    OR
    (totp_secret_ciphertext IS NOT NULL AND totp_secret_nonce IS NOT NULL AND totp_secret_tag IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
