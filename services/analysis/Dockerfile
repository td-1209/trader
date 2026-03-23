FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/notify/package.json packages/notify/
COPY services/analysis/package.json services/analysis/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/notify/node_modules ./packages/notify/node_modules
COPY --from=deps /app/services/analysis/node_modules ./services/analysis/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./
COPY packages/shared/ packages/shared/
COPY packages/notify/ packages/notify/
COPY services/analysis/ services/analysis/
RUN pnpm turbo build --filter=@trader/analysis
RUN pnpm deploy --filter=@trader/analysis --prod /app/deployed

FROM base AS runner
COPY --from=build /app/deployed/node_modules ./node_modules
COPY --from=build /app/services/analysis/dist ./dist
COPY --from=build /app/packages/shared/dist ./node_modules/@trader/shared/dist
COPY --from=build /app/packages/notify/dist ./node_modules/@trader/notify/dist
ENV NODE_ENV=production
EXPOSE 3003
CMD ["node", "dist/index.js"]
