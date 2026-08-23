# Multi-stage build: compile TypeScript (API + shared @karma/types), then
# run on a slim runtime image with only production dependencies.

FROM node:20-slim AS build
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
COPY packages/types/package.json packages/types/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile

COPY packages/types packages/types
COPY apps/api apps/api
COPY infra infra

RUN pnpm --filter @karma/types build
RUN pnpm --filter @karma/api build

FROM node:20-slim AS runtime
RUN corepack enable
WORKDIR /repo
ENV NODE_ENV=production

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
COPY packages/types/package.json packages/types/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /repo/packages/types/dist packages/types/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY infra infra

EXPOSE 4000
WORKDIR /repo/apps/api
CMD ["node", "dist/server.js"]
