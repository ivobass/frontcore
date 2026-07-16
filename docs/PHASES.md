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
  Document Extraction Foundation — motor genérico
  `runDocumentExtractors()`/`DocumentExtractor<TField,TValue>`
  extraído do parsing fiscal para `apps/frontrest/api/src/document-extraction/`
  (novo módulo, não um package), preparando — sem implementar — a
  coexistência futura de extractors regex/IA/modelo local/modelo cloud;
  `fiscal-parsing/` passa a consumidor fino desse motor, sem nenhuma
  alteração de comportamento observável (`FiscalExtractionResult`,
  `GET .../fiscal-parsing` inalterados); nenhum fornecedor de IA
  implementado — Fase 6.10
  (`docs/phases/phase-6.10-document-extraction-foundation.md`;
  `docs/adr/0007-document-extraction-foundation.md`).
  AI Provider Foundation — `@frontcore/ai` (existia só como contrato de
  um ficheiro, zero consumidores) transformado em package operacional:
  `AiCompletionProvider`/`AiConfig`/`AiMessage` normalizados,
  `loadAiConfig()`, `createAiProvider()` (mesma fábrica de
  `createOcrProvider()`), `MockAiProvider` (sem credenciais) e
  `OllamaAiProvider` — primeiro provider real, local (sem custo por
  pedido, sem API key cloud, sem internet obrigatória), sobre a API
  HTTP nativa do Ollama (`POST /api/chat`, confirmado contra um
  servidor real, não o endpoint OpenAI-compatible) via `fetch` nativo
  (sem SDK, sem dependência nova) — timeout real via `AbortController`,
  erros sanitizados via `AiProviderError`; nenhum extractor de IA
  criado, nenhuma alteração ao parsing fiscal, OCR, Worker,
  `InvoiceDraft` ou frontend; OpenAI/Anthropic ficam para uma fase
  futura sobre o mesmo contrato — Fase 6.11
  (`docs/phases/phase-6.11-ai-provider-foundation.md`).
  OCR & Fiscal Parsing Stabilization — auditoria e correção do trabalho
  de estabilização acumulado fora do âmbito declarado da Fase 6.11
  (pré-processamento de imagem OCR, normalização de texto, hardening
  de extractors): `TaxNumberExtractor` deixa de confundir o NIF do
  cliente com o do fornecedor (rótulo "Contribuinte" reconhecido,
  dígito de controlo do NIF português validado, `matchAll` em vez de
  só a 1ª ocorrência); nova verificação de coerência entre campos
  (`dueDate >= issueDate`, a primeira deste tipo — impossível dentro
  de um único extractor por desenho); `SuppliersService` impede NIF
  duplicado na mesma organização; ferramenta de diagnóstico
  `/invoice-drafts/debug` auditada (autenticação, isolamento por
  organização, tratamento de estados incompletos); nenhum consumidor
  de IA criado, nenhum package novo — Fase 6.12
  (`docs/phases/phase-6.12-ocr-fiscal-parsing-stabilization.md`).
  Document Regression Test Suite — `fiscal-parsing.regression.spec.ts`,
  Jest nativo (`describe.each`), protege `ocrText → FiscalExtractionResult`
  contra regressões usando 13 documentos reais + 2 sintéticos, cada um
  num ficheiro `.txt` isolado com uma razão documentada
  (`apps/frontrest/api/src/fiscal-parsing/__fixtures__/`); `expected`
  é sempre a baseline atual confirmada, nunca o ideal; nenhum extractor,
  contrato ou teste existente alterado — Fase 6.13
  (`docs/phases/phase-6.13-document-regression-test-suite.md`).
- **Fase 7 — Financial Dashboard Foundation**: `GET /dashboard/financial-summary`
  (`apps/frontrest/api/src/dashboard/`), agregações Prisma
  (`aggregate`/`groupBy`) só sobre `Invoice` confirmadas (nunca
  `InvoiceDraft`), isoladas por organização, `issueDate` como dimensão
  temporal, `CANCELLED` excluído dos totais ativos mas contado à parte;
  período `from`/`to` opcional (ISO `YYYY-MM-DD`, omisso → mês atual),
  limites sempre em UTC, validado contra formato/`from > to`/calendário
  impossível; montantes como string (`Decimal`, sem perda de precisão);
  `/dashboard` transformado num dashboard financeiro real — cards,
  resumo por estado, evolução mensal, distribuição por categoria,
  principais fornecedores — com barras HTML/CSS (sem biblioteca
  gráfica nova), datas em `pt-PT` via `lib/format.ts` já existente (sem
  formatador novo); sem package novo, sem migration, sem alteração ao
  fluxo Upload→Draft→OCR→Parsing→Review→Promote — Fase 7
  (`docs/phases/phase-7-financial-dashboard-foundation.md`).
- **Fase 8 — AI Chat Foundation**: primeiro consumidor real de
  `@frontcore/ai` — fundação de chat (persistência, histórico,
  isolamento por tenant e por utilizador, providers atrás de injeção),
  não um assistente financeiro especializado. Modelos
  `AiConversation`/`AiMessage` (sempre organização E utilizador, nunca só
  um dos dois; sem `title`, sem eliminação nesta fase), `POST /ai/chat`
  (`apps/frontrest/api/src/ai/`) que cria/continua conversa, persiste
  `USER`, chama `AiCompletionProvider` atrás de injeção
  (`AI_COMPLETION_PROVIDER`, nunca `OllamaAiProvider` diretamente),
  persiste `ASSISTANT` (`provider`/`model`/`usage` quando disponíveis);
  `AiTenantContextService` reutiliza `DashboardService` (Fase 7)
  diretamente em processo — sem pedido HTTP interno, sem duplicar
  queries — como mecanismo arquitetural de contexto por tenant, pequeno,
  read-only, reconstruído em cada pedido, limitado ao mês atual, sem
  expandir o âmbito funcional da fase; histórico limitado
  (`AI_CHAT_HISTORY_LIMIT`) e reordenado cronologicamente antes do
  provider; falhas do provider mapeadas para HTTP sanitizado (nunca a
  mensagem bruta do Ollama), mensagem do utilizador sempre preservada,
  nunca uma resposta falsa; `GET /ai/conversations` isolado por
  organização e utilizador (conversa de outro tenant/utilizador tratada
  como inexistente); `/ai/chat` no frontend (lista + thread); validado
  com `AI_PROVIDER=mock` e com Ollama real — sem streaming, tools, RAG,
  embeddings, provider cloud, eliminação de conversa ou package novo
  (`docs/phases/phase-8-ai-chat-foundation.md`).
- **Fase 9 — Monthly Financial Reports & Export Foundation**:
  `GET /reports/monthly` (JSON/CSV/PDF, `apps/frontrest/api/src/reports/`)
  — relatório de um mês, comparação com o mês anterior, detalhe das
  faturas do período (inclui `CANCELLED`, distinguível pelo estado);
  `ReportsService` reutiliza exclusivamente a API pública de
  `DashboardService` (Fase 7) para todas as agregações — nunca duplica
  queries financeiras, nunca conhece os seus métodos privados; `month.util.ts`
  reutiliza `resolvePeriod()` para a validação/UTC, sem a duplicar;
  comparação sem `Infinity`/`NaN` por construção
  (`percentageChange: null` quando o período anterior é zero, calculada
  antes de qualquer divisão); exportação CSV escrita à mão (delimitador
  `;`, BOM UTF-8, mitigação CSV injection) e PDF via PDFKit (sem
  Chromium, sem dependências nativas) — JSON/CSV/PDF derivam sempre do
  mesmo `MonthlyFinancialReport`; `/reports` no frontend (seleção de
  mês, resumo, comparação, tabela de faturas, exportação); sem
  persistência de relatórios, sem package novo, sem migration, sem
  alteração a Dashboard ou AI Chat
  (`docs/phases/phase-9-monthly-financial-reports-export-foundation.md`).
- **Fase 10 — Admin & operação**: painel admin, gestão, activity logs,
  métricas, health dashboard, deploy Coolify.

> Regra: não avançar de fase sem aprovação. Não refazer. Não tocar em ficheiros
> fora da fase atual.
