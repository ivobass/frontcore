# ---------- Base ----------
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable
WORKDIR /app

# ---------- Build ----------
FROM base AS build
# NEXT_PUBLIC_* tem de existir em BUILD TIME (é inlined no bundle).
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @frontrest/web... build

# ---------- Runtime ----------
FROM base AS runtime
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app

# Output "standalone" do Next (monorepo): server.js + node_modules tracados.
COPY --from=build /app/apps/frontrest/web/.next/standalone ./
COPY --from=build /app/apps/frontrest/web/.next/static ./apps/frontrest/web/.next/static

EXPOSE 3000
CMD ["node", "apps/frontrest/web/server.js"]
