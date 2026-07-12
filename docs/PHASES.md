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
- **Fase 6 — Worker OCR**: BullMQ, worker-ocr, estados, OCR mock → provider
  real. Foundation técnica — `apps/frontrest/workers` passa a app NestJS
  standalone real (sem HTTP), novo package `@frontcore/queue`
  (contrato/config/provider BullMQ-Redis, genérico), `PrismaModule`
  partilhado movido para `@frontcore/database` (deixa de estar duplicado
  entre apps), fila `ocr-processing` com consumidor mock validado ponta a
  ponta contra Redis real — sem nenhum motor OCR, provider ou lógica de
  IA — Fase 6.1 (`docs/phases/phase-6.1-ocr-worker-foundation.md`). Pipeline
  de OCR extensível — novo package `@frontcore/ocr` (contrato `OCRProvider`,
  `OCRResult` normalizado, `OCRService`, provider `Tesseract` real via
  `tesseract.js`, seleção por `OCR_PROVIDER`), `ObjectStorage` ganha `get()`
  (leitura direta servidor→servidor, extensão de `@frontcore/storage`),
  Worker atualizado para o fluxo completo (obter ficheiro → extrair texto →
  registar resultado) — sem parsing de campos, sem extração fiscal, sem IA —
  Fase 6.2 (`docs/phases/phase-6.2-ocr-pipeline-foundation.md`). Fundação de
  faturas em rascunho — novo modelo `InvoiceDraft` (`packages/database`),
  entidade deliberadamente separada de `Invoice` (sem `status = DRAFT`,
  sem alterar a nullability/contrato de `Invoice` existente), CRUD próprio
  em `apps/frontrest/api/src/invoices/drafts/` (`/invoices/drafts`) e
  promoção transacional explícita a `Invoice` + `InvoiceAttachment` — sem
  parsing fiscal, sem o Worker OCR a escrever no draft ainda — Fase 6.3
  (`docs/phases/phase-6.3-invoice-draft-foundation.md`). Integração OCR →
  InvoiceDraft — criação automática de job após criação do draft,
  contrato de job partilhado e persistência de `ocrText` e
  `ocrConfidence` pelo Worker, mantendo parsing fiscal e extração
  estruturada fora do âmbito — Fase 6.4
  (`docs/phases/phase-6.4-ocr-draft-integration-foundation.md`). Retry &
  Recovery — backoff exponencial nativo do BullMQ na publicação do job
  OCR, contagem de tentativas exposta pela abstração de filas
  (`JobAttemptInfo`, sem contagem paralela), novo `OcrStatus`
  (`PENDING`/`PROCESSING`/`COMPLETED`/`FAILED`) e `ocrError` sanitizado
  no `InvoiceDraft` distinguindo falha temporária de falha permanente —
  sem Dead Letter Queue, sem endpoint de retry manual, sem novos
  providers OCR — Fase 6.5
  (`docs/phases/phase-6.5-ocr-retry-recovery-foundation.md`). Fiscal
  Parsing & Structured Extraction — novo módulo `fiscal-parsing` em
  `apps/frontrest/api` (não um package — lógica de domínio), pipeline
  de 9 extractors determinísticos (regex/heurísticas, sem IA/LLM) que
  transforma `ocrText` num modelo normalizado
  (`FiscalExtractionResult`: fornecedor, NIF, cliente, número/datas/
  moeda da fatura, totais, IVA), cada campo com confiança e origem
  próprias — sem integração com `InvoiceDraft`, sem endpoint, sem
  regras por país implementadas (arquitetura preparada para ambos) —
  Fase 6.6 (`docs/phases/phase-6.6-fiscal-parsing-foundation.md`). Draft
  Integration Foundation — primeiro consumidor real de
  `FiscalParsingService`: `GET /invoices/drafts/:id/fiscal-parsing`
  executa o pipeline sobre o `ocrText` já persistido e devolve o
  `FiscalExtractionResult`, síncrono, sem persistência automática, sem
  tocar no Worker/filas/schema/promoção — Fase 6.7
  (`docs/phases/phase-6.7-fiscal-parsing-draft-integration-foundation.md`).
  Invoice Draft Review UI — primeiro consumidor frontend completo de
  `InvoiceDraft` (`apps/frontrest/web`, rota `/invoice-drafts`): upload →
  criação do rascunho → acompanhamento do OCR (polling local) → consulta
  do parsing fiscal (automática, nunca aplicada/persistida sem ação
  explícita) → revisão/correção humana → gravação (`PATCH` só com
  campos alterados) → promoção explícita a `Invoice`; correção do
  contrato `PATCH` do rascunho para distinguir campo ausente de campo
  `null`; `MEMBER` em modo de leitura, `MANAGER+` com formulário
  completo — Fase 6.8
  (`docs/phases/phase-6.8-invoice-draft-review-ui-foundation.md`).
  PDF Rasterization — `PdfRasterizer` (Poppler, `pdfinfo`/`pdftoppm`)
  novo em `@frontcore/ocr`: PDF (incluindo multipágina) rasterizado
  para PNG e processado pelo `TesseractProvider` existente, página a
  página, sem paralelismo; `TesseractProvider` continua só com
  JPEG/PNG, o Worker continua a só conhecer `OCRService`; `poppler-utils`
  só na imagem Docker do Worker; limites de páginas/DPI/dimensão/timeout
  configuráveis; validado ponta-a-ponta com Docker real (PDF de 1
  página, multipágina, acima do limite, corrompido, protegido,
  concorrência) — Fase 6.9
  (`docs/phases/phase-6.9-pdf-rasterization-foundation.md`).
- **Fase 7 — Dashboard financeiro**: agregações, cards, gráficos.
- **Fase 8 — Chat IA**: ai_conversations, ai_messages, /ai/chat, contexto por
  tenant, segurança anti-fuga.
- **Fase 9 — Relatórios**: mensal, export PDF/CSV, comparação.
- **Fase 10 — Admin & operação**: painel admin, gestão, activity logs,
  métricas, health dashboard, deploy Coolify.

> Regra: não avançar de fase sem aprovação. Não refazer. Não tocar em ficheiros
> fora da fase atual.
