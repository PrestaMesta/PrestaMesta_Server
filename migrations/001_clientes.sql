-- Probado por controllers/authController.js:
--   SELECT id FROM clientes WHERE email = ?
--   INSERT INTO clientes (nombre, email, password, telefono) VALUES (?, ?, ?, ?)
--   SELECT * FROM clientes WHERE email = ?
-- UNIQUE(email) es requerido por correccion: el controlador ya verifica duplicados en la
-- aplicacion antes de insertar, pero sin la restriccion en BD dos registros concurrentes
-- con el mismo email podrian pasar la verificacion a la vez (condicion de carrera).
CREATE TABLE IF NOT EXISTS clientes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password VARCHAR(255) NOT NULL,
  telefono VARCHAR(20) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_clientes_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
