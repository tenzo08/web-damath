# Built from the repo root (`docker build -f apps/web/Dockerfile .`) — same reason as
# apps/server/Dockerfile: pnpm workspaces need the whole monorepo context.
FROM node:20-slim AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

# Vite bundles env vars in at build time, not runtime — the server URL a deployed
# client talks to has to be known when the image is built, not when it's started.
ARG VITE_SERVER_URL=http://localhost:3001
ENV VITE_SERVER_URL=$VITE_SERVER_URL
RUN pnpm -F web build

FROM nginx:alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
