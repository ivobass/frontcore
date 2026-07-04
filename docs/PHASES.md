# Plano de fases — FrontRest IA sobre FrontCore

- **Fase 1 — Fundação técnica** *(esta entrega)*: monorepo, FrontCore base,
  docker-compose (Postgres/Redis/MinIO), API NestJS + health, Next.js 15,
  Prisma schema core, healthchecks. Preparado para Coolify e Cloudflare.
- **Fase 2 — Auth & multi-tenant**: users, organizations, memberships, JWT +
  refresh, login/register/logout, guards, proteção por organização, seeds.
- **Fase 3 — UI base**: layout, sidebar, topbar, dark/light, login/registo,
  dashboard vazio, shadcn/ui. *(O Design System que sustenta esta fase é
  desenvolvido em subfases próprias — 3.1 a 3.x — documentadas em
  `docs/phases/` e `docs/adr/`, com numeração distinta desta lista.)*
- **Fase 4 — Fornecedores e despesas**: suppliers, invoices, invoice_items,
  categories, CRUD, filtros.
- **Fase 5 — Upload & MinIO**: upload PDF/imagem, storage, files, URLs
  assinados, validação, segurança por organização.
- **Fase 6 — Worker OCR**: BullMQ, worker-ocr, estados, OCR mock → provider real.
- **Fase 7 — Dashboard financeiro**: agregações, cards, gráficos.
- **Fase 8 — Chat IA**: ai_conversations, ai_messages, /ai/chat, contexto por
  tenant, segurança anti-fuga.
- **Fase 9 — Relatórios**: mensal, export PDF/CSV, comparação.
- **Fase 10 — Admin & operação**: painel admin, gestão, activity logs,
  métricas, health dashboard, deploy Coolify.

> Regra: não avançar de fase sem aprovação. Não refazer. Não tocar em ficheiros
> fora da fase atual.
