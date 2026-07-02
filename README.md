# FrontCore / FrontRest IA

Base SaaS reutilizável **FrontCore** + primeiro produto **FrontRest IA**.
Monorepo: Next.js 15 · NestJS · Prisma · PostgreSQL · Redis · MinIO · Docker Compose.

Ver `docs/ARCHITECTURE.md`, `docs/PHASES.md` e `docs/DEPLOY-COOLIFY.md`.

## Arranque local

```bash
corepack enable
corepack prepare pnpm@9.12.0 --activate
cp .env.example .env
pnpm install
docker compose up -d --build
pnpm db:build
pnpm db:migrate --name init
```

## Fase 2 — Auth & Multi-tenant

### Fluxo
- **Registo** (`POST /api/auth/register`): cria organização + utilizador
  (role `OWNER`) + devolve `accessToken`/`refreshToken`.
- **Login** (`POST /api/auth/login`): autentica contra a primeira
  organização do utilizador.
- **Refresh** (`POST /api/auth/refresh`): roda o refresh token (revoga o
  antigo, emite novo par).
- **Logout** (`POST /api/auth/logout`): revoga o refresh token.
- **Perfil** (`GET /api/auth/me`, protegido): identidade + organização
  atual, a partir do access token.

### Tokens
- Access token: JWT assinado (`JWT_ACCESS_SECRET`), TTL curto (`JWT_ACCESS_TTL`,
  segundos). Payload: `userId`, `organizationId`, `role`, `isSuperAdmin`.
- Refresh token: valor opaco aleatório, guardado em BD apenas como hash
  (SHA-256) — nunca em texto simples. Permite revogação imediata e rotação.

### Multi-tenant
Todas as rotas protegidas exigem um access token válido; o `organizationId`
vem embutido no token e é a base do isolamento por tenant. `@Roles('ADMIN')`
etc. exige role mínima; `isSuperAdmin` faz bypass.

### Seeds
```bash
pnpm db:seed
```
Cria organização `frontrest-demo` e utilizador `owner@frontrest.dev` /
`ChangeMe123!` (role `OWNER`).

### Frontend
`/login`, `/register`, `/dashboard` (protegido, consome `/auth/me`). Sessão
guardada em `localStorage` (`frontrest.session`): `accessToken`,
`refreshToken`, `user`, `organization`, `role`.

### Testar
```bash
curl http://localhost:3001/api/auth/me                  # 401 sem token

curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@teste.pt","password":"password123","name":"Demo","organizationName":"Demo Org"}'

curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@teste.pt","password":"password123"}'

curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer <accessToken>"
```
