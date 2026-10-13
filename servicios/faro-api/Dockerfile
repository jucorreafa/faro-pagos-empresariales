# ---------------------------------------------------------------
# Imagen del servicio (S7 · Contenedores). Igual para los 3 servicios.
# Lectura rápida: "parte de Node 24 liviano, instala solo lo necesario,
# copia el código y corre SIN privilegios de administrador".
# ---------------------------------------------------------------
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

# 1) Primero solo las dependencias: Docker reutiliza esta capa si no cambian.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 2) Luego el código.
COPY src ./src

# 3) Seguridad: nunca correr como root dentro del contenedor (NIST SP 800-190).
USER node

ENV PORT=8080
EXPOSE 8080

# 4) Docker revisa la salud cada 30 s (Kubernetes usa sus propias sondas).
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/salud" > /dev/null || exit 1

CMD ["node", "src/servidor.js"]
