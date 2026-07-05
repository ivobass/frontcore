# FrontCore Developer Guide

Version: 1.1

## Objetivo

Este documento é o guia rápido para qualquer pessoa ou agente de IA começar a trabalhar no FrontCore sem depender do histórico dos chats.

## Leitura inicial obrigatória

Antes de trabalhar no projeto, ler `docs/INDEX.md` — é o ponto de entrada
único e mantém a ordem de leitura atualizada, para não haver uma segunda
lista aqui a divergir dela (ver `docs/adr/0006-documentation-architecture.md`).

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

A divisão de responsabilidades entre assistentes de IA está definida em
`docs/ai/AI_GOVERNANCE.md` ("Estrutura da equipa") — não repetida aqui,
para evitar as duas descrições divergirem. A ferramenta não interessa
tanto como o workflow: todas devem seguir `docs/ai/AI_WORKFLOW.md`.

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
