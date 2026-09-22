# Vlumeaware API — production image.
# The same image runs the API (default) and the worker (override the command:
#   API:    node dist/main.js
#   Worker: node dist/worker.js
FROM node:22-slim AS base
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build

FROM base AS run
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
EXPOSE 3001

# Migrations run at container start, not by hand after a deploy.
#
# Nothing in the deploy path applied them before, so production drifted behind
# the repo and stayed in sync only because someone remembered to run
# `prisma migrate deploy` against it. A deploy that ships code reading a column
# that does not exist yet boots clean and then 500s on first use.
#
# `migrate deploy` applies only what is pending and is a no-op on restart, so
# this is safe to run on every boot. It is start-time rather than build-time
# because a Render build has no DATABASE_URL.
#
# Caveat: with more than one instance these would race. The service runs a
# single instance; past that, move this to a pre-deploy command so it runs
# once per deploy rather than once per container.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
