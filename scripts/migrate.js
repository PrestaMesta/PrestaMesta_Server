// Runner de migraciones propio y minimalista. Alternativa considerada: una libreria como
// db-migrate. Se elige un runner propio por proporcionalidad al tamano del proyecto y
// porque ya existe el driver mysql2 en el proyecto; desventaja: menos features que una
// libreria madura (por ejemplo, no genera rollbacks automaticos). Un rollback es un
// archivo de migracion nuevo escrito a mano, nunca una accion automatica que borre datos.
//
// Este script NUNCA se invoca desde el arranque normal de la app (start/dev). Se corre
// explicitamente con `npm run migrate`, apuntando primero a una base de datos de prueba.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const env = require('../config/env');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const LOCK_NAME = 'prestamesta_migrations';
const LOCK_TIMEOUT_SECONDS = 10;

function readMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort(); // orden deterministico: los archivos usan prefijo numerico (001_, 002_, ...)
}

function checksumOf(sql) {
  return crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
}

// Las migraciones 003+ usan CHECK constraints. MySQL solo los ENFORCEA (no solo los
// acepta y los ignora) desde 8.0.16; MariaDB los soporta desde 10.2.1 pero con un
// historial de inconsistencias mas amplio, asi que se pide confirmacion manual con
// SELECT VERSION() antes de migrar un entorno nuevo, y este preflight solo bloquea casos
// claramente insuficientes o no reconocidos.
async function verifyCheckConstraintSupport(connection) {
  const [rows] = await connection.query('SELECT VERSION() AS version');
  const version = rows[0].version;
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);

  if (!match) {
    throw new Error(
      `No se pudo interpretar la version del servidor ("${version}"). ` +
        'Verifica manualmente con SELECT VERSION(); que soporte CHECK constraints antes de migrar.'
    );
  }

  const [, major, minor, patch] = match.map(Number);
  const esMariaDB = /mariadb/i.test(version);

  if (esMariaDB) {
    const soportado = major > 10 || (major === 10 && (minor > 2 || (minor === 2 && patch >= 1)));
    if (!soportado) {
      throw new Error(
        `MariaDB ${version} no soporta CHECK constraints (requiere >= 10.2.1). No se aplican migraciones.`
      );
    }
    console.warn(
      `Advertencia: servidor MariaDB (${version}). La aplicacion de CHECK constraints en MariaDB ha tenido ` +
        'inconsistencias historicas entre versiones; confirma manualmente con SELECT VERSION(); y pruebas ' +
        'dirigidas antes de confiar en estas restricciones en produccion.'
    );
    return;
  }

  const soportado = major > 8 || (major === 8 && (minor > 0 || patch >= 16));
  if (!soportado) {
    throw new Error(
      `MySQL ${version} no aplica (enforce) CHECK constraints (requiere >= 8.0.16). ` +
        'Actualiza el servidor de base de datos antes de aplicar estas migraciones.'
    );
  }
}

async function ensureMigrationsTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(255) NOT NULL,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

async function acquireLock(connection) {
  const [rows] = await connection.query('SELECT GET_LOCK(?, ?) AS locked', [
    LOCK_NAME,
    LOCK_TIMEOUT_SECONDS
  ]);
  if (rows[0].locked !== 1) {
    throw new Error(
      `No se pudo obtener el lock de migraciones ("${LOCK_NAME}") tras ${LOCK_TIMEOUT_SECONDS}s. ` +
        'Es probable que otra instancia este migrando al mismo tiempo.'
    );
  }
}

async function releaseLock(connection) {
  await connection.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
}

async function run() {
  if (env.NODE_ENV === 'production' && !process.argv.includes('--yes')) {
    console.error(
      `NODE_ENV=production detectado. Objetivo: ${env.MYSQL_HOST}:${env.MYSQL_PORT}/${env.MYSQL_DATABASE} ` +
        '(host y nombre de BD mostrados a proposito, nunca credenciales). ' +
        'Vuelve a correr con --yes si realmente quieres migrar produccion.'
    );
    process.exit(1);
  }

  const connection = await mysql.createConnection({
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    database: env.MYSQL_DATABASE,
    multipleStatements: true
  });

  try {
    await acquireLock(connection);
    await verifyCheckConstraintSupport(connection);
    await ensureMigrationsTable(connection);

    const [appliedRows] = await connection.query('SELECT id, checksum FROM schema_migrations');
    const applied = new Map(appliedRows.map((row) => [row.id, row.checksum]));

    const files = readMigrationFiles();

    for (const file of files) {
      const fullPath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(fullPath, 'utf8');
      const checksum = checksumOf(sql);

      if (applied.has(file)) {
        if (applied.get(file) !== checksum) {
          throw new Error(
            `La migracion "${file}" ya fue aplicada pero su contenido cambio despues ` +
              '(checksum no coincide). No se continua: revisa el archivo o crea una migracion nueva.'
          );
        }
        continue; // ya aplicada, sin cambios
      }

      console.log(`Aplicando migracion: ${file}`);
      await connection.beginTransaction();
      try {
        await connection.query(sql);
        await connection.query(
          'INSERT INTO schema_migrations (id, checksum) VALUES (?, ?)',
          [file, checksum]
        );
        await connection.commit();
        console.log(`OK: ${file}`);
      } catch (error) {
        await connection.rollback();
        console.error(`Fallo aplicando "${file}". Se detiene la migracion, no se continua con las siguientes.`);
        throw error;
      }
    }

    console.log('Migraciones al dia.');
  } finally {
    await releaseLock(connection).catch(() => {});
    await connection.end();
  }
}

run().catch((error) => {
  console.error(`Error en el runner de migraciones: ${error.message}`);
  process.exit(1);
});
