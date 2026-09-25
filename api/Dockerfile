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

# Optional migration runner, for applying migrations without starting the app —
# a pre-deploy command, a CI step, or a one-off job. The runtime image can also
# do it (it carries the Prisma CLI); this stage just starts faster and needs no
# runtime configuration.
#
#   docker build --target migrate -t vlumeaware-migrate .
#   docker run --rm -e DATABASE_URL=... vlumeaware-migrate
FROM build AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

FROM base AS run
ENV NODE_ENV=production
COPY --chown=node:node package.json package-lock.json ./
# Production dependencies only. The build stage needs the whole toolchain
# (typescript, @nestjs/cli) to compile; none of it belongs in the image that
# serves traffic.
#
# `prisma` is a deliberate exception — it is listed under "dependencies", not
# "devDependencies", because migrations are applied by the application itself at
# boot (src/common/prisma/migrate-on-boot.ts). The CLI therefore has to exist in
# the image that runs the app, not only at build time. Everything else dev-only
# stays out.
RUN npm ci --omit=dev

# The generated client is a build artefact: @prisma/client's install step cannot
# reproduce it without a schema and a database, so it is copied over the
# prod-only install rather than regenerated here.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/dist ./dist
# The schema and migrations: read at boot to apply pending migrations, and then
# to verify the database matches the code.
#
# `--chown=node:node` is load-bearing, not tidiness. The container runs as the
# non-root `node` user, but COPY preserves the mode a file had in the build
# context, and a file that happens to be mode 600 — which depends on the umask
# of whoever created it — is unreadable to anyone but root. The failure surfaces
# as Prisma's "Could not find the migration file at migration.sql", which points
# at the wrong thing entirely. Owning the tree as `node` makes the image
# independent of how the files were written on the machine that built it.
COPY --from=build --chown=node:node /app/prisma ./prisma

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Not root. The process only reads its own files.
USER node

# Migrations run at container start, inside the application (see
# src/common/prisma/migrate-on-boot.ts), not in a shell step here — so they
# happen however the process is started: this image, a native `npm start`, or a
# one-off job.
#
# The original shell version of this (`prisma migrate deploy && node dist/main.js`)
# was removed during the deployment review over a suspected race between
# concurrent container starts. That concern was unfounded: Prisma's schema engine
# takes a Postgres advisory lock (`SELECT pg_advisory_lock(72707369)`) before
# applying anything, so concurrent migrations queue rather than collide. Boot
# migration is therefore safe at any instance count, and it is the only option on
# a tier with no pre-deploy hook.
#
# The app also refuses to start when the schema does not match the code, so a
# migration that cannot be applied fails the deploy loudly instead of serving
# traffic against the wrong schema. Set MIGRATE_ON_BOOT=0 to leave migrations to
# a pre-deploy command or a one-off job instead.
CMD ["node", "dist/main.js"]
