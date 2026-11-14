# LicitaClima API — imagen de producción.
# NOTA (Fase F): el build necesita las dependencias de desarrollo (tsc) y los
# paquetes workspace compilados a dist/ (main/types -> dist). Por eso se
# instala SIN --prod y se compila la cadena de dependencias con
# `pnpm --filter @licitaclima/api... build` (el sufijo ... incluye las
# dependencias workspace en orden topológico). Sin Docker en la VM de
# desarrollo, esta imagen NO se ha construido aquí: verificar en Oracle con
# `docker compose build api` antes de desplegar.
FROM node:24-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY packages/ packages/
COPY apps/api/ apps/api/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @licitaclima/api... build
CMD ["node", "apps/api/dist/server.js"]
