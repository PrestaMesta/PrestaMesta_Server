// Proceso offline para crear el primer SUPERADMIN. No es un endpoint HTTP: la unica forma
// de crear el primer administrador es corriendo este script manualmente, con acceso directo
// a la base de datos. Una vez que existe al menos un SUPERADMIN, los siguientes
// administradores se crean por la API autenticada (POST /admin/auth/register, protegido con
// autorizarRoles('SUPERADMIN') a partir del Checkpoint 2).
//
// Variables de entorno requeridas (ademas de las de config/env.js):
//   SUPERADMIN_NOMBRE
//   SUPERADMIN_EMAIL
//   SUPERADMIN_PASSWORD
// En NODE_ENV=production ademas se exige --confirm-production como argumento.
//
// Garantias:
//   - Idempotente: si ya existe un administrador con ese email, no se modifica nada.
//   - Nunca imprime el password (ni el hash) en la salida.
//   - Nunca sobreescribe un administrador existente.
//   - Indica el host/BD destino (nunca credenciales) antes de escribir.

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { checkPasswordStrength } = require('../utils/passwordPolicy');

async function run() {
  const nombre = process.env.SUPERADMIN_NOMBRE;
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;

  if (!nombre || !email || !password) {
    console.error(
      'Faltan variables de entorno. Se requieren: SUPERADMIN_NOMBRE, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD.'
    );
    process.exit(1);
  }

  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailValido) {
    console.error('SUPERADMIN_EMAIL no tiene un formato de correo valido.');
    process.exit(1);
  }

  const { valido, problemas } = checkPasswordStrength(password);
  if (!valido) {
    console.error(`SUPERADMIN_PASSWORD no cumple la politica minima: ${problemas.join(', ')}.`);
    process.exit(1);
  }

  if (env.NODE_ENV === 'production' && !process.argv.includes('--confirm-production')) {
    console.error(
      `NODE_ENV=production detectado. Objetivo: ${env.MYSQL_HOST}:${env.MYSQL_PORT}/${env.MYSQL_DATABASE} ` +
        '(host y nombre de BD mostrados a proposito, nunca credenciales). ' +
        'Vuelve a correr con --confirm-production si realmente quieres crear un SUPERADMIN en produccion.'
    );
    process.exit(1);
  }

  console.log(`Conectando a ${env.MYSQL_HOST}:${env.MYSQL_PORT}/${env.MYSQL_DATABASE}...`);

  const connection = await mysql.createConnection({
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    database: env.MYSQL_DATABASE
  });

  try {
    const [existentes] = await connection.query(
      'SELECT id FROM administradores WHERE email = ?',
      [email]
    );

    if (existentes.length > 0) {
      console.log(
        `Ya existe un administrador con ese email (id=${existentes[0].id}). No se realiza ningun cambio.`
      );
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const [result] = await connection.query(
      'INSERT INTO administradores (nombre, email, password, rol, activo) VALUES (?, ?, ?, ?, ?)',
      [nombre, email, hashedPassword, 'SUPERADMIN', true]
    );

    console.log(`SUPERADMIN creado correctamente (id=${result.insertId}, email=${email}).`);
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(`Error creando el SUPERADMIN inicial: ${error.message}`);
  process.exit(1);
});
