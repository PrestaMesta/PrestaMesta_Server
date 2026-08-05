## Prestamesta Server

Backend de Prestamesta: Express + MySQL (datos transaccionales) + MongoDB (auditoria).
Ver `CLAUDE.md` para arquitectura interna y comandos de desarrollo. El contrato completo
de la API vive en `openapi.yaml` (validalo con `npm run docs:validate`): 18 endpoints
versionados bajo `/api/v1` (autenticacion + MFA de cliente y admin, alta de
administradores, catalogo de creditos, solicitud/aprobacion/consulta de prestamos) mas
`/health/live` y `/health/ready`, sin versionar.

### Requisitos locales

MongoDB en Docker:

```
docker run -d --name mongo-prestamesta -p 27017:27017 mongo
```

MySQL corriendo aparte, con el esquema aplicado desde `migrations/` (`npm run migrate`,
nunca automatico en el arranque de la app). La ultima migracion, `006_prestamos_indices.sql`,
agrega los indices compuestos que usan los endpoints de consulta de prestamos (ver mas
abajo); sin ella los endpoints funcionan igual, solo sin el indice optimo para el
`ORDER BY`/filtro. Copia `.env.example` a `.env` y completa las variables (`JWT_SECRET`
propio, no reutilizado entre entornos).

Roles de administrador: `SUPERADMIN`, `ANALISTA`, `COBRADOR`.

### Autenticacion y MFA

Cliente y administrador son dos dominios de identidad separados, con tokens JWT de
audiencias distintas: un token de cliente nunca es aceptado en una ruta administrativa, y
viceversa.

**MFA (TOTP) es obligatorio para ambos dominios (Checkpoint 6B-2) — cambio de contrato
incompatible hacia atras.** `POST .../auth/login` ya NO devuelve un token de sesion
utilizable de inmediato: devuelve un `preMfaToken` de vida corta (5 min por defecto) y
`siguientePaso`, que indica el paso siguiente:

**Login cliente** (`POST http://localhost:3000/api/v1/client/auth/login`)
```json
{ "email": "juan@example.com", "password": "miPasswordSeguro123" }
```
```json
{
  "mensaje": "Completa el enrolamiento de MFA para continuar.",
  "preMfaToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "siguientePaso": "MFA_ENROLLMENT_REQUIRED",
  "mfaEstado": "NO_ENROLADO"
}
```
(`siguientePaso: "MFA_CHALLENGE_REQUIRED"` si el MFA ya estaba activo — ver mas abajo. El
`preMfaToken` **no funciona en ninguna otra ruta**, solo en las tres de abajo.)

**Si `MFA_ENROLLMENT_REQUIRED`** (primera vez): iniciar enrolamiento con el `preMfaToken`
(`Authorization: Bearer <preMfaToken>`):

`POST http://localhost:3000/api/v1/client/auth/mfa/enroll` (sin body) devuelve
`{ secreto, otpauthUri }` — muestra `otpauthUri` como QR (Google Authenticator/Authy/etc.),
o `secreto` como respaldo manual. Ninguno de los dos se puede volver a recuperar despues.

`POST http://localhost:3000/api/v1/client/auth/mfa/enroll/confirm` con el primer codigo de
6 digitos generado por la app:
```json
{ "codigo": "123456" }
```
Activa el MFA, devuelve **10 codigos de recuperacion en claro (una unica vez, guardarlos)**
y ya el token de sesion completo:
```json
{ "mensaje": "MFA activado exitosamente...", "token": "eyJ...", "codigosRecuperacion": ["A1B2-C3D4-E5F6-0708-090A", "..."] }
```

**Si `MFA_CHALLENGE_REQUIRED`** (MFA ya activo, logins siguientes): verificar con el
`preMfaToken`:

`POST http://localhost:3000/api/v1/client/auth/mfa/verify`, exactamente uno de los dos:
```json
{ "codigo": "123456" }
```
```json
{ "codigoRecuperacion": "A1B2-C3D4-E5F6-0708-090A" }
```
Devuelve `{ mensaje, token }` — ese `token` (audiencia normal, `token_use: session`) es el
que se usa como `Authorization: Bearer <token>` en el resto de la API. Un mismo codigo TOTP
nunca se acepta dos veces (`401 MFA_CODE_REUSED`); un codigo de recuperacion es de un solo
uso (`401 RECOVERY_CODE_ALREADY_USED`). `mfa/enroll/confirm` y `mfa/verify` tienen un rate
limit propio (`MFA_RATE_LIMIT_WINDOW_MS`/`MFA_RATE_LIMIT_MAX`, `429 MFA_RATE_LIMITED`).

Exactamente el mismo flujo aplica a `/api/v1/admin/auth/login` +
`/api/v1/admin/auth/mfa/*` — incluido el `SUPERADMIN` recien sembrado (ver abajo), sin
excepcion: su primer login tambien responde `MFA_ENROLLMENT_REQUIRED`.

El primer `SUPERADMIN` se crea unicamente con un script offline, nunca via HTTP:

```
SUPERADMIN_NOMBRE="Admin Principal" \
SUPERADMIN_EMAIL="admin@prestamesta.com" \
SUPERADMIN_PASSWORD="AdminSuperSeguro123" \
npm run seed:superadmin
```

A partir de ahi, un `SUPERADMIN` autenticado (sesion completa, ya con MFA hecho) puede
crear mas administradores:

**Crear administrador** (`POST http://localhost:3000/api/v1/admin/administradores`,
requiere `Authorization: Bearer <token de sesion de un SUPERADMIN>`)
```json
{
  "nombre": "Nuevo Analista",
  "email": "analista@prestamesta.com",
  "password": "AdminSuperSeguro123",
  "rol": "ANALISTA"
}
```

**Registro cliente** (`POST http://localhost:3000/api/v1/client/auth/register`, sin
cambios — el MFA se enrola en el primer login, no en el registro)
```json
{
  "nombre": "Juan Pérez",
  "email": "juan@example.com",
  "password": "miPasswordSeguro123",
  "telefono": "8711234567"
}
```

Step-up e identidad INE (`docs/mfa-identidad-ine.md`) todavia no estan implementados.

### Consultar prestamos

`GET /api/v1/client/prestamos`, `GET /api/v1/client/prestamos/:id` (cliente, solo sus
propios prestamos) y `GET /api/v1/admin/prestamos`, `GET /api/v1/admin/prestamos/:id`
(`SUPERADMIN`/`ANALISTA`, cualquier prestamo). `COBRADOR` no tiene acceso a ninguno.

En el lado cliente, `cliente_id` sale siempre del JWT (`Authorization: Bearer <token>`),
nunca de query ni body: no hay forma de pedir los prestamos de otra persona. Un id
inexistente y un id que pertenece a otro cliente responden exactamente el mismo `404
LOAN_NOT_FOUND` (mismo criterio anti-enumeracion que el login).

**Listar prestamos propios** (`GET http://localhost:3000/api/v1/client/prestamos?page=1&limit=20`)
```json
{
  "data": [
    {
      "id": 1,
      "credito": { "id": 1, "nombre": "Crédito Personal Express" },
      "monto_solicitado": "10000.00",
      "monto_total_a_pagar": "12400.00",
      "saldo_pendiente": "12400.00",
      "estado": "PENDIENTE",
      "fecha_solicitud": "2026-08-02T20:46:06.000Z",
      "fecha_decision": null
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```
`GET .../client/prestamos/:id` devuelve el mismo detalle mas `aval` (`null` si no se
registro aval al solicitar).

**Listar prestamos (admin)**, con filtros opcionales combinables:
`GET http://localhost:3000/api/v1/admin/prestamos?estado=PENDIENTE&cliente_id=7&fecha_desde=2026-01-01&fecha_hasta=2026-01-31&page=1&limit=20`

Filtros disponibles: `estado` (`PENDIENTE`/`APROBADO`/`RECHAZADO`), `cliente_id`,
`credito_id`, `fecha_desde`/`fecha_hasta` (formato `YYYY-MM-DD`, sobre `fecha_solicitud`;
`fecha_hasta` incluye el dia completo). Cada item de la lista incluye `cliente:
{id, nombre, email}` y `credito: {id, nombre}` anidados. `GET .../admin/prestamos/:id`
devuelve el detalle completo: `credito` con todos los campos del catalogo, `cliente` con
`telefono` incluido (o `null`), y `aval` (o `null`).

`page`/`limit` (defaults 1/20, `limit` maximo 100) y el orden (siempre `fecha_solicitud
DESC, id DESC`) aplican en los cuatro endpoints. Una pagina vacia/fuera de rango responde
`200` con `data: []`, nunca `404`.

Para el resto de endpoints (catalogo de creditos, solicitud y aprobacion/rechazo de
prestamos) y los codigos de error estables, ver `openapi.yaml`.
