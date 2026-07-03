# FrontCore Developer Guide

Version: 1.0

## Objetivo

Este documento é o guia rápido para qualquer pessoa ou agente de IA começar a trabalhar no FrontCore sem depender do histórico dos chats.

## Leitura inicial obrigatória

Antes de trabalhar no projeto, ler:

1. `README.md`
2. `docs/AI_WORKFLOW.md`
3. `docs/PROJECT_STRUCTURE.md`
4. `docs/ARCHITECTURE.md`
5. `docs/PHASES.md`
6. ADRs relevantes em `docs/adr/`

## Visão rápida

FrontCore é uma base SaaS reutilizável.

FrontRest IA é o primeiro produto construído sobre essa base.

A arquitetura deve permitir que no futuro existam outros produtos, como FrontClinic, FrontGym, FrontHotel, FrontOffice ou FrontRetail, sem reescrever o core.

## Regra de ouro

```text
packages/* = FrontCore genérico
apps/frontrest/* = produto FrontRest IA
```

Packages não importam apps.
Apps podem importar packages.

## Stack principal

- Monorepo com pnpm workspaces
- Next.js para frontend
- NestJS para API
- Prisma para base de dados
- PostgreSQL
- Redis
- MinIO
- Docker Compose
- TypeScript

## Arranque local

Ver comandos atualizados em `README.md`.

Fluxo base:

```bash
corepack enable
corepack prepare pnpm@9.12.0 --activate
cp .env.example .env
pnpm install
docker compose up -d --build
pnpm db:build
pnpm db:migrate --name init
```

## Como trabalhar numa fase

1. Confirmar fase atual.
2. Ler documentação da fase.
3. Identificar ficheiros permitidos.
4. Fazer análise.
5. Propor plano.
6. Esperar aprovação.
7. Implementar apenas o aprovado.
8. Validar.
9. Documentar o encerramento.

## Papel das IAs

### ChatGPT

Usar para:

- arquitetura
- revisão técnica
- planeamento
- documentação
- análise de riscos
- preparação de prompts

### Claude/Codex/outros agentes

Usar para:

- implementação controlada
- refactors pequenos
- geração de ficheiros
- execução de tarefas técnicas específicas

A ferramenta não interessa tanto como o workflow. Todas devem seguir `docs/AI_WORKFLOW.md`.

## Critério para mexer em código

Antes de alterar código, deve estar claro:

- qual é o objetivo
- quais ficheiros serão tocados
- o que está fora do escopo
- como validar
- como reverter se necessário

## Regra de simplicidade

Não complicar a arquitetura antes de haver necessidade real.

O FrontCore deve crescer por fases controladas, não por entusiasmo técnico.
