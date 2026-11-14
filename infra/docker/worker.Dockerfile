FROM node:24-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-workspace.yaml ./
COPY packages/ packages/
COPY apps/worker/ apps/worker/
RUN pnpm install --filter @licitaclima/worker --prod --frozen-lockfile || pnpm install --filter @licitaclima/worker --prod
RUN pnpm --filter @licitaclima/worker build
CMD ["node", "apps/worker/dist/index.js"]
