-- Probado por controllers/adminAuthController.js:
--   SELECT id FROM administradores WHERE email = ?
--   INSERT INTO administradores (nombre, email, password, rol) VALUES (?, ?, ?, ?)
--   SELECT * FROM administradores WHERE email = ? AND activo = TRUE
-- rol ENUM probado: rolesValidos = ['SUPERADMIN','ANALISTA','COBRADOR'].
-- Decision explicita del usuario: rol es NOT NULL SIN DEFAULT. El controlador actual tiene
-- un fallback silencioso a 'ANALISTA' cuando el rol enviado no es valido; ese fallback se
-- elimina en el Checkpoint 2 (validacion Zod exige rol explicito y valido, sin excepciones)
-- para que ninguna omision otorgue permisos administrativos por accidente.
-- activo: la query de login exige activo = TRUE; el INSERT no lo establece explicitamente,
-- por lo que DEFAULT TRUE es requerido por correccion (si no, ningun admin recien creado
-- podria iniciar sesion, lo que contradice el comportamiento actual del controlador).
CREATE TABLE IF NOT EXISTS administradores (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password VARCHAR(255) NOT NULL,
  rol ENUM('SUPERADMIN', 'ANALISTA', 'COBRADOR') NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_administradores_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
