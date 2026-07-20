# FrontCore / FrontRest IA

Base SaaS reutilizável **FrontCore** + primeiro produto **FrontRest IA**.

Monorepo baseado em:

- Next.js 15
- NestJS
- Prisma
- PostgreSQL
- Redis
- MinIO
- Docker Compose

---

# Visão

**FrontCore** é a plataforma SaaS reutilizável da FrontWeb.

**FrontRest IA** é o primeiro produto desenvolvido sobre essa plataforma.

Toda a arquitetura foi desenhada para permitir a criação de novos produtos, como:

- FrontClinic
- FrontGym
- FrontHotel
- FrontRetail
- FrontOffice

reutilizando o mesmo core sem alterações estruturais.

---

# Estrutura do projeto

```text
frontcore/
│
├── apps/          → Produtos
├── packages/      → Core reutilizável
├── docs/          → Documentação técnica
└── docker/        → Infraestrutura
```

---

# Documentação principal

Consultar primeiro:

- `docs/ARCHITECTURE.md`
- `docs/PHASES.md`
- `docs/DEPLOY-COOLIFY.md`

---

# Documentação de engenharia

Antes de trabalhar no projeto, qualquer programador ou agente de IA deve começar por `docs/INDEX.md` — ponto de entrada único e ordem de leitura oficial (ver `docs/adr/0006-documentation-architecture.md`).

Estes documentos definem o workflow oficial do FrontCore e devem prevalecer sobre o contexto de qualquer conversa.

---

# Arranque local

```bash
corepack enable
corepack prepare pnpm@9.12.0 --activate

cp .env.example .env

pnpm install

docker compose up -d --build

pnpm db:build
pnpm db:migrate --name init
```

---

# Fase 2 — Auth & Multi-tenant

## Fluxo

- **Registo** (`POST /api/auth/register`)
  - cria organização
  - cria utilizador OWNER
  - devolve Access Token + Refresh Token

- **Login** (`POST /api/auth/login`)
  - autentica o utilizador

- **Refresh**
  - roda o Refresh Token
  - invalida o anterior

- **Logout**
  - revoga o Refresh Token

- **Perfil**
  - `/api/auth/me`

---

## Tokens

### Access Token

JWT assinado.

Payload:

- userId
- organizationId
- role
- isSuperAdmin

TTL configurável.

### Refresh Token

- valor aleatório
- armazenado apenas como SHA-256
- permite rotação
- permite revogação imediata

---

## Multi-tenancy

Todas as rotas protegidas utilizam o `organizationId`
presente no Access Token.

O isolamento é feito por organização.

`isSuperAdmin` faz bypass das roles.

---

## Seeds

```bash
pnpm db:seed
```

Cria:

```
Organização:
frontrest-demo

Utilizador:
owner@frontrest.dev

Password:
ChangeMe123!
```

---

## Frontend

Existem atualmente:

- `/login`
- `/register`
- `/dashboard`

A sessão é guardada em:

```
localStorage

frontrest.session
```

Campos:

- accessToken
- refreshToken
- user
- organization
- role

---

# Testes rápidos

```bash
curl http://localhost:3001/api/auth/me
```

```bash
curl -X POST http://localhost:3001/api/auth/register \
-H "Content-Type: application/json" \
-d '{"email":"demo@teste.pt","password":"password123","name":"Demo","organizationName":"Demo Org"}'
```

```bash
curl -X POST http://localhost:3001/api/auth/login \
-H "Content-Type: application/json" \
-d '{"email":"demo@teste.pt","password":"password123"}'
```

```bash
curl http://localhost:3001/api/auth/me \
-H "Authorization: Bearer <accessToken>"
