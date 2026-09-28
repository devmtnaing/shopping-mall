# Plaza multiplayer server. Node runs the TypeScript sources directly (type stripping), so there's
# no build step: install production dependencies, copy the sources, run.
# Build from the repo root:  docker build -f server/Dockerfile -t plaza-server .
FROM node:24-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN pnpm install --frozen-lockfile --prod --filter @plaza/server...

FROM gcr.io/distroless/nodejs24-debian12
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/shared/node_modules shared/node_modules
COPY --from=deps /app/server/node_modules server/node_modules
COPY shared/package.json shared/
COPY shared/src shared/src
COPY server/package.json server/
COPY server/src server/src
ENV PORT=8787 NODE_ENV=production
EXPOSE 8787
USER nonroot
CMD ["server/src/main.ts"]
