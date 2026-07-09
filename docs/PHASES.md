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
- **Fase 4 — Fornecedores e despesas**: API completa — modelos `Supplier`,
  `ExpenseCategory`, `Invoice`, `InvoiceItem`
  (`packages/database/prisma/schema.prisma`), CRUD protegido por
  organização e role (`MANAGER+` para escrita) em
  `apps/frontrest/api/src/{suppliers,expense-categories,invoices}/`,
  listagem paginada (`@frontcore/shared`) — Fase 4.1. Frontend com CRUD
  completo (criar/editar/eliminar) para as 3 entidades — `/suppliers`,
  `/expense-categories`, `/invoices` — em `apps/frontrest/web` — Fase 4.2
  (`docs/phases/phase-4.2-frontend-crud.md`). Testes automatizados do
  backend (unitários + e2e, `apps/frontrest/api`) — Fase 4.4
  (`docs/phases/phase-4.4-backend-tests.md`).
- **Fase 5 — Upload & MinIO**: upload PDF/imagem, storage, files, URLs
  assinados, validação, segurança por organização. `@frontcore/storage`
  concretizado sobre MinIO/S3 (`S3ObjectStorage`, `getDownloadUrl`,
  configuração via ambiente) — Fase 5.1
  (`docs/phases/phase-5.1-upload-storage-foundation.md`). Primeiro
  consumidor real — `UploadsController`/`UploadsService`
  (`apps/frontrest/api/src/uploads/`), modelo `StorageObject`, endpoints
  `POST`/`GET`/`DELETE /uploads` — Fase 5.2
  (`docs/phases/phase-5.2-upload-api-foundation.md`). Migration de
  `StorageObject` aplicada e fluxo real (upload/download/delete,
  isolamento por organização) validado contra PostgreSQL/MinIO reais em
  2026-07-08. Primeiro consumidor de domínio — `Invoice` ganha anexos
  genéricos via `InvoiceAttachment` (`invoices/attachments/`), reutiliza
  `UploadsService` por inteiro, migration própria aplicada e validada
  ponta a ponta (incluindo isolamento e proteção contra eliminação
  indevida via FK Restrict) — Fase 5.3
  (`docs/phases/phase-5.3-invoice-attachments.md`). Fundação frontend —
  componentes genéricos de upload em `@frontcore/ui`
  (`components/forms/upload/`) e painel de anexos por fatura em
  `apps/frontrest/web` (`invoice-attachments-panel.tsx`), consumindo a
  API da Fase 5.3 sem alterações a backend/Prisma — Fase 5.4
  (`docs/phases/phase-5.4-upload-frontend-foundation.md`; validação
  manual no browser pendente). `getUploadUrl()` e upload direto do
  browser continuam por fazer.
- **Fase 6 — Worker OCR**: BullMQ, worker-ocr, estados, OCR mock → provider real.
- **Fase 7 — Dashboard financeiro**: agregações, cards, gráficos.
- **Fase 8 — Chat IA**: ai_conversations, ai_messages, /ai/chat, contexto por
  tenant, segurança anti-fuga.
- **Fase 9 — Relatórios**: mensal, export PDF/CSV, comparação.
- **Fase 10 — Admin & operação**: painel admin, gestão, activity logs,
  métricas, health dashboard, deploy Coolify.

> Regra: não avançar de fase sem aprovação. Não refazer. Não tocar em ficheiros
> fora da fase atual.
