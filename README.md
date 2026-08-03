## Prestamesta Server

Backend de Prestamesta: Express + MySQL (datos transaccionales) + MongoDB (auditoria).
Ver `CLAUDE.md` para arquitectura interna y comandos de desarrollo. El contrato completo
de la API vive en `openapi.yaml` (validalo con `npm run docs:validate`).

### Requisitos locales

MongoDB en Docker:

```
docker run -d --name mongo-prestamesta -p 27017:27017 mongo
```

MySQL corriendo aparte, con el esquema aplicado desde `migrations/` (`npm run migrate`,
nunca automatico en el arranque de la app). Copia `.env.example` a `.env` y completa las
variables (`JWT_SECRET` propio, no reutilizado entre entornos).

Roles de administrador: `SUPERADMIN`, `ANALISTA`, `COBRADOR`.

### Autenticacion

Cliente y administrador son dos dominios de identidad separados, con tokens JWT de
audiencias distintas: un token de cliente nunca es aceptado en una ruta administrativa, y
viceversa.

El primer `SUPERADMIN` se crea unicamente con un script offline, nunca via HTTP:

```
SUPERADMIN_NOMBRE="Admin Principal" \
SUPERADMIN_EMAIL="admin@prestamesta.com" \
SUPERADMIN_PASSWORD="AdminSuperSeguro123" \
npm run seed:superadmin
```

A partir de ahi, un `SUPERADMIN` autenticado puede crear mas administradores:

**Crear administrador** (`POST http://localhost:3000/api/v1/admin/administradores`,
requiere `Authorization: Bearer <token de un SUPERADMIN>`)
```json
{
  "nombre": "Nuevo Analista",
  "email": "analista@prestamesta.com",
  "password": "AdminSuperSeguro123",
  "rol": "ANALISTA"
}
```

**Login admin** (`POST http://localhost:3000/api/v1/admin/auth/login`)
```json
{
  "email": "admin@prestamesta.com",
  "password": "AdminSuperSeguro123"
}
```

**Registro cliente** (`POST http://localhost:3000/api/v1/client/auth/register`)
```json
{
  "nombre": "Juan Pérez",
  "email": "juan@example.com",
  "password": "miPasswordSeguro123",
  "telefono": "8711234567"
}
```

**Login cliente** (`POST http://localhost:3000/api/v1/client/auth/login`)
```json
{
  "email": "juan@example.com",
  "password": "miPasswordSeguro123"
}
```

Para el resto de endpoints (catalogo de creditos, solicitud y aprobacion/rechazo de
prestamos) y los codigos de error estables, ver `openapi.yaml`.
