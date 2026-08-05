-- Checkpoint 6B-1: mismo shape que clientes_mfa (007_clientes_mfa.sql) para el dominio de
-- administradores -- MFA es obligatorio para ambos dominios por igual
-- (docs/mfa-identidad-ine.md, seccion 0), incluido el SUPERADMIN sembrado por
-- scripts/seed-superadmin.js (que sigue sin tocarse: no escribe en esta tabla, por lo que
-- su primer login cae en NO_ENROLADO como cualquier administrador nuevo). No se repite el
-- razonamiento completo de cada columna aqui, ver 007_clientes_mfa.sql.
CREATE TABLE IF NOT EXISTS administradores_mfa (
  administrador_id INT UNSIGNED NOT NULL,
  estado ENUM('NO_ENROLADO', 'PENDIENTE_CONFIRMACION', 'ACTIVO', 'DESHABILITADO')
    NOT NULL DEFAULT 'NO_ENROLADO',
  totp_secret_ciphertext VARBINARY(64) NULL,
  totp_secret_nonce BINARY(12) NULL,
  totp_secret_tag BINARY(16) NULL,
  totp_activado_en DATETIME NULL,
  totp_ultimo_timestep_usado BIGINT UNSIGNED NULL,
  intentos_fallidos SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  bloqueado_hasta DATETIME NULL,
  PRIMARY KEY (administrador_id),
  CONSTRAINT fk_administradores_mfa_administrador FOREIGN KEY (administrador_id)
    REFERENCES administradores (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_administradores_mfa_secreto_completo CHECK (
    (totp_secret_ciphertext IS NULL AND totp_secret_nonce IS NULL AND totp_secret_tag IS NULL)
    OR
    (totp_secret_ciphertext IS NOT NULL AND totp_secret_nonce IS NOT NULL AND totp_secret_tag IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
