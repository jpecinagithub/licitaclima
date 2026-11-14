FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-workspace.yaml ./
COPY packages/ packages/
COPY apps/web/ apps/web/
RUN pnpm install --filter @licitaclima/web --frozen-lockfile || pnpm install --filter @licitaclima/web
RUN pnpm --filter @licitaclima/web build
FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
