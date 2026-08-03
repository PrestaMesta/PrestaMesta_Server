# Despliegue en Coolify

Este documento describe como configurar Coolify para este servicio. No modifica ningun
recurso de Coolify por si mismo: es la referencia para configurarlo manualmente.

## Build pack

**Dockerfile** (no Nixpacks). Coolify debe detectar y usar el `Dockerfile` en la raiz del
repositorio.

## Puerto interno

La app escucha en `0.0.0.0:${PORT}` (variable de entorno `PORT`, `ENV PORT=3000` por
defecto en la imagen, ver `Dockerfile`/`app.js`). Configura el "Puerto interno del
contenedor" de Coolify con el mismo valor que la variable `PORT` que le inyectes.

## Health check de la aplicacion en Coolify

Configura el health check de Coolify (el que decide si el contenedor recibe trafico) asi:

| Campo | Valor |
|---|---|
| Port | `3000` |
| Path | `/health/ready` |
| Method | `GET` |
| Interval | `15s` |
| Timeout | `5s` |
| Retries | `3` |
| Start period | `20s` (le da tiempo a `connectMongo()`/verificacion de MySQL en el arranque antes de empezar a contar fallos) |

**Por que `/health/ready` y no `/health/live`:** `/health/ready` es el unico de los dos que
confirma que la API puede atender operaciones reales (MySQL y Mongo respondiendo). Si
Coolify usara `/health/live`, enrutaria trafico a una instancia viva pero incapaz de
completar ninguna operacion porque perdio conectividad con las bases.

`/health/ready` esta acotado en el tiempo por diseño: cada verificacion (MySQL, Mongo)
tiene un timeout individual de 2s corriendo en paralelo (`Promise.allSettled`), asi que la
respuesta nunca se queda esperando indefinidamente — en el peor caso responde en ~2s con
`503 { "status": "degraded" }`.

`/health/live` sigue existiendo por separado para el `HEALTHCHECK` de **Docker** (definido
en el `Dockerfile`): ese es un diagnostico de "el proceso Node sigue vivo", pensado para
que Docker pueda reiniciar un contenedor colgado, no para decidir si debe recibir trafico.
No se usan indistintamente: cada uno tiene un consumidor distinto (Coolify vs. el motor de
Docker) y un proposito distinto (listo para trafico vs. proceso vivo).

Ninguno de los dos expone nombres de base de datos, hosts, versiones, credenciales ni
stack traces (solo `{ "status": "ok" | "degraded" }`).

## Variables de entorno

Mismas variables que `.env.example`. En Coolify se configuran en la seccion de
Environment Variables del recurso, **nunca** como build args del Dockerfile (evita que
queden horneadas en capas de la imagen o en su historial).

Variables por entorno que **deben ser distintas** entre test/staging y produccion (nunca
compartir el mismo valor):

- `JWT_SECRET` — un secreto de produccion filtrado en un entorno de pruebas comprometeria
  produccion, y viceversa.
- `MYSQL_*` / `MONGO_URI` — cada entorno apunta a su propia base de datos.

## Conexion a MySQL/Mongo dentro de la red interna de Coolify

Cuando MySQL y MongoDB tambien corren como recursos de Coolify en el mismo proyecto,
usa el hostname interno que Coolify les asigna dentro de su red Docker privada (no una IP
publica ni `localhost`) como `MYSQL_HOST` / dentro de `MONGO_URI`. Verifica el hostname
exacto en la pantalla de cada recurso de base de datos en Coolify; cambia segun como se
llame el servicio, no es un valor fijo que este proyecto pueda asumir de antemano.

## Imagen runtime: que contiene y que NO contiene

El `Dockerfile` es multi-stage: la etapa `deps` corre `npm ci --omit=dev`, y la etapa
`runtime` final solo copia esas `node_modules` (sin devDependencies) mas el codigo fuente
necesario para ejecutar la API (`app.js`, `config/`, `controllers/`, `middleware/`,
`models/`, `repositories/`, `routes/`, `services/`, `utils/`, `validators/`,
`migrations/`, `scripts/`) y `package.json`/`package-lock.json`. La imagen final **no**
contiene ESLint, Jest, Supertest, `@apidevtools/swagger-parser`, `tests/`, `.git`,
`openapi.yaml`, `*.md`, ni ningun archivo `.env*` real (ver `.dockerignore`).

## CMD en formato exec

El `Dockerfile` usa `CMD ["node", "app.js"]` (forma exec, no `CMD node app.js` ni
`sh -c "..."`): Node recibe `SIGTERM`/`SIGINT` directamente como proceso PID 1, en vez de
que una shell intermedia se quede con la senal y Node nunca la reciba.

## Procedimiento para un entorno nuevo

En este orden, sin saltarse pasos:

1. Configurar las variables de entorno (`.env` para local, variables de Coolify para
   despliegue) — incluyendo un `JWT_SECRET` propio de al menos 32 caracteres de alta
   entropia, distinto por entorno.
2. Ejecutar las migraciones manualmente contra la base de **pruebas**: `npm run migrate`
   con `MYSQL_*` apuntando a esa base (el runner valida la version de MySQL/MariaDB antes
   de aplicar nada, ver `scripts/migrate.js`).
3. Verificar las tablas creadas y el contenido de `schema_migrations` (que las 5
   migraciones quedaron registradas con su checksum).
4. Desplegar la API contra el entorno de pruebas y probarla manualmente (login, catalogo,
   solicitud, aprobacion/rechazo).
5. Ejecutar las migraciones manualmente contra **produccion**, con el mismo comando
   apuntando a las variables `MYSQL_*` de produccion.
6. Desplegar la API de produccion.
7. Crear el primer `SUPERADMIN` mediante el script offline: `npm run seed:superadmin`
   (con `SUPERADMIN_NOMBRE`/`SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD` y, si
   `NODE_ENV=production`, el flag `--confirm-production`).

Las migraciones y el seed **nunca** se ejecutan automaticamente: ni en el `CMD` del
`Dockerfile`, ni en `app.js`, ni en ningun hook de arranque.

## CI / pruebas

Las pruebas de integracion con base de datos real (`tests/integration/`, cuando existan)
exigiran variables `MYSQL_TEST_*` / `MONGO_TEST_URI` explicitas y se negaran a correr si
el nombre de la base no esta marcado como de prueba (mismo criterio que
`tests/env.setup.js` ya aplica a las variables de test actuales). Ningun pipeline de CI
debe apuntar esas variables, ni las normales `MYSQL_*`/`MONGO_URI`, a las bases de datos
de produccion desplegadas en Coolify.

## Cierre ordenado

El proceso maneja `SIGTERM`/`SIGINT`:

1. Deja de aceptar conexiones HTTP nuevas (`server.close()`).
2. Espera a que las solicitudes en curso terminen naturalmente.
3. Cierra el pool de MySQL.
4. Cierra la conexion de Mongoose.
5. Sale con `process.exit(0)`.

Si el paso 2 no termina dentro de 10 segundos (una conexion colgada, una query que nunca
resuelve), un timeout de respaldo fuerza `process.exit(1)` para que el contenedor nunca
quede detenido indefinidamente esperando un cierre "limpio" que no va a llegar. Coolify
envia `SIGTERM` al redesplegar o detener el recurso.

## Checklist posterior al despliegue

Verificar manualmente despues de cada despliegue (no automatizado por este trabajo):

- [ ] `GET /health/live` devuelve `200`.
- [ ] `GET /health/ready` devuelve `200` (confirma MySQL y Mongo alcanzables desde el
      contenedor).
- [ ] El proceso dentro del contenedor corre como el usuario no root `prestamesta`
      (`docker exec <contenedor> whoami`).
- [ ] Las tablas del esquema existen y `schema_migrations` lista las 5 migraciones
      aplicadas.
- [ ] La API esta usando las bases de datos correctas para ese entorno (no las de otro
      entorno).
- [ ] CORS solo permite el/los origen(es) del dashboard configurados en
      `CORS_ORIGINS` (probar con un origen no permitido y confirmar que se rechaza).
- [ ] Las rutas protegidas devuelven `401` sin token.
- [ ] Un token de cliente devuelve `401 TOKEN_INVALID` en una ruta administrativa (y
      viceversa).
- [ ] `POST /admin/auth/register` no existe (404): la creacion publica de administradores
      fue eliminada, solo existe `POST /admin/administradores` protegido.
- [ ] Las respuestas de error no incluyen mensajes de SQL/Mongo, stack traces, ni rutas de
      archivo (forzar un error y revisar el body de la respuesta).
- [ ] El rate limiter identifica la IP real del cliente detras de Coolify/Traefik (no la
      IP interna del proxy) — confirmar que `trust proxy` esta en `1`, no en `true`.
- [ ] Un `SIGTERM` (redeploy/stop) produce en los logs el mensaje de cierre ordenado y el
      proceso termina, no queda colgado.
