# Checkpoint 6A — MFA e identidad INE: diseño contractual

Este documento es **solo diseño**. No hay código, migraciones ni endpoints implementados
todavía. Su objetivo es fijar el contrato (tablas, estados, endpoints, permisos) antes de
tocar `openapi.yaml` o cualquier archivo bajo `routes/`/`services/`/`repositories/`.

## 0. Decisiones ya tomadas (dadas, no se re-discuten aqui)

- Unico documento de identidad admitido: INE mexicana (frontal + posterior).
- MFA obligatorio para **clientes y administradores** — no es opt-in.
- MVP de MFA: TOTP (RFC 6238) + codigos de recuperacion de un solo uso.
- La biometria local del telefono (Face ID / huella para desbloquear la app) **no es**
  verificacion de identidad servidor-side ni cuenta como factor MFA: es una decision de UX
  del lado Flutter para proteger el token/sesion guardados en el dispositivo. No requiere
  contrato de backend y no se documenta mas alla de este parrafo — no se debe confundir con
  la prueba de vida (liveness) del flujo INE, que si es server-side y si es parte de este
  diseño.
- `solicitar prestamo`, `aprobar/rechazar prestamo` y `crear administrador` requeriran
  autenticacion reciente o step-up (ver seccion 3.7).
- Verificacion de identidad: INE frontal/posterior -> OCR -> confirmacion de datos por el
  cliente -> selfie + prueba de vida -> comparacion facial contra la INE, mediante un
  proveedor externo.
- Ninguna imagen (INE, selfie, video de liveness) se almacena en MySQL ni en MongoDB.
- No se construye reconocimiento facial ni comparacion biometrica propios.
- Debe existir una abstraccion de proveedor externo, para poder cambiar de proveedor sin
  tocar controllers/services/routes.

**Alcance — confirmado en la revision previa a 6B (ya no es un supuesto):**

- La verificacion de identidad INE aplica **unicamente a clientes** (es un control
  KYC/AML sobre quien pide dinero prestado). Los administradores **no** pasan por el flujo
  INE — su identidad laboral se gestiona por alta manual de un SUPERADMIN, no por KYC.
- MFA es obligatorio para **clientes y administradores**, sin excepcion — incluye al
  SUPERADMIN sembrado por `scripts/seed-superadmin.js` (ver seccion 3.1).

Estas dos lineas ya no aparecen en la seccion 16 de pendientes: quedan fijadas como
alcance de 6B en adelante.

## 1. Estado actual auditado (linea base)

Leido de `CLAUDE.md`, `openapi.yaml`, `middleware/authMiddleware.js`, `utils/jwt.js`,
`middleware/cargarAdministradorActual.js`, `middleware/autorizarRoles.js`,
`migrations/001_clientes.sql`, `migrations/002_administradores.sql`,
`routes/administradoresRoutes.js`, `routes/prestamoRoutes.js`.

- **JWT stateless puro, sin sesion.** `signClienteToken`/`signAdminToken` firman
  `{ sub, email, tipoUsuario, rol? }` con `iss`/`aud`/`iat`/`exp`. No hay tabla de sesiones,
  no hay revocacion, no hay concepto de "nivel de autenticacion" mas alla de lo que se
  horneo en el token al emitirlo.
- **Dos audiencias, ya separadas criptograficamente**: `JWT_AUD_CLIENTE` /
  `JWT_AUD_ADMIN`. `jwt.verify` rechaza la audiencia incorrecta antes de que se evalue
  cualquier autorizacion. Este mecanismo (audiencia como frontera de seguridad, no un campo
  de payload que hay que acordarse de revisar) es el que este diseño reutiliza para MFA y
  step-up (ver 3.3, 3.7).
- **Login = password check + token completo, en un solo paso.**
  `services/clienteAuthService.js#login` y `services/adminAuthService.js#login` verifican
  password con bcrypt y devuelven inmediatamente un token de sesion completo, con todos los
  privilegios del usuario. No hay ningun paso intermedio hoy — esto es exactamente lo que
  MFA obligatorio tiene que romper.
- **Re-verificacion en BD ya existe, pero solo para rol/activo de admin.**
  `middleware/cargarAdministradorActual.js` relee `rol`/`activo` de MySQL en cada request
  administrativa sensible, nunca confia en el JWT para eso. No existe ningun equivalente
  para "¿este usuario tiene MFA activo?" ni para "¿cuando fue la ultima vez que probo sus
  factores?" — ambos son nuevos.
- **Tablas actuales no tienen ninguna columna de MFA ni de identidad:**
  `clientes(id, nombre, email, password, telefono)`,
  `administradores(id, nombre, email, password, rol, activo)`. Todo lo de este documento es
  aditivo (tablas nuevas, `ALTER TABLE` para agregar como mucho un par de columnas de
  puntero), nunca reescribe estas dos tablas.
- **Errores estables**: `codigo` es un enum cerrado en `ErrorEnvelope`
  (`INVALID_CREDENTIALS, TOKEN_INVALID, TOKEN_EXPIRED, FORBIDDEN, VALIDATION_ERROR,
  EMAIL_ALREADY_EXISTS, CREDIT_NOT_FOUND, LOAN_NOT_FOUND, INVALID_TRANSITION, NOT_FOUND,
  INTERNAL_ERROR`). Este diseño propone extenderlo (seccion 12), nunca reutiliza un codigo
  existente con un significado distinto.

## 2. Impacto del modelo JWT stateless actual

El modelo actual no tiene forma de expresar ninguno de estos tres conceptos que MFA/step-up
necesitan, y hay que decidir como se resuelven **sin** introducir una tabla de sesiones
completa (fuera de alcance de este checkpoint, ver seccion 16):

1. **"Este usuario probo password pero todavia no MFA"** — hoy no existe un estado
   intermedio; login da todo o nada.
2. **"Esta accion necesita que el usuario haya probado su identidad hace poco"** — el JWT
   normal no caduca lo bastante seguido como para servir de señal de frescura por si solo
   (`JWT_EXPIRES_IN` por defecto es `8h`), y no hay revocacion para invalidar un token
   "usado para step-up" una vez gastado.
3. **"Revocar un solo token/sesion sin esperar a que expire"** — sigue sin existir en este
   checkpoint (no se introduce una tabla de sesiones ni una blacklist); se evita en su
   lugar con tokens de proposito unico y de vida muy corta (pre-MFA, step-up), que expiran
   solos y nunca se reutilizan.

**Decision de diseño**: en vez de inventar un claim `typ` de proposito general que cada
verificador tiene que acordarse de revisar, se reutiliza el mismo mecanismo que ya separa
cliente de admin — **audiencias JWT distintas por proposito**. Esto es consistente con como
ya funciona el resto del sistema (la audiencia es la frontera de seguridad, no un campo de
payload) y significa que un token pre-MFA usado contra una ruta normal falla exactamente
igual que hoy falla un token de cliente contra una ruta de admin: en `jwt.verify`, antes de
llegar a ninguna logica de negocio.

**Revision de este checkpoint**: la audiencia sola separa *dominio* (cliente vs admin) y
*proposito* (sesion vs pre-MFA vs step-up) en un unico valor compuesto. Se agrega un
segundo claim independiente, `token_use`, que codifica **solo** el proposito
(`'session' | 'pre_mfa' | 'step_up'`), y cada funcion verificadora exige que **ambas
señales coincidan a la vez** — audiencia Y `token_use` — nunca una sola. Esto es
deliberadamente redundante: si en el futuro un bug de implementacion firmara un token con
la audiencia correcta pero el `token_use` equivocado (o viceversa), el token sigue siendo
rechazado, porque ninguna de las dos señales es suficiente por si sola. La validacion es
**mutuamente excluyente** entre clases: un token cuya combinacion audiencia+`token_use` no
coincide exactamente con una de las seis filas de la tabla de abajo no es valido para
ninguna ruta.

Audiencias nuevas propuestas (mismo patron que `JWT_AUD_CLIENTE`/`JWT_AUD_ADMIN` en
`config/env.js`), cada una emparejada con su `token_use` y su funcion verificadora
especifica en `utils/jwt.js`:

| Env var | Ejemplo de valor | `token_use` | Funcion verificadora | Proposito | TTL propuesto |
|---|---|---|---|---|---|
| `JWT_AUD_CLIENTE` (ya existe) | `prestamesta-client` | `session` | `verifyClienteSessionToken` (renombra `verifyClienteToken`) | Sesion completa de cliente | `JWT_EXPIRES_IN` (8h) |
| `JWT_AUD_ADMIN` (ya existe) | `prestamesta-admin` | `session` | `verifyAdminSessionToken` (renombra `verifyAdminToken`) | Sesion completa de admin | `JWT_EXPIRES_IN` (8h) |
| `JWT_AUD_CLIENTE_PRE_MFA` | `prestamesta-client-pre-mfa` | `pre_mfa` | `verifyClientePreMfaToken` | Token temporal previo al MFA (cliente) | 10 min |
| `JWT_AUD_ADMIN_PRE_MFA` | `prestamesta-admin-pre-mfa` | `pre_mfa` | `verifyAdminPreMfaToken` | Token temporal previo al MFA (admin) | 10 min |
| `JWT_AUD_CLIENTE_STEP_UP` | `prestamesta-client-step-up` | `step_up` | `verifyClienteStepUpToken` | Step-up para accion sensible (cliente) | 5 min |
| `JWT_AUD_ADMIN_STEP_UP` | `prestamesta-admin-step-up` | `step_up` | `verifyAdminStepUpToken` | Step-up para accion sensible (admin) | 5 min |

`verifyAnyToken` (hoy usado solo por `GET /prestamos/creditos`) se renombra
`verifyAnySessionToken` y se le agrega el mismo chequeo: acepta cualquiera de las dos
audiencias de sesion, pero exige `token_use === 'session'` en ambos casos — hoy, sin esta
revision, un token pre-MFA o de step-up con audiencia valida (si alguna vez existiera un
bug que reutilizara una audiencia de sesion por error) podria colarse por esta funcion; con
el chequeo de `token_use` explicito, no puede.

Un token pre-MFA o de step-up **nunca** pasa las funciones de sesion (audiencia Y
`token_use` distintos = rechazo automatico), y un token de sesion normal nunca sirve como
pre-MFA ni como step-up. Cada una de las seis combinaciones solo abre las puertas para las
que fue emitida.

**Claims nuevos** en los tokens de **sesion** y de **step-up** (no en el pre-MFA, que se
mantiene deliberadamente minimo — ver seccion 3.5):

- `amr` (Authentication Methods References, mismo nombre que usa OIDC/RFC 8176, no se
  inventa una convencion propia): que factores se probaron para llegar a este token —
  `['pwd','totp']` o `['pwd','recovery']` en sesion; `['pwd','totp']` siempre en step-up
  (la seccion 3.7 exige reconfirmar ambos). Util para auditoria, no para logica de
  autorizacion en el MVP.
- `auth_time` (mismo nombre que usa OIDC): epoch segundos del momento en que se completo la
  autenticacion primaria (password + MFA). Se agrega como claim propio, **no** se reutiliza
  `iat` para este proposito: `iat` es "cuando se firmo este token especifico", mientras que
  `auth_time` debe seguir significando "cuando el usuario probo sus credenciales" incluso si
  en el futuro se agrega renovacion/refresh de tokens sin pedir credenciales de nuevo (fuera
  de alcance de 6A, pero el claim ya queda bien nombrado para no tener que migrarlo despues).
  Hoy, sin refresh, `auth_time === iat` en la practica para el token de sesion (se emite
  justo al completar MFA) y para el de step-up (se emite justo al completar el re-chequeo);
  el chequeo de frescura de la seccion 3.7 usa `auth_time`, no `iat`.

## 3. Flujos

### 3.1 Login (modificado)

`POST /api/v1/client/auth/login` y `POST /api/v1/admin/auth/login` **cambian de contrato**:
ya no devuelven un token de sesion completo. El body de entrada no cambia (`email` +
`password`). Tras validar credenciales (mismo chequeo bcrypt, mismo colapso de "no existe"
vs "password incorrecto" en un unico `401 INVALID_CREDENTIALS` — eso no cambia), la
respuesta `200` siempre trae un discriminador explicito `siguientePaso` con exactamente uno
de estos dos valores (nunca se infiere del lado del cliente a partir del estado crudo de
MFA; el backend decide y lo nombra):

- **`MFA_ENROLLMENT_REQUIRED`** — el usuario no tiene MFA `ACTIVO` (`estado` es
  `NO_ENROLADO` o `PENDIENTE_CONFIRMACION` en la tabla de MFA, seccion 4). El cliente debe
  llamar al flujo de enrolamiento (3.2). Si `estado = 'PENDIENTE_CONFIRMACION'` (empezo a
  enrolar pero nunca confirmo el primer codigo), puede reintentar `mfa/enroll/confirm` con
  el secreto pendiente o volver a llamar `mfa/enroll` para generar uno nuevo (invalida el
  pendiente anterior) — ambas rutas quedan abiertas con el mismo token pre-MFA.
- **`MFA_CHALLENGE_REQUIRED`** — el usuario ya tiene MFA `ACTIVO`. El cliente debe llamar a
  verificacion (3.3) con un codigo TOTP o de recuperacion.

En ambos casos el token que acompaña la respuesta es un token **pre-MFA**
(`token_use: 'pre_mfa'`, seccion 2) — el mismo token sirve tanto para terminar de enrolar
como para verificar; no se introduce una septima audiencia solo para distinguir
"enrolando" de "verificando", porque ambos casos comparten exactamente la misma
restriccion (no puede tocar ninguna ruta de negocio) y el propio backend ya sabe, por el
`estado` en BD, cual de las dos rutas de enrolamiento/verificacion tiene sentido aceptar en
ese momento.

**El token de enrolamiento (pre-MFA) no puede acceder a rutas normales.** Esto no es una
convencion de nomenclatura: esta impuesto por el chequeo doble de la seccion 2 (audiencia
`..._PRE_MFA` + `token_use: 'pre_mfa'`). Ninguna ruta de negocio (`/prestamos/*`,
`/client/prestamos/*`, `/admin/prestamos/*`, `/admin/administradores`, etc.) acepta ese
`token_use`; solo lo aceptan `mfa/enroll`, `mfa/enroll/confirm` y `mfa/verify`. Un intento
de usarlo en cualquier otra ruta falla en `jwt.verify`/el chequeo de `token_use`, antes de
llegar a ningun middleware de autorizacion.

En ningun caso login emite ya el token de sesion completo directamente. Esto es un cambio
de contrato **incompatible hacia atras** con el login actual (que hoy devuelve `token`
utilizable de inmediato) — se documenta explicitamente como tal en la seccion 11 y 12, no
se disimula.

**Bootstrap para usuarios que ya existen hoy (sin MFA).** Al desplegar 6C, ninguna fila de
`clientes`/`administradores` existente tiene una fila correspondiente en
`clientes_mfa`/`administradores_mfa` (o, si 6B decide insertar una fila por cada usuario
existente al migrar, esa fila nace con `estado = 'NO_ENROLADO'` por el `DEFAULT` de la
columna — cualquiera de las dos opciones produce el mismo resultado observable). Efecto:

1. **Todo login existente, del primero al ultimo usuario, recibe `MFA_ENROLLMENT_REQUIRED`
   la primera vez que inicia sesion despues del despliegue.** No hace falta ningun script
   de migracion de datos ni ningun aviso especial — es la consecuencia natural de que
   `estado` por defecto es `NO_ENROLADO` y login ya decide el `siguientePaso` a partir de
   ese valor.
2. **Toda sesion (token de sesion completo) ya emitida antes del despliegue deja de
   funcionar en cuanto las rutas empiecen a exigir `token_use: 'session'`**, porque esos
   tokens antiguos no tienen el claim `token_use` en absoluto (se firmaron antes de que
   existiera). Esto es **efecto deseado, no un bug**: ninguna sesion emitida antes de 6C
   paso nunca por MFA, asi que invalidarla implicitamente al desplegar es exactamente lo
   que se quiere — fuerza un login nuevo que si pasa por el flujo completo. No hace falta
   revocacion explicita (no hay tabla de sesiones) ni un aviso a los usuarios mas alla de
   "tu proxima peticion con el token viejo respondera `401 TOKEN_INVALID`, inicia sesion de
   nuevo" — mismo comportamiento que ya tiene hoy cualquier cambio de `JWT_SECRET`.

**El SUPERADMIN sembrado por `npm run seed:superadmin` no es un caso especial.** El script
(`scripts/seed-superadmin.js`) sigue sin tocarse: crea la fila en `administradores` con
`activo = TRUE`, nada mas — no escribe en `administradores_mfa`. Su primer login despues de
sembrado cae exactamente en el mismo camino que cualquier administrador nuevo: `estado`
por defecto `NO_ENROLADO` -> `siguientePaso: 'MFA_ENROLLMENT_REQUIRED'` -> debe enrolar TOTP
antes de que se le emita cualquier token de sesion completo. No existe ninguna ruta que le
permita a un SUPERADMIN (sembrado o no) operar con privilegios administrativos sin haber
completado el enrolamiento — el enrolamiento en si solo requiere el token pre-MFA, no
requiere ya tener MFA activo (es, por definicion, la primera vez).

### 3.2 Enrolamiento TOTP

1. `POST /api/v1/client/auth/mfa/enroll` (auth: token pre-MFA, o sesion completa + step-up
   para reenrolar) — genera un secreto TOTP nuevo (aleatorio, nunca derivado de datos del
   usuario), lo cifra con **cifrado autenticado** (AEAD, ver seccion 4) y lo guarda con
   `estado = 'PENDIENTE_CONFIRMACION'`. Responde una unica vez con el secreto en claro +
   URI `otpauth://` (para que el frontend renderice el QR), con **timestep de 30 segundos**
   (`otpauth://totp/...?period=30`, el default de RFC 6238 — no se propone un periodo
   distinto). El secreto **nunca** se vuelve a devolver en claro despues de este paso ni se
   loguea en ningun log.
2. `POST /api/v1/client/auth/mfa/enroll/confirm` (auth: token pre-MFA), body
   `{ codigo }` — valida el primer codigo TOTP contra el secreto pendiente. Si es
   correcto: `estado -> 'ACTIVO'`, se generan **N codigos de recuperacion** (propuesto
   N=10, ~80 bits de entropia cada uno, formato tipo `AB12-CD34-EF56`, ver seccion 16), se
   devuelven en claro **una unica vez** en esta respuesta (nunca mas recuperables en claro
   despues — se guardan hasheados con bcrypt, mismo tratamiento que `password`), y se emite
   ya el token de sesion completo — este paso *es* el que completa el login para quien
   enrola por primera vez.

Reenrolar (perdida de dispositivo) usa la misma ruta 1, pero requiere estar en sesion
completa + step-up (no en pre-MFA) si el MFA ya estaba `ACTIVO` — evita que alguien con solo
el password (sin el segundo factor) desactive el MFA de una cuenta ajena. Si el usuario
perdio tambien los codigos de recuperacion, el auto-reenrolamiento con step-up ya no es
posible (no puede completar el step-up sin el segundo factor que justamente perdio) — el
reset lo hace un SUPERADMIN por un canal de soporte (ver seccion 7 revisada, con la
restriccion explicita de que ese SUPERADMIN tampoco puede hacerlo desde una sesion
comprometida).

Ambas rutas de enrolamiento comparten el **rate limiting** de la seccion 3.3 (mismo
limitador, mismo umbral: intentar codigos de confirmacion es tan sensible como verificar en
login).

### 3.3 Verificacion (login normal, con MFA ya activo)

`POST /api/v1/client/auth/mfa/verify` (auth: token pre-MFA), body `{ codigo }` **o**
`{ codigoRecuperacion }` (mutuamente excluyentes, igual que `estado` en
`cambiarEstadoSchema` hoy es un enum cerrado — aqui se valida con un `.strict()` +
`.refine` que exige exactamente uno de los dos).

- **TOTP**: timestep fijo de 30 segundos (RFC 6238 default, ver 3.2), **tolerancia maxima
  ±1 paso** (acepta el paso actual, el anterior y el siguiente — 90s de ventana total, nunca
  mas amplio que eso; no se agrega tolerancia extra "por si el reloj del telefono esta
  desfasado", ver seccion 16 si eso llegara a ser un problema real en producción).
  **Anti-repeticion por indice de paso, no por timestamp**: se guarda
  `totp_ultimo_timestep_usado` (el entero `floor(unix_time / 30)` del ultimo codigo
  aceptado, no un `DATETIME` de "ultima vez usado"). Comparar por indice de paso, no por
  cercania de reloj, es lo que realmente previene reusar el mismo codigo dos veces dentro
  de su ventana de 90s — un `DATETIME` de "ultimo uso" no distingue "mismo paso, reenviado
  10s despues" de "paso siguiente, 35s despues", que es exactamente el caso que hay que
  distinguir. Un codigo cuyo indice de paso es `<= totp_ultimo_timestep_usado` se rechaza
  aunque sea matematicamente valido.
- **Codigo de recuperacion**: se compara contra los hashes almacenados (bcrypt, igual que
  password), se marca `usado_en` la primera vez que se usa un codigo valido — un codigo de
  recuperacion es de un solo uso, un segundo intento con el mismo codigo responde
  `RECOVERY_CODE_ALREADY_USED` aunque el hash siga siendo correcto.
- Ambos casos, si son correctos: se emite el token de sesion completo (`amr`/`auth_time`
  reflejan el factor y momento usados, seccion 2) y se resetea `intentos_fallidos` a 0.
- Fallos incrementan `intentos_fallidos`; al superar un umbral (propuesto 5, ver seccion
  16) se fija `bloqueado_hasta = now() + 15 min` y se responde `MFA_LOCKED` (ver seccion 12
  sobre el status HTTP a usar) incluso si el siguiente codigo enviado seria correcto.

**Rate limiting** (capa independiente del bloqueo por cuenta de arriba, mismo principio de
defensa en profundidad que ya separa `authRateLimiter` de `solicitudRateLimiter`): nuevo
limitador dedicado `mfaRateLimiter` (`MFA_RATE_LIMIT_WINDOW_MS`/`MFA_RATE_LIMIT_MAX`,
mismo patron de env vars que el resto) aplicado por IP a `mfa/verify` y
`mfa/enroll/confirm` — ambas son "adivina un codigo de 6 digitos", ambas necesitan
throttling **antes** de que la logica de negocio siquiera consulte
`intentos_fallidos`/`bloqueado_hasta`. Las dos capas son independientes: el rate limiter
protege contra fuerza bruta distribuida entre varias cuentas desde una misma IP/red; el
bloqueo por cuenta protege una cuenta especifica aunque el atacante rote de IP.

### 3.4 Recuperacion

**Nivel 1 — codigos de recuperacion (self-service).** Cubierta por 3.3 (consumir un codigo
de recuperacion durante el login) y por
`POST /api/v1/client/auth/mfa/recovery-codes/regenerate` (auth: sesion completa + step-up,
`accion: MFA_RESET` sobre uno mismo) para generar un lote nuevo, invalidando los anteriores
no usados. No hay flujo de recuperacion por email/SMS en este MVP (no hay proveedor de esos
canales decidido).

**Nivel 2 — reset manual por SUPERADMIN (cuando se agotan los codigos Y se pierde el
dispositivo TOTP a la vez).** `POST /admin/clientes/:clienteId/mfa/reset` y
`POST /admin/administradores/:adminId/mfa/reset` (seccion 11), ambos SUPERADMIN-only,
ambos exigen step-up con `accion: MFA_RESET`. Fuerzan `estado -> 'DESHABILITADO'` en la
tabla de MFA del usuario objetivo, lo que obliga a re-enrolar (pasa por
`MFA_ENROLLMENT_REQUIRED`) en el siguiente login — nunca reactivan un secreto viejo, nunca
generan codigos de recuperacion en nombre del usuario. Se audita
(`repositories/auditoriaRepository.js`, evento `RESETEO_MFA` con `usuarioId` objetivo y
`administradorId` que lo hizo), mismo patron best-effort ya usado en el resto del sistema.

**Restriccion de seguridad explicita — un SUPERADMIN no puede autorrestablecer su propio
MFA desde una sesion comprometida:**

1. **No existe ninguna ruta de "resetea tu propio MFA".** Las dos rutas de reset de arriba
   solo operan sobre `:clienteId`/`:adminId` **de otra persona** — si `req.usuario.sub`
   coincide con el objetivo, responde `403 MFA_RESET_SELF_NOT_ALLOWED` antes de tocar nada.
   Esto no es una limitacion accidental: es la propiedad de seguridad que se busca. Un
   atacante con un JWT de sesion robado (via XSS, dispositivo desatendido, etc.) **no
   tiene** el segundo factor real del SUPERADMIN legitimo, asi que no puede completar el
   step-up de `MFA_RESET` — y aunque de alguna forma lo lograra, la ruta igual rechazaria
   un reset sobre si mismo.
2. **Resetear el MFA de un tercero exige step-up del actor, no solo su sesion.** Un JWT de
   sesion robado, sin el segundo factor real, no puede generar el `stepUpToken` necesario
   para resetear el MFA de *nadie*, ni de si mismo ni de otra cuenta — la barrera es la
   misma que protege cualquier otra accion sensible (seccion 3.7), no una regla especial
   solo para MFA.
3. **Consecuencia practica**: si un SUPERADMIN pierde su dispositivo TOTP y sus codigos de
   recuperacion **a la vez**, la unica salida dentro del sistema es que **otro SUPERADMIN
   distinto**, con su propio step-up valido, ejecute el reset sobre esa cuenta. El sistema
   nunca ofrece una via para que una cuenta se rescate a si misma sin el segundo factor —
   eso seria, por definicion, un bypass de MFA.
4. **Caso limite sin resolver en este checkpoint**: si existe un **unico** SUPERADMIN y
   pierde dispositivo + codigos de recuperacion a la vez, no hay ningun otro SUPERADMIN que
   pueda resetearlo por HTTP. La salida propuesta (a confirmar, ver seccion 16) es un
   script offline analogo a `scripts/seed-superadmin.js` — requiere acceso directo al
   servidor/base de datos, nunca un endpoint HTTP, exactamente el mismo principio que ya
   usa el bootstrap del primer SUPERADMIN — precisamente porque un atacante con solo un JWT
   robado no tiene acceso al servidor para correr un script local.

### 3.5 Token temporal previo al MFA

Ya definido en la seccion 2 (audiencia `..._PRE_MFA`, TTL 10 min). Claims:
`{ sub, email, tipoUsuario, iss, aud: <...-pre-mfa>, token_use: 'pre_mfa', iat, exp }` —
deliberadamente **sin** `rol` (para admins), sin `amr`, sin `auth_time`, ni ningun otro
claim de privilegio o de auditoria de factores: un token pre-MFA no debe poder autorizar
nada de negocio ni siquiera si algun middleware futuro se equivoca y no revisa la audiencia
o el `token_use`. Solo sirve contra `mfa/enroll`, `mfa/enroll/confirm` y `mfa/verify`
(verificado por `verifyClientePreMfaToken`/`verifyAdminPreMfaToken`, que exigen audiencia Y
`token_use` a la vez).

### 3.6 Sesion autenticada

El token de sesion completo agrega, respecto al que existe hoy
(`sub, email, tipoUsuario, rol?, iss, aud, iat, exp`), tres claims:
`token_use: 'session'`, `amr` y `auth_time` (ver seccion 2 para el detalle de cada uno).
Sigue siendo el unico token que las rutas normales
(`verificarTokenCliente`/`verificarTokenAdmin`, que ahora llaman internamente a
`verifyClienteSessionToken`/`verifyAdminSessionToken`) aceptan — la forma general del
middleware Express no cambia, solo la funcion de `utils/jwt.js` que invoca.

### 3.7 Step-up para operaciones sensibles

Endpoints que hoy existen y pasan a requerir autenticacion reciente o step-up:
`POST /prestamos/solicitar`, `PATCH /prestamos/:id/estado`,
`POST /admin/administradores` — exactamente los tres que dice la decision ya tomada. A
futuro (fuera de este checkpoint) tambien aplicaria a la decision de identidad manual
(seccion 8), a la regeneracion de codigos de recuperacion (3.4) y al reset de MFA de otro
usuario (seccion 7 revisada).

**Revision de este checkpoint — el step-up ya no es "generico para cualquier accion
sensible durante su TTL": el scope es obligatorio.** `POST /api/v1/client/auth/step-up` /
`POST /api/v1/admin/auth/step-up` (auth: sesion completa), body
`{ password, codigo, accion, recurso? }`:

- `accion`: enum obligatorio, uno de `SOLICITAR_PRESTAMO`, `APROBAR_RECHAZAR_PRESTAMO`,
  `CREAR_ADMINISTRADOR`, `MFA_RESET` (esta ultima usada tanto por
  `recovery-codes/regenerate` sobre la propia cuenta como por los endpoints
  `admin/.../mfa/reset` sobre la cuenta de otra persona, seccion 7 revisada). El step-up
  emitido solo sirve para esa `accion`, nunca para otra — un `stepUpToken` pedido para
  `CREAR_ADMINISTRADOR` no autoriza `APROBAR_RECHAZAR_PRESTAMO` aunque ambos sean acciones
  de administrador y el token siga sin expirar.
- `recurso` — **obligatorio solo para `APROBAR_RECHAZAR_PRESTAMO`**, con forma
  `{ tipo: 'PRESTAMO', id: <id> }`; ausente/no aplicable para `SOLICITAR_PRESTAMO` y
  `CREAR_ADMINISTRADOR` (ninguno de los dos tiene un recurso previo que identificar — el
  prestamo/administrador todavia no existe en el momento del step-up). Esto ata el
  step-up de una decision de prestamo al **prestamo especifico** que el administrador esta
  a punto de aprobar/rechazar: sin esto, un `stepUpToken` de 5 minutos para
  `APROBAR_RECHAZAR_PRESTAMO` serviria para aprobar/rechazar *cualquier* prestamo durante
  su TTL, lo cual es mas privilegio del que la decision real (una accion sobre un prestamo
  puntual) necesita — y es exactamente el tipo de sobre-alcance que un token robado en ese
  margen de 5 minutos podria explotar contra prestamos distintos al que el administrador
  pretendia decidir. El cliente debe conocer el `id` del prestamo (ya lo tiene: esta viendo
  su detalle antes de decidir) y pedir el step-up con ese `id` puesto, inmediatamente antes
  de llamar `PATCH /prestamos/:id/estado`.

El JWT del `stepUpToken` incluye `scope: ['SOLICITAR_PRESTAMO']` (o la accion que
corresponda; se modela como arreglo para admitir mas de un scope a futuro sin cambiar la
forma del claim, aunque el MVP siempre emite exactamente uno) y, cuando aplica,
`recurso: { tipo: 'PRESTAMO', id }`.

**¿De un solo uso? Si — con `jti` persistido.** A diferencia de todo lo demas en este
diseño (deliberadamente sin estado de servidor, ver seccion 2), el step-up es la **unica
excepcion narrow y explicita**: cada `stepUpToken` lleva un claim `jti` (JWT ID, UUID v4
aleatorio, claim estandar) y se **consume** — se vuelve inutilizable — la primera vez que
se usa con exito, aunque su `exp` todavia no haya llegado. Esto cierra la ventana de replay
dentro del TTL de 5 minutos (sin esto, un `stepUpToken` interceptado podria reutilizarse
varias veces mientras siga vigente). Persistencia minima nueva:

```sql
CREATE TABLE step_up_tokens_consumidos (
  jti CHAR(36) NOT NULL,
  consumido_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_en TIMESTAMP NOT NULL,   -- copia de `exp` del token, para poder purgar filas vencidas
  PRIMARY KEY (jti)
);
```

El `INSERT` de esta fila ocurre **dentro de la misma transaccion** que la accion sensible
que autoriza (ej. el mismo `beginTransaction`/`commit` que ya usa
`repositories/prestamoRepository.js#cambiarEstado`), nunca antes ni despues por separado:
si el `INSERT` falla por violacion de la `PRIMARY KEY` (el `jti` ya fue consumido), la
transaccion completa se revierte y la accion no se ejecuta — un intento de replay nunca
puede "a medias" ejecutar la accion sensible y fallar solo al marcar el token como usado.
Esta tabla **no es una tabla de sesiones** (no representa "quien esta logueado"): es un
ledger de reemplazo minimo, de vida corta (`expira_en` a lo sumo 5 minutos en el futuro),
cuya unica funcion es impedir reuso — mismo principio, a mucha menor escala, que
`totp_ultimo_timestep_usado` en la seccion 3.3. Purga/retencion de filas vencidas: pendiente
(seccion 16), no bloqueante para 6B (las filas son minusculas y de vida cortisima; un job
de limpieza periodico es una mejora, no un requisito de correctitud).

Middleware nuevo propuesto, `exigirAutenticacionRecienteOStepUp(accionRequerida)`,
encadenado **despues** de `verificarTokenCliente`/`verificarTokenAdmin` (y despues de
`cargarAdministradorActual` en rutas de admin, mismo orden que ya usa `autorizarRoles`):

1. Si `(ahora - req.usuario.auth_time) <= ventanaMs`: continua sin exigir nada mas
   ("autenticacion reciente" — el usuario acaba de hacer login/MFA, no se le vuelve a
   pedir nada, sin importar `accionRequerida`). `ventanaMs` propuesto: 10 minutos,
   configurable por env var (`STEP_UP_FRESHNESS_WINDOW_MS`, mismo patron que
   `SOLICITUD_RATE_LIMIT_WINDOW_MS`).
2. Si no: exige un header `X-Step-Up-Token` con un JWT valido de audiencia `..._STEP_UP` +
   `token_use: 'step_up'`, no expirado, con `jti` no presente en
   `step_up_tokens_consumidos`, **cuyo `sub` coincida exactamente con `req.usuario.sub`**
   (no se puede usar el step-up de otra cuenta), **cuyo `scope` incluya
   `accionRequerida`**, y — solo cuando `accionRequerida === 'APROBAR_RECHAZAR_PRESTAMO'` —
   cuyo `recurso.id` coincida con `req.params.id` de la ruta actual. Si cualquiera de estos
   chequeos falla: falta el header -> `401 STEP_UP_REQUIRED`; presente pero expirado ->
   `401 STEP_UP_EXPIRED`; presente pero invalido, ya consumido, `sub` distinto, o
   scope/recurso que no coinciden -> `401 STEP_UP_INVALID` (deliberadamente **un solo**
   codigo para todos los casos de "el token no sirve para esto", en vez de exponer cual de
   las cuatro razones especificas fallo — mismo principio anti-enumeracion que ya usan
   login y la propiedad de prestamos: no hay que darle a un atacante informacion fina sobre
   *por que* su token no funciono).

**Reconfirma password Y TOTP**, no solo uno de los dos: reconfirmar solo el TOTP no
protegeria contra un token de sesion robado via XSS/dispositivo desatendido (el atacante
tendria el JWT pero no el segundo factor real); reconfirmar solo el password no protegeria
si el atacante ya tiene password + dispositivo. Pedir ambos es el mismo principio de "dos
factores" aplicado al re-chequeo, no uno nuevo.

## 4. Tablas y campos propuestos

Todas nuevas (`ALTER TABLE` solo si hiciera falta un puntero minimo en `clientes`/
`administradores`, evaluar en 6B; este documento no fuerza esa decision). FK hacia
`clientes`/`administradores` con `ON DELETE CASCADE`: a diferencia de `prestamos`/`avales`
(que son registros financieros que este sistema explicitamente nunca borra fisicamente,
ver `migrations/004_prestamos.sql`), un secreto MFA o una referencia de verificacion de
identidad **no tienen valor independiente** del usuario al que pertenecen — si algun
proceso futuro llegara a borrar fisicamente un cliente/admin, dejar secretos/PII huerfanos
seria en si mismo un problema de privacidad. Se documenta la diferencia de criterio
explicitamente porque contradice el patron RESTRICT usado en préstamos.

```sql
-- Mismo shape para clientes y administradores; se proponen tablas separadas (no una tabla
-- polimorfica compartida) por el mismo criterio que ya separa `clientes`/`administradores`
-- como tablas independientes en todo el esquema actual.

CREATE TABLE clientes_mfa (
  cliente_id INT UNSIGNED NOT NULL,
  estado ENUM('NO_ENROLADO','PENDIENTE_CONFIRMACION','ACTIVO','DESHABILITADO')
    NOT NULL DEFAULT 'NO_ENROLADO',
  -- Cifrado autenticado (AEAD, ej. AES-256-GCM): esta columna guarda
  -- nonce (12 bytes) || ciphertext || auth_tag (16 bytes) concatenados, nunca el secreto en
  -- claro ni cifrado con un modo no autenticado (CBC sin HMAC, etc.). La CLAVE de cifrado
  -- vive fuera de MySQL siempre (env var gestionada fuera del dump de BD, o KMS externo —
  -- cual de las dos, pendiente en seccion 16); un volcado de esta tabla sin la clave no
  -- sirve para recuperar ningun secreto TOTP.
  totp_secret_cifrado VARBINARY(255) NULL,
  totp_activado_en DATETIME NULL,
  -- Anti-replay por INDICE DE PASO (floor(unix_time/30)), no por marca de tiempo de "ultimo
  -- uso": ver seccion 3.3 para por que un DATETIME de "ultima vez" no basta para esto.
  totp_ultimo_timestep_usado BIGINT UNSIGNED NULL,
  intentos_fallidos SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  bloqueado_hasta DATETIME NULL,
  PRIMARY KEY (cliente_id),
  CONSTRAINT fk_clientes_mfa_cliente FOREIGN KEY (cliente_id)
    REFERENCES clientes (id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE clientes_mfa_codigos_recuperacion (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id INT UNSIGNED NOT NULL,
  codigo_hash VARCHAR(255) NOT NULL,               -- bcrypt, mismo tratamiento que password
  usado_en DATETIME NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_mfa_codigos_cliente (cliente_id),
  CONSTRAINT fk_mfa_codigos_cliente FOREIGN KEY (cliente_id)
    REFERENCES clientes (id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- administradores_mfa / administradores_mfa_codigos_recuperacion: mismas columnas,
-- FK -> administradores(id) ON DELETE CASCADE. No se repite el DDL completo aqui.

CREATE TABLE clientes_identidad (
  cliente_id INT UNSIGNED NOT NULL,
  estado ENUM(
    'NO_INICIADO','INE_CARGADA','OCR_PROCESADO','DATOS_CONFIRMADOS','SELFIE_CARGADA',
    'EN_REVISION_PROVEEDOR','APROBADA','RECHAZADA',
    'REVISION_MANUAL_PENDIENTE','REVISION_MANUAL_APROBADA','REVISION_MANUAL_RECHAZADA',
    'EXPIRADA'
  ) NOT NULL DEFAULT 'NO_INICIADO',
  proveedor VARCHAR(50) NOT NULL,                  -- identificador logico, nunca hardcodeado en código
  proveedor_referencia_id VARCHAR(150) NULL,        -- id de sesion/verificacion en el proveedor
  ocr_nombre VARCHAR(150) NULL,
  ocr_curp VARCHAR(18) NULL,
  ocr_clave_elector VARCHAR(20) NULL,
  ocr_fecha_nacimiento DATE NULL,
  ocr_vigencia_hasta DATE NULL,
  datos_confirmados_en DATETIME NULL,
  resultado_proveedor VARCHAR(50) NULL,             -- veredicto crudo del proveedor, se traduce a `estado`
  score_comparacion_facial DECIMAL(5, 2) NULL,
  revisado_por_admin_id INT UNSIGNED NULL,
  revisado_en DATETIME NULL,
  motivo_rechazo VARCHAR(500) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  expira_en DATE NULL,                              -- vigencia legal de la INE / revalidacion periodica
  PRIMARY KEY (cliente_id),
  CONSTRAINT fk_clientes_identidad_cliente FOREIGN KEY (cliente_id)
    REFERENCES clientes (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_clientes_identidad_admin FOREIGN KEY (revisado_por_admin_id)
    REFERENCES administradores (id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- Nunca guarda bytes de imagen: solo el puntero opaco a donde vive el archivo (bucket
-- privado propio o almacenamiento propio del proveedor). Ver seccion 9.
CREATE TABLE clientes_identidad_documentos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id INT UNSIGNED NOT NULL,
  tipo ENUM('INE_FRONTAL','INE_POSTERIOR','SELFIE','VIDEO_LIVENESS') NOT NULL,
  storage_key VARCHAR(255) NOT NULL,                -- referencia opaca, nunca una URL publica
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_identidad_documentos_cliente (cliente_id),
  CONSTRAINT fk_identidad_documentos_cliente FOREIGN KEY (cliente_id)
    REFERENCES clientes (id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Idempotencia de webhooks del proveedor de identidad (seccion 5/7): los proveedores
-- reintentan un webhook si no reciben 200 a tiempo, asi que la MISMA notificacion puede
-- llegar mas de una vez. `(proveedor, evento_id)` es la clave natural que el proveedor ya
-- entrega en cada payload; un INSERT que choca con la PK significa "ya procesado", se
-- responde 200 sin reaplicar la transicion de estado ni reescribir la auditoria.
CREATE TABLE identidad_webhook_eventos_procesados (
  proveedor VARCHAR(50) NOT NULL,
  evento_id VARCHAR(150) NOT NULL,
  procesado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (proveedor, evento_id)
);
```

`ocr_curp`/`ocr_clave_elector` son PII sensible por si solos (aunque no sean la imagen):
quedan dentro del alcance de retencion/eliminacion de la seccion 10, igual que el resto de
la fila.

`step_up_tokens_consumidos` (DDL completo en la seccion 3.7, junto al flujo que la usa) es
la unica otra tabla de este diseño que no cuelga de `clientes`/`administradores` — es un
ledger de reemplazo de proposito unico, no una tabla de identidad ni de MFA por cuenta.

## 5. Estados de MFA

`NO_ENROLADO -> PENDIENTE_CONFIRMACION -> ACTIVO -> DESHABILITADO` (adjacency list simple,
mismo estilo que `utils/prestamoStateMachine.js`). `DESHABILITADO` es un estado
administrativo (un SUPERADMIN puede forzarlo, ej. en el flujo de soporte de perdida de
dispositivo) que obliga a re-enrolar en el siguiente login. El "bloqueo temporal" por
intentos fallidos **no** es un estado del enum — es el campo ortogonal
`bloqueado_hasta`, para no confundir "activo pero bloqueado los proximos 15 minutos" con
"deshabilitado permanentemente" (son respuestas UX y de negocio distintas).

## 6. Estados de verificacion de identidad

Enum ya listado en la seccion 4. Transiciones:

```
NO_INICIADO -> INE_CARGADA -> OCR_PROCESADO -> DATOS_CONFIRMADOS -> SELFIE_CARGADA
  -> EN_REVISION_PROVEEDOR -> { APROBADA | RECHAZADA | REVISION_MANUAL_PENDIENTE }

REVISION_MANUAL_PENDIENTE -> { REVISION_MANUAL_APROBADA | REVISION_MANUAL_RECHAZADA }

{ RECHAZADA | REVISION_MANUAL_RECHAZADA } -> NO_INICIADO   (reintento, con limite; seccion 16)

{ APROBADA | REVISION_MANUAL_APROBADA } -> EXPIRADA         (por vigencia, fuera de alcance de 6A)
```

Para efectos de "¿puede este cliente solicitar un prestamo?" (gating, seccion 3.7 y 11):
`APROBADA` y `REVISION_MANUAL_APROBADA` cuentan como verificado; cualquier otro estado
bloquea con `403 IDENTITY_NOT_VERIFIED`.

## 7. Flujo INE -> OCR -> confirmacion -> selfie/liveness -> resultado

**Tres invariantes de este checkpoint, validas en todo el flujo:**

- **El backend crea la sesion del proveedor, nunca el cliente directamente.** El cliente no
  tiene (ni necesita) credenciales del proveedor externo. Toda llamada a
  `IdentidadProvider.iniciarVerificacion`/`obtenerEstado`/`obtenerUrlFirmada` (seccion 14)
  la hace nuestro backend, server-to-server, con sus propias credenciales de proveedor. Lo
  unico que el cliente recibe son URLs de subida (o un `sdkToken`) de vida corta que
  nuestro backend ya broker — el cliente nunca abre su propia sesion con el proveedor por
  fuera de eso.
- **El cliente nunca declara el resultado.** Ningun endpoint de cliente
  (`POST /client/identidad/ine`, `.../ine/confirmar`, `.../selfie`) acepta un campo
  `estado`/`resultado`/`veredicto`/`aprobado` en el body — los validadores Zod de estas
  rutas son `.strict()` y ese campo simplemente no existe en el schema, mismo principio que
  hoy `solicitarPrestamoSchema` nunca acepta `estado` ni `monto_total_a_pagar` del cliente
  (ver `CLAUDE.md`, seccion Validation). `.../ine/confirmar` solo dejar corregir los campos
  de **texto** que vinieron del OCR (nombre, CURP, etc.) — nunca el veredicto de la
  verificacion en si.
- **El resultado solo llega por dos canales, ambos server-to-server**: (a) el backend
  consultando `obtenerEstado` con sus propias credenciales (fallback/polling, ej. si el
  cliente pregunta `GET /client/identidad` y el estado local sigue en
  `EN_REVISION_PROVEEDOR` mas alla de un margen de gracia), o (b) el webhook firmado del
  proveedor (canal primario, push). El cliente jamas es la fuente del veredicto — solo
  dispara el inicio del proceso y confirma texto de OCR, nunca el resultado.

**Idempotencia del webhook** (`POST /identidad/webhook/:proveedor`, ver tambien
`identidad_webhook_eventos_procesados` en la seccion 4): cada payload trae un identificador
de evento propio del proveedor; antes de aplicar cualquier transicion de estado, el
handler intenta `INSERT INTO identidad_webhook_eventos_procesados (proveedor, evento_id)`;
si la insercion choca con la `PRIMARY KEY` (evento ya visto), responde `200` de inmediato
sin reaplicar nada — los proveedores reintentan webhooks que no confirmaron con `200` a
tiempo, asi que una entrega duplicada es un caso normal a esperar, no un error. Esto se
suma (no reemplaza) a la verificacion de firma HMAC: la firma prueba que el payload es
autentico; la tabla de eventos procesados prueba que no se aplica dos veces.

1. Cliente en sesion completa pide iniciar verificacion
   (`POST /client/identidad/ine`) -> backend crea/actualiza la fila en
   `clientes_identidad` (`estado = 'INE_CARGADA'` una vez el proveedor confirma
   recepcion) y devuelve URLs/token de subida directa al proveedor — **el backend nunca
   recibe los bytes de la INE** (ver seccion 9).
2. El proveedor hace OCR sobre la INE subida y expone el resultado (via webhook o al
   consultar `obtenerEstado`, seccion 14) -> `estado = 'OCR_PROCESADO'`, se guardan los
   campos `ocr_*` (texto, nunca imagen).
3. El cliente confirma/corrige esos datos
   (`POST /client/identidad/ine/confirmar`) -> `estado = 'DATOS_CONFIRMADOS'`,
   `datos_confirmados_en = now()`.
4. El cliente sube selfie + video de prueba de vida
   (`POST /client/identidad/selfie`, mismo patron de URL directa al proveedor) ->
   `estado = 'SELFIE_CARGADA'` -> el backend dispara la comparacion facial en el
   proveedor -> `estado = 'EN_REVISION_PROVEEDOR'`.
5. El proveedor responde (webhook, seccion 14) con un veredicto -> se traduce a
   `APROBADA` / `RECHAZADA` / `REVISION_MANUAL_PENDIENTE` (nunca se expone el enum crudo
   del proveedor a las capas superiores, se traduce en la frontera, igual que el resto del
   sistema nunca deja pasar mensajes crudos de SQL/Mongo).

## 8. Revision manual

Cuando el proveedor no da un veredicto concluyente (`resultado_proveedor` cae en su propia
categoria de "revision humana", que cada proveedor nombra distinto — se traduce siempre a
`REVISION_MANUAL_PENDIENTE`), la fila entra a una cola visible solo para
SUPERADMIN/ANALISTA (seccion 11, endpoints `GET /admin/identidad*`). El admin revisor ve las imagenes via URL
firmada de corta duracion (seccion 9), nunca un archivo servido/proxied por este backend, y
resuelve con `POST /admin/identidad/:clienteId/decision`
(`{ decision: 'APROBAR'|'RECHAZAR', motivo? }`), que exige step-up (seccion 3.7) por ser una
decision de confianza equivalente a aprobar un prestamo. Se audita
(`revisado_por_admin_id`, `revisado_en`, y un evento en Mongo via
`repositories/auditoriaRepository.js`, mismo patron best-effort que ya usa
`cambiarEstado` de prestamos).

## 9. Almacenamiento privado y URLs firmadas

**Diseño recomendado**: el backend de Prestamesta **nunca** recibe ni retransmite los bytes
de la INE/selfie/video. El cliente sube directamente al proveedor (via SDK del proveedor o
una URL de subida de corta duracion que el proveedor emite) — esto es lo que mas
robustamente cumple "no se almacenan imagenes en MySQL/Mongo": ni siquiera pasan,
transitoriamente, por nuestro servidor. `clientes_identidad_documentos.storage_key` guarda
solo la referencia opaca que el proveedor devuelve, nunca una URL publica ni las mismas
imagenes.

Cuando un admin necesita **ver** las imagenes (revision manual, seccion 8), el backend pide
al proveedor una **URL firmada** de corta duracion (propuesto: 5 minutos, un solo uso si el
proveedor lo soporta) scoped a esa fila especifica, se la entrega al frontend admin, y no la
cachea ni la loguea. Si en el futuro se decide un proveedor que no soporte subida directa
(el backend tendria que hacer de proxy), la misma URL firmada se usaria para un bucket
privado propio (S3-compatible, `ACL: private`, sin acceso publico) en vez del proveedor —
la interfaz de la seccion 14 abstrae esta diferencia para que no importe a las capas
superiores.

## 10. Retencion y eliminacion

No decidido en este checkpoint (ver seccion 16), pero el diseño ya deja los puntos de
extension necesarios: `clientes_identidad.expira_en` (revalidacion periodica),
`clientes_identidad_documentos` como tabla separada (permite borrar/expirar referencias de
documentos independientemente del resultado de la verificacion, si la politica de retencion
de "la imagen" y "el veredicto" terminan siendo distintas), y el hecho de que la eliminacion
fisica de un cliente ya cascadea (`ON DELETE CASCADE`) a MFA e identidad — evita el caso de
tener que acordarse de borrar 4 tablas a mano si algun proceso de baja de cuenta llega a
implementarse.

## 11. Endpoints propuestos

Prefijo `/api/v1` en todos, mismo patron domain-prefixed que ya usan
`/client/prestamos`/`/admin/prestamos`.

| Metodo y ruta | Auth | Rol (admin) | Proposito |
|---|---|---|---|
| `POST /client/auth/login` | — | — | **Modificado**: devuelve token pre-MFA, no sesion completa |
| `POST /admin/auth/login` | — | — | Igual, dominio admin |
| `POST /client/auth/mfa/enroll` | pre-MFA o sesion+step-up | — | Genera secreto TOTP |
| `POST /client/auth/mfa/enroll/confirm` | pre-MFA o sesion+step-up | — | Activa MFA, entrega codigos de recuperacion |
| `POST /client/auth/mfa/verify` | pre-MFA | — | Completa login con TOTP o codigo de recuperacion |
| `POST /client/auth/mfa/recovery-codes/regenerate` | sesion + step-up (`accion: MFA_RESET`, sobre si mismo) | — | Nuevo lote de codigos |
| `POST /client/auth/step-up` | sesion | — | Body `{ password, codigo, accion, recurso? }`, emite `stepUpToken` escopeado (seccion 3.7) |
| (mismas 6 rutas bajo `/admin/auth/mfa/*` y `/admin/auth/step-up`) | | | |
| `POST /admin/clientes/:clienteId/mfa/reset` | sesion admin + step-up (`accion: MFA_RESET`, sobre otro usuario) | SUPERADMIN | Fuerza `DESHABILITADO`, requiere re-enrolar (seccion 7 revisada) |
| `POST /admin/administradores/:adminId/mfa/reset` | sesion admin + step-up (`accion: MFA_RESET`, sobre otro usuario) | SUPERADMIN | Igual, para otro administrador — nunca sobre si mismo (seccion 7 revisada) |
| `POST /client/identidad/ine` | sesion | — | Inicia verificacion, entrega URLs de subida directa |
| `POST /client/identidad/ine/confirmar` | sesion | — | Confirma/corrige datos OCR |
| `POST /client/identidad/selfie` | sesion | — | Inicia subida de selfie/liveness |
| `GET /client/identidad` | sesion | — | Estado propio (sin score ni internals del proveedor) |
| `POST /identidad/webhook/:proveedor` | firma HMAC del proveedor, no JWT | — | Callback async del proveedor |
| `GET /admin/identidad` | sesion admin | SUPERADMIN, ANALISTA | Cola paginada (mismo patron `page`/`limit`/`.strict()` que `/admin/prestamos`) |
| `GET /admin/identidad/:clienteId` | sesion admin | SUPERADMIN, ANALISTA | Detalle + URLs firmadas |
| `POST /admin/identidad/:clienteId/decision` | sesion admin + step-up | SUPERADMIN, ANALISTA | Aprueba/rechaza en revision manual |

Endpoints existentes que ganan una precondicion nueva (sin cambiar su URL ni su rol
requerido):

| Endpoint | Precondicion nueva |
|---|---|
| `POST /prestamos/solicitar` | `identidad.estado` ∈ `{APROBADA, REVISION_MANUAL_APROBADA}` + autenticacion reciente o step-up |
| `PATCH /prestamos/:id/estado` | autenticacion reciente o step-up |
| `POST /admin/administradores` | autenticacion reciente o step-up |

El webhook (`/identidad/webhook/:proveedor`) es el unico endpoint de este diseño que
**no** usa JWT — es server-to-server, se autentica por firma HMAC del proveedor sobre el
payload (patron estandar de webhooks), consistente con que esta llamada no representa a
ningun usuario de Prestamesta.

## 12. Cuerpos, respuestas y codigos de error

Cambio de contrato en login (breaking, documentado en seccion 3.1):

```jsonc
// POST /client/auth/login — 200 (nuevo shape)
{
  "mensaje": "Verifica tu identidad para continuar.",
  "preAuthToken": "eyJ...",
  "siguientePaso": "MFA_CHALLENGE_REQUIRED",   // o "MFA_ENROLLMENT_REQUIRED"
  "mfaEstado": "ACTIVO"                          // dato crudo subyacente (NO_ENROLADO / PENDIENTE_CONFIRMACION / ACTIVO); el cliente
                                                  // debe decidir su UI a partir de `siguientePaso`, `mfaEstado` es informativo/depuracion
}
```

```jsonc
// POST /client/auth/mfa/verify — body
{ "codigo": "123456" }
// o
{ "codigoRecuperacion": "AB12-CD34-EF56" }

// 200
{ "mensaje": "Autenticacion exitosa", "token": "eyJ...", "cliente": { "id": 1, "nombre": "...", "email": "..." } }
```

```jsonc
// POST /client/auth/step-up — body
{
  "password": "miPasswordSeguro123",
  "codigo": "123456",
  "accion": "APROBAR_RECHAZAR_PRESTAMO",
  "recurso": { "tipo": "PRESTAMO", "id": 42 }    // obligatorio solo para esta accion (seccion 3.7)
}

// 200
{ "mensaje": "Autenticacion reciente confirmada.", "stepUpToken": "eyJ..." }
```

```jsonc
// POST /admin/clientes/:clienteId/mfa/reset — body (vacio; el recurso ya esta en la URL)
{}

// 200
{ "mensaje": "MFA reiniciado. El cliente debera re-enrolar en su proximo login.", "clienteId": 7 }
```

```jsonc
// POST /client/identidad/ine/confirmar — body
{
  "nombre": "Juan Pérez",
  "curp": "PEXJ900101HDFRRN01",
  "claveElector": "PRXJJN90010112H100",
  "fechaNacimiento": "1990-01-01",
  "vigenciaHasta": "2030-01-01"
}
```

```jsonc
// POST /admin/identidad/:clienteId/decision — body
{ "decision": "APROBAR" }
// o
{ "decision": "RECHAZAR", "motivo": "Selfie no coincide con la fotografia de la INE" }
```

Extension propuesta al enum `codigo` de `ErrorEnvelope` (aditiva, ningun codigo existente
cambia de significado):

| Codigo | HTTP | Cuando |
|---|---|---|
| `MFA_REQUIRED` | 401 | Se llamo una ruta normal con un token pre-MFA (audiencia equivocada — en la practica esto ya lo cubre `TOKEN_INVALID` por audiencia, este codigo es para el caso donde se quiere dar un mensaje mas especifico al cliente) |
| `MFA_NOT_ENROLLED` | 409 | Se llamo `mfa/verify` sin haber enrolado nunca |
| `MFA_ALREADY_ENROLLED` | 409 | Se llamo `mfa/enroll` con `estado = 'ACTIVO'` sin step-up |
| `MFA_INVALID_CODE` | 401 | TOTP o codigo de recuperacion incorrecto |
| `MFA_LOCKED` | 423 (nuevo status, ver seccion 16) | `bloqueado_hasta` en el futuro |
| `RECOVERY_CODE_ALREADY_USED` | 401 | Codigo de recuperacion valido pero ya consumido |
| `STEP_UP_REQUIRED` | 401 | Falta `X-Step-Up-Token` y la sesion no esta "reciente" |
| `STEP_UP_INVALID` | 401 | `X-Step-Up-Token` presente pero invalido, ya consumido (`jti`), de otro `sub`, o `scope`/`recurso` que no coincide con la accion/recurso actual — un unico codigo para las cuatro razones, deliberado (seccion 3.7) |
| `STEP_UP_EXPIRED` | 401 | `X-Step-Up-Token` presente pero expirado |
| `MFA_RESET_SELF_NOT_ALLOWED` | 403 | Un SUPERADMIN intenta resetear su **propio** MFA via `admin/.../mfa/reset` — esa ruta solo acepta resetear la cuenta de otra persona (seccion 7 revisada) |
| `IDENTITY_NOT_VERIFIED` | 403 | `POST /prestamos/solicitar` sin identidad `APROBADA`/`REVISION_MANUAL_APROBADA` |
| `IDENTITY_VERIFICATION_IN_PROGRESS` | 409 | Se intenta reiniciar un flujo INE ya en curso |
| `IDENTITY_PROVIDER_ERROR` | 502 (nuevo status, ver seccion 16) | El proveedor externo respondio con error o timeout |
| `IDENTITY_DOCUMENT_INVALID` | 400 | El proveedor rechazo la INE por ilegible/no-INE/manipulada, antes de llegar a comparacion facial |

`detalles` (el array de `{campo, mensaje}` que hoy solo se llena para `VALIDATION_ERROR`)
se mantiene igual: ninguno de los codigos nuevos expone detalles del proveedor externo ni
mensajes crudos, siguiendo la misma regla ya establecida en `middleware/errorHandler.js`.

## 13. Permisos: cliente, SUPERADMIN, ANALISTA

| Accion | Cliente | SUPERADMIN | ANALISTA | COBRADOR |
|---|---|---|---|---|
| Enrolar/verificar/step-up MFA propio | si (propio) | si (propio) | si (propio) | si (propio) |
| Regenerar codigos de recuperacion propios | si (propio, +step-up) | si (propio, +step-up) | si (propio, +step-up) | si (propio, +step-up) |
| Iniciar/subir INE y selfie propios | si (propio) | no aplica* | no aplica* | no aplica* |
| Consultar estado de identidad propio | si (propio) | no aplica* | no aplica* | no aplica* |
| Ver cola de revision manual | no | si | si | no |
| Ver detalle + URLs firmadas de un cliente | no | si | si | no |
| Aprobar/rechazar en revision manual | no | si (+step-up) | si (+step-up) | no |
| Resetear el MFA de **otro** usuario (cliente o admin) | no | si (+step-up, nunca sobre si mismo) | no | no |
| Resetear el MFA de **si mismo** via endpoint HTTP | no | **no, nunca** (`MFA_RESET_SELF_NOT_ALLOWED`, seccion 3.4) | no | no |
| Ver secreto TOTP o codigos de recuperacion de otro usuario, en claro | **nadie, nunca** (ni siquiera SUPERADMIN) | | | |

`*` — la verificacion INE es solo para clientes (alcance confirmado, seccion 0); un
administrador no tiene endpoints de identidad propios en este diseño.

El reset de MFA es deliberadamente **solo SUPERADMIN** (no ANALISTA): a diferencia de la
revision de identidad (mismo nivel de confianza que aprobar prestamos), tocar el MFA de
otra cuenta es una operacion de control de acceso, no de riesgo crediticio — se trata con
el mismo nivel de confianza que crear administradores, que hoy tambien es exclusivo de
SUPERADMIN.

`ANALISTA` obtiene los mismos permisos de revision de identidad que ya tiene sobre
aprobar/rechazar prestamos (mismo par de roles, mismo nivel de confianza — consistente con
la matriz de roles existente en `CLAUDE.md`). `COBRADOR` sigue sin acceso a nada de esto,
igual que hoy no tiene acceso a prestamos.

## 14. Abstraccion del proveedor

Interfaz conceptual (sin implementar), analoga a como `repositories/` ya aisla todo acceso
a MySQL/Mongo para que nada por encima de esa capa toque `pool`/`mongoose` directamente:

```
IdentidadProvider:
  iniciarVerificacion({ clienteId })
    -> { proveedorReferenciaId, uploadUrls: { ineFrontal, inePosterior, selfie } }
       // o { sdkToken } si el proveedor usa SDK embebido en vez de URLs de subida

  obtenerEstado(proveedorReferenciaId)
    -> { resultado, ocr: {...} | null, scoreComparacionFacial: number | null }

  obtenerUrlFirmada(proveedorReferenciaId, tipoDocumento)
    -> { url, expiraEn }

  verificarFirmaWebhook(payloadCrudo, headers)
    -> boolean
```

Un adapter concreto (`services/identidadProviders/<proveedor>Adapter.js`, nombre real a
definir cuando se elija proveedor — seccion 16) implementa esta interfaz; todo lo demas
(`services/identidadService.js`, `controllers/identidadController.js`, `routes/*`) depende
solo de la interfaz, nunca del SDK/API especifica del proveedor. Cambiar de proveedor en el
futuro es cambiar el adapter, no tocar controllers/services/routes ni el esquema de
`clientes_identidad` (que ya guarda `proveedor` como dato, no como estructura).

## 15. Checkpoints pequeños de implementacion (roadmap, no ejecutado ahora)

- **6B** — Migraciones: `clientes_mfa`, `clientes_mfa_codigos_recuperacion`,
  `administradores_mfa`, `administradores_mfa_codigos_recuperacion`,
  `clientes_identidad`, `clientes_identidad_documentos`. Sin tocar tablas existentes salvo,
  si hiciera falta, un puntero minimo. Checkpoint de aprobacion propio (igual que el
  Checkpoint 1 original de esquema).
- **6C** — TOTP nucleo: enroll/confirm/verify/recovery-codes, audiencias pre-MFA, MFA
  obligatorio en login. Sin step-up ni INE todavia.
- **6D** — Step-up: endpoint + middleware `exigirAutenticacionRecienteOStepUp`, aplicado
  primero solo a `POST /admin/administradores` (menor radio de impacto, un solo rol) antes
  de extenderlo a solicitar/aprobar prestamos.
- **6E** — Proveedor de identidad: contrato de la interfaz (seccion 14) + adapter real de
  un proveedor concreto ya elegido, webhook, sin todavia bloquear
  `POST /prestamos/solicitar`.
- **6F** — Cola de revision manual admin (listar/detalle/decision), reutilizando el patron
  de paginacion/filtros `.strict()` ya usado en `/admin/prestamos`.
- **6G** — Gating real: `POST /prestamos/solicitar` exige identidad aprobada; pruebas
  end-to-end de los flujos completos (login -> MFA -> INE -> solicitar).

Cada uno de estos, igual que los checkpoints anteriores del proyecto, se detiene para
aprobacion explicita antes de pasar al siguiente.

## 16. Decisiones todavia pendientes

**Resueltas en esta revision (ya no aparecen como abiertas):** alcance de INE (solo
clientes) y de MFA (clientes y administradores, sin excepcion) — seccion 0; que el
`stepUpToken` **si** este escopeado por accion y, para decisiones de prestamo, tambien por
recurso — seccion 3.7; que el `stepUpToken` **si** sea de un solo uso, via `jti` persistido
en `step_up_tokens_consumidos` — seccion 3.7; que la clave de cifrado del secreto TOTP
**si** viva fuera de MySQL siempre — seccion 4 (queda abierto solo *cual* mecanismo, ver
abajo); que un SUPERADMIN **no pueda** autorrestablecer su propio MFA — seccion 3.4.

**Siguen abiertas:**

- ¿Proveedor externo concreto a contratar? Cambia si el modelo es "subida directa del
  cliente al proveedor" o "el backend hace de proxy" (afecta si hace falta o no un bucket
  privado propio ademas del almacenamiento del proveedor).
- Ventana exacta de "autenticacion reciente" antes de exigir step-up (propuesto 10 min).
- TTL exactos de token pre-MFA (propuesto 10 min) y de `stepUpToken` (propuesto 5 min).
- Cuantos codigos de recuperacion se emiten (propuesto 10) y cuantos intentos fallidos de
  TOTP disparan el bloqueo temporal (propuesto 5, 15 min de bloqueo).
- Umbrales exactos de `mfaRateLimiter` (`MFA_RATE_LIMIT_WINDOW_MS`/`MFA_RATE_LIMIT_MAX`,
  seccion 3.3) — se propone el mismo orden de magnitud que `authRateLimiter`, sin un numero
  fijo todavia.
- ¿Se introduce el status HTTP 423 (Locked) para `MFA_LOCKED` y 502 para
  `IDENTITY_PROVIDER_ERROR` — ninguno de los dos se usa hoy en este proyecto (los status en
  uso son 200/201/400/401/403/404/409/429/500) — o se reutiliza 429/500 para ambos?
- Politica de reintentos tras `RECHAZADA` antes de forzar `REVISION_MANUAL_PENDIENTE`
  obligatoria o bloquear la cuenta.
- Vigencia/revalidacion periodica de una identidad ya `APROBADA` (campo `expira_en` ya
  reservado, sin politica definida todavia).
- Politica de retencion y eliminacion de `clientes_identidad`/`clientes_identidad_documentos`
  tras baja de cuenta o tras N años (Mexico no tiene un plazo legal unico aplicable a todos
  los casos de este tipo de dato; requiere decision de negocio/legal, no tecnica).
- Cifrado en reposo de `totp_secret_cifrado`: confirmado que la clave vive fuera de MySQL
  (seccion 4); falta decidir **como** — ¿KMS externo gestionado, o cifrado a nivel de
  aplicacion con una clave nueva en `config/env.js`? Impacta si hace falta una dependencia
  nueva (hoy el proyecto no tiene ninguna dependencia de cifrado simetrico mas alla de
  bcrypt para hashes, que no es cifrado reversible).
- Proceso de soporte para resetear el MFA de un **cliente** (a diferencia del caso admin,
  ya resuelto en 3.4): ¿que prueba de identidad exige un SUPERADMIN antes de ejecutar
  `POST /admin/clientes/:clienteId/mfa/reset` sobre la cuenta de un cliente que dice haber
  perdido su dispositivo? Es una decision de proceso de soporte/negocio (evitar que
  ingenieria social convenza a un SUPERADMIN de resetear el MFA de la cuenta de otra
  persona), no una decision tecnica — el mecanismo tecnico (step-up + auditoria + nunca
  sobre uno mismo) ya esta definido, pero no cierra por si solo el riesgo de ingenieria
  social contra el humano que aprueba el reset.
- Procedimiento de "break-glass" si existe un **unico** SUPERADMIN y pierde dispositivo +
  codigos de recuperacion a la vez (seccion 3.4, punto 4): se propone un script offline
  analogo a `scripts/seed-superadmin.js`, sin diseñar todavia (nombre, flags de
  confirmacion, si exige `--confirm-production` igual que el seed).
- Retencion/purga de `step_up_tokens_consumidos` e `identidad_webhook_eventos_procesados`
  (ambas tablas de vida corta/proposito unico, seccion 3.7 y 4): un job de limpieza
  periodico es una mejora, no bloqueante para 6B, pero falta decidir su cadencia si se
  llega a implementar.
