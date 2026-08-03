# syntax=docker/dockerfile:1

# Version de Node pineada a la misma linea verificada en desarrollo (ver .nvmrc /
# .node-version): >=22.23.1 <23. No se instala Node como dependencia npm.

# --- deps: instala SOLO dependencias de produccion con npm ci (reproducible, usa el lockfile) ---
FROM node:22.23.1-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- runtime: imagen final, sin herramientas de build, usuario no root ---
FROM node:22.23.1-slim AS runtime
ENV NODE_ENV=production
# Valor por defecto, no un valor fijo: Coolify (o `docker run -e PORT=...`) lo puede
# sobrescribir en runtime sin reconstruir la imagen.
ENV PORT=3000
WORKDIR /app

# Usuario y grupo dedicados (no se reutiliza el usuario "node" de la imagen base, para no
# depender de su UID fijo si Coolify remapea usuarios).
RUN groupadd --system prestamesta \
  && useradd --system --gid prestamesta --home-dir /app --shell /usr/sbin/nologin prestamesta

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY app.js ./
COPY config ./config
COPY controllers ./controllers
COPY middleware ./middleware
COPY models ./models
COPY repositories ./repositories
COPY routes ./routes
COPY services ./services
COPY utils ./utils
COPY validators ./validators
COPY migrations ./migrations
COPY scripts ./scripts

# WORKDIR con permisos solo para el usuario de ejecucion: dueño = prestamesta, sin acceso
# de grupo/otros (rwx solo para el owner; root sigue pudiendo administrar el contenedor,
# pero ningun otro usuario sin privilegios dentro de la imagen puede leer/escribir aqui).
RUN chown -R prestamesta:prestamesta /app && chmod -R 750 /app
USER prestamesta

# Metadato informativo: el puerto real en runtime lo define la variable de entorno PORT
# (Coolify la inyecta). El servidor escucha explicitamente en 0.0.0.0 (ver app.js).
EXPOSE 3000

# Healthcheck de Docker contra /health/live (liveness barato, no toca MySQL/Mongo). No usa
# curl/wget (no estan instalados en la imagen "slim"): usa el propio Node.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get({host:'127.0.0.1',port:process.env.PORT||3000,path:'/health/live',timeout:2000}, (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Las migraciones NUNCA se ejecutan automaticamente al iniciar el contenedor: solo arranca
# el servidor HTTP. `npm run migrate` se corre manualmente (ver DEPLOYMENT.md).
CMD ["node", "app.js"]
