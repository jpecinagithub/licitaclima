# LicitaClima web — build Vite + prerender estático, servido con nginx.
# El build necesita scripts/prerender.mjs (se ejecuta al final del build de
# la web) y el paquete @licitaclima/config compilado. Sin Docker en la VM de
# desarrollo, esta imagen NO se ha construido aquí.
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY packages/ packages/
COPY apps/web/ apps/web/
COPY scripts/ scripts/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @licitaclima/web... build
FROM nginx:alpine
COPY infra/docker/web-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
