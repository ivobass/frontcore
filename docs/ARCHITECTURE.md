# Arquitetura — FrontCore & FrontRest IA

## Visão

**FrontCore** é a base tecnológica reutilizável da FrontWeb para construir
múltiplos produtos SaaS. É **independente do domínio de negócio**.

**FrontRest IA** é o primeiro produto construído sobre o FrontCore (gestão
financeira e operacional de restaurantes). Produtos futuros (FrontClinic,
FrontHotel, FrontGym, FrontOffice, FrontRetail) reutilizam o FrontCore **sem
alterações**.

## Regra de ouro

- `packages/*` = FrontCore. **Zero lógica de domínio.**
- `apps/frontrest/*` = produto. **Toda** a lógica de restaurantes vive aqui.
- Nenhum package importa nada de `apps/`. Os apps importam packages.

## Packages (FrontCore)

| Package                  | Responsabilidade (genérica)                          | Estado Fase 1 |
|--------------------------|------------------------------------------------------|---------------|
| `@frontcore/config`      | Env helpers, tsconfig base                            | ativo         |
| `@frontcore/shared`      | Tipos/utils genéricos (Result, paginação, health)    | ativo         |
| `@frontcore/database`    | Prisma client + schema core (Org/User/Membership)    | ativo         |
| `@frontcore/auth`        | Contratos de auth (JWT/refresh)                      | contrato      |
| `@frontcore/storage`     | Contrato de storage S3                               | contrato      |
| `@frontcore/ai`          | Contrato de provider de IA                           | contrato      |
| `@frontcore/notifications` | Contrato de notificações                           | contrato      |
| `@frontcore/monitoring`  | Helpers de health/observabilidade                    | ativo         |
| `@frontcore/ui`          | Design system base (tokens + cn)                     | ativo         |

> "contrato" = na Fase 1 expõe apenas tipos/interfaces de fronteira. A
> implementação concreta entra na fase indicada, sem quebrar consumidores.

## Apps (FrontRest)

| App                    | Stack       | Porta | Estado Fase 1            |
|------------------------|-------------|-------|--------------------------|
| `@frontrest/api`       | NestJS      | 3001  | health + prisma          |
| `@frontrest/web`       | Next.js 15  | 3000  | página de estado         |
| `@frontrest/workers`   | NestJS std. | —     | estrutura (Fase 6)       |

## Multi-tenancy

Row-level por `organizationId` (shared schema). Os modelos core
(`Organization`, `User`, `Membership`) vivem no FrontCore. Modelos de domínio
do produto referenciam `organizationId`. O isolamento por guard/middleware
central entra na Fase 2.

## Fluxo de dados (Fase 1)

```
web (Next.js) ──HTTP /api──> api (NestJS) ──Prisma──> PostgreSQL
                                  │
                                  └── (Redis / MinIO disponíveis, uso real Fases 5/6)
```
