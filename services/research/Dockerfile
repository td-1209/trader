FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/notify/package.json packages/notify/
COPY services/research/package.json services/research/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/notify/node_modules ./packages/notify/node_modules
COPY --from=deps /app/services/research/node_modules ./services/research/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./
COPY packages/shared/ packages/shared/
COPY packages/notify/ packages/notify/
COPY services/research/ services/research/
RUN pnpm turbo build --filter=@trader/research
RUN pnpm deploy --filter=@trader/research --prod --legacy /app/deployed

FROM base AS runner
COPY --from=build /app/deployed/node_modules ./node_modules
COPY --from=build /app/services/research/dist ./dist
COPY --from=build /app/packages/shared/dist ./node_modules/@trader/shared/dist
COPY --from=build /app/packages/notify/dist ./node_modules/@trader/notify/dist
RUN sed -i 's|./src/index.ts|./dist/index.js|' ./node_modules/@trader/shared/package.json
RUN sed -i 's|./src/index.ts|./dist/index.js|' ./node_modules/@trader/notify/package.json
ENV NODE_ENV=production
EXPOSE 3002
CMD ["node", "dist/index.js"]
