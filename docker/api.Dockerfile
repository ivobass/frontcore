# ---------- Base ----------
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable
WORKDIR /app

# ---------- Build ----------
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile

# Gera o Prisma Client (output customizado: escreve para
# packages/database/src/generated/prisma — ver schema.prisma) e compila
# @frontcore/database. O script "build" do package copia o Client gerado
# para dist/generated, tornando-o parte normal do output do package.
# Isto é o que resolve definitivamente o problema de fundo: "pnpm deploy"
# reconstrói node_modules a partir do lockfile e NÃO preserva efeitos de
# "prisma generate" corridos numa árvore node_modules anterior (por isso o
# Client, gerado no default node_modules/.prisma, desaparecia no deploy).
# Ao viver dentro de dist/ como ficheiro normal do package, o deploy
# copia-o como copia qualquer outro ficheiro — sem exceções, sem CLI em prod.
RUN pnpm --filter @frontcore/database build

# Compila a API do produto (depende do @frontcore/database já gerado/compilado).
RUN pnpm --filter @frontrest/api... build

# Diretório de produção isolado. dist/generated/prisma (Client + engine
# binário) já é parte de @frontcore/database e chega intacto a /prod/api,
# porque "files": ["dist","prisma"] no package.json inclui todo o dist/.
# Não há nenhum passo de "prisma generate" depois disto — não é necessário
# nem desejável: o Client já é código+binário estático, e o CLI "prisma"
# (devDependency) é removido de propósito por "--prod".
RUN pnpm --filter @frontrest/api deploy --prod /prod/api

# ---------- Runtime ----------
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /prod/api ./
EXPOSE 3001
CMD ["node", "dist/main.js"]
