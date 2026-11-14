# LicitaClima worker — imagen de producción.
# Igual que la API: instalación completa (tsc) + build de la cadena de
# dependencias (`...` = worker + sus paquetes workspace). El arranque
# compilado es `node apps/worker/dist/index.js` (ver docs/operations.md).
# Sin Docker en la VM de desarrollo, esta imagen NO se ha construido aquí.
FROM node:24-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY packages/ packages/
COPY apps/worker/ apps/worker/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @licitaclima/worker... build
CMD ["node", "apps/worker/dist/index.js"]
