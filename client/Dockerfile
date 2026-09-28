# Shopping Mall web client: build the static site, serve it with nginx, and proxy the multiplayer server
# on the same origin (/ws, /health, /host-token), so no CORS or absolute URLs are needed.
# Build from the repo root:  docker build -f client/Dockerfile -t shopping-mall-web .
FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN pnpm install --frozen-lockfile --filter @shopping-mall/client...
COPY mall.config.ts tsconfig.base.json ./
COPY shared shared
COPY client client
# "/ws" = same host as the page; nginx forwards it to the server container
ARG VITE_MALL_WS=/ws
ENV VITE_MALL_WS=$VITE_MALL_WS
RUN pnpm --filter @shopping-mall/client build

FROM nginx:1.27-alpine
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
