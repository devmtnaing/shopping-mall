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
COPY client/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/client/dist /usr/share/nginx/html
# where the multiplayer server is, and the port to serve on (Railway sets PORT)
# where the visitor's IP comes from: CLIENT_IP_FROM, or a default chosen at start (client-ip.envsh)
COPY client/client-ip.envsh /docker-entrypoint.d/15-client-ip.envsh
ENV PORT=80 API_UPSTREAM=server:8787 NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
EXPOSE 80
