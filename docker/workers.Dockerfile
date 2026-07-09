# ---------- Base ----------
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable
WORKDIR /app

# ---------- Build ----------
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile

# Mesma razão do docker/api.Dockerfile: o Prisma Client é gerado com output
# customizado dentro do próprio package e só chega a produção como parte
# normal do dist/ desse package — ver comentário lá para o detalhe completo.
RUN pnpm --filter @frontcore/database build

# Compila o worker do produto (depende de @frontcore/database e
# @frontcore/queue já gerados/compilados).
RUN pnpm --filter @frontrest/workers... build

# Diretório de produção isolado — mesmo padrão de docker/api.Dockerfile.
RUN pnpm --filter @frontrest/workers deploy --prod /prod/workers

# ---------- Runtime ----------
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /prod/workers ./
# Sem EXPOSE — processo standalone, sem servidor HTTP (ver
# apps/frontrest/workers/README.md).
CMD ["node", "dist/main.js"]
