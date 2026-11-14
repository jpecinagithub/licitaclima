FROM node:24-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-workspace.yaml ./
COPY packages/ packages/
COPY apps/api/ apps/api/
RUN pnpm install --filter @licitaclima/api --prod --frozen-lockfile || pnpm install --filter @licitaclima/api --prod
RUN pnpm --filter @licitaclima/api build
CMD ["node", "apps/api/dist/server.js"]
