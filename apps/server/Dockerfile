# Built from the repo root (`docker build -f apps/server/Dockerfile .`) — pnpm
# workspaces need the whole monorepo context, since @damath/engine and @damath/ai are
# consumed as workspace: dependencies, not published packages.
FROM node:20-slim AS base
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

# apps/server's own package.json points "start" at `tsx src/index.ts`, not a compiled
# dist/ — @damath/engine and @damath/ai ship raw TypeScript as their package "main"
# (see KNOWLEDGE.md, "a workspace package whose main is raw .ts only runs under a
# transpile-on-the-fly tool"), so tsx is the runtime here too, not `node dist/index.js`.
FROM base AS runtime
WORKDIR /app/apps/server
ENV NODE_ENV=production
EXPOSE 3001
CMD ["pnpm", "start"]
