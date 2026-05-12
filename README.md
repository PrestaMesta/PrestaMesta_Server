# PrestaMesta Backend - Manual de Entorno de Desarrollo con Docker

Este repositorio contiene el núcleo lógico (API REST) del sistema de préstamos **PrestaMesta**, desarrollado con **NestJS 11** y **PostgreSQL 16**.

---

## 📋 1. Requisitos Previos

Asegúrate de tener instalados los siguientes componentes:
- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** (Asegúrate de que el motor esté encendido/verde antes de empezar).
- **Node.js** (Opcional, para generar el `package-lock.json` inicial).
- **Gestor de BD** (Recomendado: DBeaver o PgAdmin) para visualizar las tablas.

---

## 📂 2. Estructura de la Arquitectura Docker

El entorno se compone de dos servicios principales orquestados por Docker Compose:

1.  **`backend-dev`**: El servidor NestJS que corre en el puerto `3000`. Tiene activado el *Hot Reload* a través de volúmenes.
2.  **`db`**: Una instancia de PostgreSQL 16 que corre en el puerto `5432`. Los datos son persistentes gracias al volumen `pgdata`.

---

## ⚙️ 3. Instrucciones de Arranque Paso a Paso

### Paso 1: Generar el archivo de bloqueo (Solo si no existe)
Si acabas de clonar el repo y no ves el archivo `package-lock.json`, ejecútalo localmente una vez:

```bash
npm install
```

### Paso 2: Levantar los servicios

Ejecuta el siguiente comando en la raíz del proyecto para construir las imágenes y levantar los contenedores en segundo plano:

```bash
docker compose up -d --build
```

### Paso 3: Verificar que el servidor inició correctamente

Como usamos la bandera -d, el servidor corre en el fondo. Para ver los registros (logs) de NestJS en tiempo real, usa:

```bash
docker compose logs -f backend-dev
```

Si ves el mensaje [NestApplication] Nest application successfully started, todo está listo.

---

## 4. Puntos de Acceso
API (Backend)

    URL Local: http://localhost:3000

    Hot Reload: Cualquier cambio que guardes en los archivos .ts de la carpeta src reiniciará el servidor automáticamente dentro del contenedor.

Base de Datos (PostgreSQL)

Para conectar tu gestor de base de datos favorito, usa estas credenciales:

    Host: localhost

    Puerto: 5432

    Usuario: root

    Contraseña: rootpassword

    Base de Datos: prestamesta_db

---

## 5. Comandos Útiles

Detener el entorno:

```bash
docker compose stop
```

Eliminar contenedores y red (limpieza profunda):

```bash
docker compose down
```

Reinstalar dependencias tras un git pull:
Si un compañero agregó librerías nuevas al package.json, haz un pull y luego:

```bash
docker compose up -d --build
```

--- 

6. Notas de Arquitectura y Seguridad

    Seguridad Informática: Las credenciales en el archivo docker-compose.yml son exclusivas para desarrollo local. En producción, se utilizarán Variables de Entorno Secretas.

    Persistencia: No borres el volumen pgdata a menos que quieras limpiar toda la base de datos y empezar de cero.