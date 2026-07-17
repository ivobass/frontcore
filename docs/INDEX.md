# FrontCore — Índice da Documentação Técnica

# Source of Truth

Este índice representa a documentação técnica oficial existente em
`frontcore/docs/`.

Qualquer IA, programador ou colaborador deve iniciar aqui a navegação
documental.

Toda a documentação referenciada neste índice prevalece sobre memória,
conversas anteriores ou suposições.

Nenhuma IA é considerada fonte de verdade.

A documentação oficial do projeto é a única Source of Truth.

A filosofia completa por trás desta regra, incluindo princípios e
estrutura da equipa, está em `docs/ai/AI_GOVERNANCE.md`.

---

## Âmbito deste índice

Índice oficial de toda a documentação técnica versionada com o código,
dentro de `frontcore/docs/`. **Não indexa** `FrontCore/docs/` (documentação
de produto, visão e negócio, fora do repositório git) — ver a separação
definida em `docs/PROJECT_STRUCTURE.md`.

Antes de criar ou alterar qualquer documento em `frontcore/docs/`,
atualizar este índice.

---

## Ordem de leitura obrigatória

Antes de qualquer tarefa técnica no FrontCore, ler nesta ordem:

1. `docs/INDEX.md` — este ficheiro, ponto de entrada.
2. `docs/ai/README.md` e os documentos que indexa — princípios, fluxo
   operacional, formato de resposta e de prompt.
3. `docs/ARCHITECTURE.md` — arquitetura geral do FrontCore.
4. `docs/PHASES.md` — fases do produto FrontRest.
5. ADRs relevantes em `docs/adr/` (ver tabela abaixo).
6. Documentação da fase atual em `docs/phases/`, quando existir.
7. `docs/quality/README.md`, quando a tarefa envolver `packages/ui`.
8. Ficheiros de código diretamente relacionados com a tarefa.

Nunca começar pela implementação. Nunca saltar os passos 1–2.

---

## Documentação obrigatória (governação de IA)

Consolidada em `docs/ai/` — ver `docs/ai/README.md` para o índice
completo e a ordem de leitura. Lista individual dos documentos na secção
"IA", abaixo.

---

## Índices

| Documento | Localização | Objetivo | Categoria | Estado | Relação com outros documentos |
|---|---|---|---|---|---|
| Índice da documentação | `docs/INDEX.md` | Este ficheiro — ponto de entrada único para localizar qualquer documento técnico | Índices | Ativo | Cobre todos os documentos deste ficheiro |
| Índice de IA | `docs/ai/README.md` | Mapa e ordem de leitura da documentação de IA | Índices | Ativo | `docs/ai/*` |
| Índice das ADRs | `docs/adr/README.md` | Lista e convenção de numeração das Architecture Decision Records | Índices | Ativo | `docs/adr/0001`–`0006` |
| Índice de fases | `docs/phases/README.md` | Regra de quando criar documentação detalhada por fase | Índices | Ativo | `docs/PHASES.md`, `docs/phases/*` |
| Índice de qualidade | `docs/quality/README.md` | Mapa dos standards de qualidade do Design System | Índices | Ativo | `docs/quality/*` |

## IA

| Documento | Localização | Objetivo | Categoria | Estado | Relação com outros documentos |
|---|---|---|---|---|---|
| AI Base Prompt | `docs/ai/AI_BASE_PROMPT.md` | Síntese acionável das regras permanentes — citável em qualquer prompt de fase | IA | Ativo | Condensa `AI_GOVERNANCE.md`, `AI_WORKFLOW.md`, `CODING_STANDARDS.md`, `GIT_WORKFLOW.md`, `AI_DOCUMENTATION.md` |
| AI Governance | `docs/ai/AI_GOVERNANCE.md` | Filosofia, princípios, Source of Truth, estrutura da equipa | IA | Ativo | Base para os restantes documentos de `docs/ai/` |
| AI Workflow | `docs/ai/AI_WORKFLOW.md` | Fluxo operacional obrigatório para qualquer IA | IA | Ativo | Aplica os princípios de `AI_GOVERNANCE.md`; checklist de validação vive em `AI_RELEASE_CHECKLIST.md` |
| AI Response Format | `docs/ai/AI_RESPONSE_FORMAT.md` | Formato normalizado de resposta (Trabalho/Arquitetura/Revisão/Implementação) | IA | Ativo | Usado por `AI_WORKFLOW.md`; esqueletos em `docs/ai/templates/` |
| AI Prompt Standard | `docs/ai/AI_PROMPT_STANDARD.md` | Formato normalizado de pedido (lado do utilizador) | IA | Ativo | Espelha `AI_RESPONSE_FORMAT.md`; instância para fases em `AI_PHASE_TEMPLATE.md` |
| AI Phase Template | `docs/ai/AI_PHASE_TEMPLATE.md` | Formulário reutilizável para pedir uma fase nova | IA | Ativo | Instância de `AI_PROMPT_STANDARD.md`; irmão de `docs/ai/templates/phase-closure.md` |
| AI Review Checklist | `docs/ai/AI_REVIEW_CHECKLIST.md` | Checklist arquitetural geral para revisão (arquitetura, SOLID, acoplamento, testes, ...) | IA | Ativo | Irmã de `AI_QUALITY_REVIEW.md` (essa é específica de `packages/ui`) |
| AI Release Checklist | `docs/ai/AI_RELEASE_CHECKLIST.md` | Checklist canónica de validação e encerramento de fase | IA | Ativo | Substitui o conteúdo antes disperso em `AI_WORKFLOW.md`/`GIT_WORKFLOW.md`/`RELEASE_PROCESS.md` |
| AI Prompt Guide | `docs/ai/AI_PROMPT_GUIDE.md` | Como usar o framework de prompts (Base Prompt/Phase Template/Review/Release Checklist), com exemplos | IA | Ativo | Referencia todos os documentos da camada "Prompt Kit" |
| AI Documentation | `docs/ai/AI_DOCUMENTATION.md` | Regras de como escrever e localizar documentação | IA | Ativo | Consolida regras antes em `AI_GOVERNANCE.md`/`AI_WORKFLOW.md` |
| AI Quality Review | `docs/ai/AI_QUALITY_REVIEW.md` | Checklist de revisão de IA específico de `packages/ui` | IA | Ativo | Complementa `AI_WORKFLOW.md`; referencia `docs/quality/`; irmã de `AI_REVIEW_CHECKLIST.md` |

## ADRs

| Documento | Localização | Objetivo | Categoria | Estado | Relação com outros documentos |
|---|---|---|---|---|---|
| ADR-0001 | `docs/adr/0001-design-system-location.md` | Componentes reutilizáveis vivem em `packages/ui`, não em `apps/*` | ADRs | Aceite | Base para ADR-0002, ADR-0003, ADR-0005 |
| ADR-0002 | `docs/adr/0002-ui-framework-agnostic.md` | `packages/ui` sem dependência direta de Next.js | ADRs | Aceite | Estende ADR-0001; irmã da ADR-0005 |
| ADR-0003 | `docs/adr/0003-ui-internal-structure.md` | Estrutura interna e categorização de `packages/ui/src` | ADRs | Aceite | Consome ADR-0001; usada por `docs/phases/*` |
| ADR-0004 | `docs/adr/0004-theme-engine-distribution.md` | Distribuição do Theme Engine (CSS vars + preset Tailwind) entre produtos | ADRs | Aceite | Depende dos tokens/theme (Fases 3.1/3.2) |
| ADR-0005 | `docs/adr/0005-ui-public-api-encapsulation.md` | `@frontcore/ui` como única API pública; Radix UI é detalhe interno | ADRs | Aceite | Estende ADR-0002; aplica-se à Fase 3.5 |
| ADR-0006 | `docs/adr/0006-documentation-architecture.md` | Arquitetura da documentação — `docs/ai/`, `docs/quality/`, critério para novas subpastas | ADRs | Aceite | Reorganiza `docs/AI_*.md` para `docs/ai/` |
| ADR-0007 | `docs/adr/0007-document-extraction-foundation.md` | Motor genérico de extração de documentos (`document-extraction/`), separado de `fiscal-parsing/`, contrato assíncrono, sem novo package | ADRs | Aceite | `docs/phases/phase-6.10-document-extraction-foundation.md` |

## Arquitetura

| Documento | Localização | Objetivo | Categoria | Estado | Relação com outros documentos |
|---|---|---|---|---|---|
| Arquitetura geral | `docs/ARCHITECTURE.md` | Visão e regras de arquitetura do FrontCore e do FrontRest | Arquitetura | Ativo | Base para todas as ADRs |
| Estrutura do projeto | `docs/PROJECT_STRUCTURE.md` | Organização oficial do repositório; separação `FrontCore/docs` vs `frontcore/docs` | Arquitetura | Ativo | Referenciado por `docs/ai/AI_WORKFLOW.md` |

## Workflow (processo, não governação de IA)

| Documento | Localização | Objetivo | Categoria | Estado | Relação com outros documentos |
|---|---|---|---|---|---|
| Git Workflow | `docs/GIT_WORKFLOW.md` | Uso de Git, mensagens de commit, tags | Workflow | Ativo | Usado por `docs/RELEASE_PROCESS.md`; regras de IA em `docs/ai/AI_WORKFLOW.md` |
| Coding Standards | `docs/CODING_STANDARDS.md` | Regras base para código no FrontCore | Workflow | Ativo | Aplica-se a `packages/*` e `apps/*` |

## Guias

| Documento | Localização | Objetivo | Categoria | Estado | Relação com outros documentos |
|---|---|---|---|---|---|
| Developer Guide | `docs/DEVELOPER_GUIDE.md` | Guia rápido para começar a trabalhar no FrontCore | Guias | Ativo | Aponta para `docs/INDEX.md`, `docs/PROJECT_STRUCTURE.md` |
| Deploy Coolify | `docs/DEPLOY-COOLIFY.md` | Deploy do FrontCore em Coolify | Guias | Ativo | Relacionado com `docker-compose.yml` |

## Fases

| Documento | Localização | Objetivo | Categoria | Estado | Relação com outros documentos |
|---|---|---|---|---|---|
| Fases do produto FrontRest | `docs/PHASES.md` | Plano de fases do produto FrontRest (Fase 1–10) — eixo de numeração distinto do Design System | Fases | Ativo | Não confundir com subfases 3.x nem com `FrontCore Roadmap.md` (plataforma) |
| Fase 3.3 — UI Foundation | `docs/phases/phase-3.3-ui-foundation.md` | Registo de conclusão da Fase 3.3 | Fases | Concluído | ADR-0003; commit `4734e4b`, tag `v0.3.3-ui-foundation` |
| Fase 3.4 — UI Primitives | `docs/phases/phase-3.4-ui-primitives.md` | Registo de conclusão da Fase 3.4 | Fases | Concluído | ADRs 0001–0005; commit `17872da`, tag `v0.3.4-ui-primitives` |
| Fase 3.5 — UI Composition Foundation | `docs/phases/phase-3.5-ui-composition-foundation.md` | Registo de conclusão da Fase 3.5 | Fases | Concluído | ADRs 0001–0005; commit `66cfd4c`, tag `v0.3.5-ui-composition-foundation` |
| Fase 3.6 — UI Application Foundation | `docs/phases/phase-3.6-ui-application-foundation.md` | Registo de conclusão da Fase 3.6 — primeiro consumo real do Design System por `apps/frontrest` | Fases | Concluído | ADRs 0001–0003, 0005; commit `ebcf240`, tag `v0.3.6-ui-application-foundation` |
| Fase 3.7 — Overlay | `docs/phases/phase-3.7-overlay.md` | Registo de conclusão da Fase 3.7 — categoria `overlay/` completa as 8 categorias da ADR-0003 | Fases | Concluído | ADRs 0001–0003, 0005; commit `ac278ae`, tag `v0.3.7-overlay-foundation` |
| Fase 3.8 — Quality | `docs/phases/phase-3.8-quality.md` | Registo de conclusão da Fase 3.8 — Vitest, testes representativos, CI, `CONTRIBUTING.md`, decisão de Storybook | Fases | Concluído | ADRs 0003, 0005; commit/tag por criar |
| Fase 4.2 — Frontend CRUD | `docs/phases/phase-4.2-frontend-crud.md` | Registo de conclusão da Fase 4.2 — CRUD completo de Fornecedores/Categorias de Despesa/Faturas em `apps/frontrest/web`, sobre a API da Fase 4.1 | Fases | Concluído | ADRs 0001, 0002, 0005; `docs/PHASES.md`; commit/tag por criar |
| Fase 4.4 — Backend Tests | `docs/phases/phase-4.4-backend-tests.md` | Registo de conclusão da Fase 4.4 — testes unitários e e2e para Suppliers/Expense Categories/Invoices em `apps/frontrest/api`, sem base de dados real | Fases | Concluído | `docs/PHASES.md`; `docs/ai/AI_WORKFLOW.md`; commit/tag por criar |
| Fase 5.1 — Upload & Storage Foundation | `docs/phases/phase-5.1-upload-storage-foundation.md` | Registo de conclusão da Fase 5.1 — `@frontcore/storage` concretizado sobre MinIO/S3, `getDownloadUrl`, sem consumidor real ainda | Fases | Concluído | `docs/PHASES.md`; commit/tag por criar |
| Fase 5.2 — Upload API Foundation | `docs/phases/phase-5.2-upload-api-foundation.md` | Registo de conclusão da Fase 5.2 — primeiro consumidor real de `@frontcore/storage`, `UploadsController`/`UploadsService` em `apps/frontrest/api`, modelo `StorageObject`; migration aplicada e fluxo validado contra infraestrutura real (nota de encerramento, 2026-07-08) | Fases | Concluído | `docs/PHASES.md`; `docs/ARCHITECTURE.md`; `docs/phases/phase-5.1-upload-storage-foundation.md`; commit/tag por criar |
| Fase 5.3 — Invoice Attachments | `docs/phases/phase-5.3-invoice-attachments.md` | Registo de conclusão da Fase 5.3 — `Invoice` ganha anexos via `InvoiceAttachment`, reutiliza `UploadsService` por inteiro, migration própria, validado ponta a ponta contra PostgreSQL/MinIO reais | Fases | Concluído | `docs/PHASES.md`; `docs/phases/phase-5.2-upload-api-foundation.md`; commit/tag por criar |
| Fase 5.4 — Upload Frontend Foundation | `docs/phases/phase-5.4-upload-frontend-foundation.md` | Registo da Fase 5.4 — componentes genéricos de upload em `@frontcore/ui` (`forms/upload/`), painel de anexos por fatura em `apps/frontrest/web`, sem alterações a backend/Prisma; validação manual no browser pendente | Fases | Em validação | `docs/PHASES.md`; `docs/adr/0003-ui-internal-structure.md`; `docs/phases/phase-5.3-invoice-attachments.md`; commit/tag por criar |
| Fase 6.1 — OCR Worker Foundation | `docs/phases/phase-6.1-ocr-worker-foundation.md` | Registo da Fase 6.1 — `apps/frontrest/workers` passa a app NestJS standalone real, novo package `@frontcore/queue` (BullMQ/Redis, genérico), `PrismaModule` partilhado movido para `@frontcore/database`, fila `ocr-processing` com consumidor mock; sem OCR real | Fases | Concluído | `docs/PHASES.md`; `docs/ARCHITECTURE.md`; `docs/CODING_STANDARDS.md`; commit/tag por criar |
| Fase 6.2 — OCR Pipeline Foundation | `docs/phases/phase-6.2-ocr-pipeline-foundation.md` | Registo da Fase 6.2 — novo package `@frontcore/ocr` (contrato `OCRProvider`, `OCRResult` normalizado, `OCRService`, provider `Tesseract` real, seleção por `OCR_PROVIDER`), `ObjectStorage.get()` novo em `@frontcore/storage`, Worker atualizado ao fluxo completo; sem parsing de campos, sem IA | Fases | Concluído | `docs/PHASES.md`; `docs/phases/phase-6.1-ocr-worker-foundation.md`; commit/tag por criar |
| Fase 6.3 — Invoice Draft Foundation | `docs/phases/phase-6.3-invoice-draft-foundation.md` | Registo da Fase 6.3 — modelo `InvoiceDraft` separado de `Invoice` (sem `status = DRAFT`, sem alterar `Invoice` existente), CRUD `/invoices/drafts`, promoção transacional a `Invoice` + `InvoiceAttachment`; sem parsing fiscal, sem Worker OCR a escrever no draft ainda | Fases | Concluído | `docs/PHASES.md`; `docs/ARCHITECTURE.md`; `docs/phases/phase-5.3-invoice-attachments.md`; `docs/phases/phase-6.2-ocr-pipeline-foundation.md`; commit/tag por criar |
| Fase 6.4 — OCR Draft Integration Foundation | `docs/phases/phase-6.4-ocr-draft-integration-foundation.md` | Registo da Fase 6.4 — contrato `OcrProcessingJob`/`OCR_PROCESSING_QUEUE` partilhado via `@frontcore/queue`, `QueueProducer` na API, criação de draft publica job OCR, Worker valida InvoiceDraft+StorageObject e persiste `ocrText`/`ocrConfidence`; sem parsing fiscal, sem outbox transacional | Fases | Concluído | `docs/PHASES.md`; `docs/ARCHITECTURE.md`; `docs/phases/phase-6.3-invoice-draft-foundation.md`; commit/tag por criar |
| Fase 6.5 — OCR Retry & Recovery Foundation | `docs/phases/phase-6.5-ocr-retry-recovery-foundation.md` | Registo da Fase 6.5 — backoff exponencial nativo do BullMQ (`EnqueueOptions.backoff`), `JobAttemptInfo` exposto pela abstração de filas, novo `OcrStatus` (`PENDING`/`PROCESSING`/`COMPLETED`/`FAILED`) e `ocrError` sanitizado no `InvoiceDraft`; sem Dead Letter Queue, sem endpoint de retry manual | Fases | Concluído | `docs/PHASES.md`; `docs/ARCHITECTURE.md`; `docs/phases/phase-6.4-ocr-draft-integration-foundation.md`; commit/tag por criar |
| Fase 6.6 — Fiscal Parsing & Structured Extraction Foundation | `docs/phases/phase-6.6-fiscal-parsing-foundation.md` | Registo da Fase 6.6 — módulo `fiscal-parsing` em `apps/frontrest/api` (não um package), pipeline de 9 extractors determinísticos (regex/heurísticas, sem IA), modelo normalizado `FiscalExtractionResult`; sem integração com `InvoiceDraft`, sem endpoint | Fases | Concluído | `docs/PHASES.md`; `docs/ARCHITECTURE.md`; `docs/CODING_STANDARDS.md`; `docs/phases/phase-6.2-ocr-pipeline-foundation.md`; commit/tag por criar |
| Fase 6.7 — Fiscal Parsing Draft Integration Foundation | `docs/phases/phase-6.7-fiscal-parsing-draft-integration-foundation.md` | Registo da Fase 6.7 — primeiro consumidor real de `FiscalParsingService`: `GET /invoices/drafts/:id/fiscal-parsing`, síncrono, sem persistência automática; Worker/filas/schema/promoção inalterados | Fases | Concluído | `docs/PHASES.md`; `docs/ARCHITECTURE.md`; `docs/phases/phase-6.6-fiscal-parsing-foundation.md`; commit/tag por criar |
| Fase 6.8 — Invoice Draft Review UI Foundation | `docs/phases/phase-6.8-invoice-draft-review-ui-foundation.md` | Registo da Fase 6.8 — primeiro consumidor frontend de `InvoiceDraft` (`/invoice-drafts`): upload, polling OCR, sugestões fiscais, revisão/gravação/promoção; correção do contrato `PATCH` (ausente/null/valor); Vitest introduzido em `apps/frontrest/web`; validado ponta-a-ponta contra Docker/Postgres/Tesseract reais e manualmente no browser (fluxo completo Upload→InvoiceDraft→OCR→Fiscal Parsing→Review→Promote) | Fases | Concluído | `docs/PHASES.md`; `docs/ARCHITECTURE.md`; `docs/phases/phase-6.7-fiscal-parsing-draft-integration-foundation.md`; commit/tag por criar |
| Fase 6.9 — PDF Rasterization Foundation | `docs/phases/phase-6.9-pdf-rasterization-foundation.md` | Registo da Fase 6.9 — `PdfRasterizer` (Poppler) em `@frontcore/ocr`: PDF (incl. multipágina) rasterizado para PNG e processado pelo `TesseractProvider` existente, página a página, sem paralelismo; `poppler-utils` só na imagem do Worker; validado ponta-a-ponta com Docker real (1 página, multipágina, limite, corrompido, protegido, concorrência) | Fases | Concluído | `docs/PHASES.md`; `docs/ARCHITECTURE.md`; `docs/phases/phase-6.2-ocr-pipeline-foundation.md`; `docs/phases/phase-6.8-invoice-draft-review-ui-foundation.md`; commit/tag por criar |
| Fase 6.10 — Document Extraction Foundation | `docs/phases/phase-6.10-document-extraction-foundation.md` | Registo da Fase 6.10 — motor genérico `runDocumentExtractors()`/`DocumentExtractor<TField,TValue>` extraído de `FiscalParsingService` para `apps/frontrest/api/src/document-extraction/`; `fiscal-parsing/` passa a consumidor fino, sem alteração de comportamento observável; contrato assíncrono prepara (sem implementar) coexistência futura de extractors regex/IA/modelo local/modelo cloud | Fases | Concluído | `docs/PHASES.md`; `docs/ARCHITECTURE.md`; `docs/adr/0007-document-extraction-foundation.md`; `docs/phases/phase-6.6-fiscal-parsing-foundation.md`; commit/tag por criar |
| Fase 6.11 — AI Provider Foundation | `docs/phases/phase-6.11-ai-provider-foundation.md` | Registo da Fase 6.11 — `@frontcore/ai` transformado em package operacional: contrato normalizado, `loadAiConfig()`, `createAiProvider()`, `MockAiProvider`, `OllamaAiProvider` (primeiro provider real, local, API nativa do Ollama via `fetch`, sem SDK, sem API key, timeout via `AbortController`, erros sanitizados via `AiProviderError`); zero consumidor real ainda, nenhum extractor de IA implementado; OpenAI/Anthropic ficam para fase futura | Fases | Concluído | `docs/PHASES.md`; `docs/ARCHITECTURE.md`; `docs/adr/0007-document-extraction-foundation.md`; commit `cdb43f2`, tag `v0.6.11-ai-provider-foundation` |
| Fase 6.12 — OCR & Fiscal Parsing Stabilization | `docs/phases/phase-6.12-ocr-fiscal-parsing-stabilization.md` | Registo da Fase 6.12 — auditoria e correção do trabalho de estabilização de OCR/parsing fiscal incluído por engano no commit da Fase 6.11 (âmbito declarado dessa fase era só `packages/ai`); `TaxNumberExtractor` corrigido (rótulo "Contribuinte", dígito de controlo do NIF português, `matchAll`) para deixar de confundir NIF do cliente com o do fornecedor; nova verificação de coerência entre campos (`dueDate >= issueDate`); `SuppliersService` impede NIF duplicado por organização; ferramenta `/invoice-drafts/debug` auditada (auth/tenant/estados incompletos); nenhum consumidor de IA, nenhum package novo | Fases | Concluído | `docs/PHASES.md`; `docs/ARCHITECTURE.md`; `docs/adr/0007-document-extraction-foundation.md`; `docs/phases/phase-6.11-ai-provider-foundation.md`; commit `6f060bf`, tag `v0.6.12-ocr-fiscal-parsing-stabilization` |
| Fase 6.13 — Document Regression Test Suite | `docs/phases/phase-6.13-document-regression-test-suite.md` | Registo da Fase 6.13 — `fiscal-parsing.regression.spec.ts` (Jest nativo, `describe.each`) protege `ocrText → FiscalExtractionResult` contra regressões usando 13 documentos reais + 2 sintéticos, cada um num `.txt` isolado com `reason` documentada (`fiscal-parsing/__fixtures__/`); `expected` é sempre a baseline atual confirmada, nunca o ideal; nenhum extractor, contrato, endpoint ou teste existente alterado; nenhum package/framework/runner novo | Fases | Concluído | `docs/PHASES.md`; `docs/phases/phase-6.12-ocr-fiscal-parsing-stabilization.md`; commit `0c6458a`, tag `v0.6.13-document-regression-test-suite` |
| Fase 7 — Financial Dashboard Foundation | `docs/phases/phase-7-financial-dashboard-foundation.md` | Registo da Fase 7 — `GET /dashboard/financial-summary` (`apps/frontrest/api/src/dashboard/`), agregações Prisma isoladas por organização só sobre `Invoice` (nunca `InvoiceDraft`), `issueDate` como dimensão temporal, `CANCELLED` excluído dos totais ativos mas contado à parte, período ISO validado (formato/`from > to`/calendário impossível) sempre em UTC, montantes serializados como string sem perda de precisão; `/dashboard` real (cards, resumo por estado, evolução mensal, categoria, principais fornecedores) com barras HTML/CSS e datas `pt-PT` via helper já existente; sem package novo, sem migration, sem biblioteca gráfica nova | Fases | Concluído | `docs/PHASES.md`; `docs/ARCHITECTURE.md`; `docs/phases/phase-6.3-invoice-draft-foundation.md`; `docs/phases/phase-4.2-frontend-crud.md`; commit `ef14149`, tag `v0.7.0-financial-dashboard-foundation` |
| Fase 8 — AI Chat Foundation | `docs/phases/phase-8-ai-chat-foundation.md` | Registo da Fase 8 — primeiro consumidor real de `@frontcore/ai`: `AiConversation`/`AiMessage` (sempre organização E utilizador, sem `title`, sem eliminação nesta fase), `POST /ai/chat` (`apps/frontrest/api/src/ai/`) cria/continua conversa, persiste USER, chama `AiCompletionProvider` via injeção (`AI_COMPLETION_PROVIDER`), persiste ASSISTANT; `AiTenantContextService` reutiliza `DashboardService` (Fase 7) em processo como mecanismo de contexto arquitetural, sem HTTP interno, sem expandir o âmbito funcional; histórico limitado e reordenado cronologicamente; erros do provider sanitizados, mensagem do utilizador sempre preservada; isolamento por organização e utilizador validado com testes reais (não só mocks); `/ai/chat` no frontend (sem eliminação de conversa); validado com Mock e Ollama real | Fases | Concluído | `docs/PHASES.md`; `docs/ARCHITECTURE.md`; `docs/phases/phase-6.11-ai-provider-foundation.md`; `docs/phases/phase-7-financial-dashboard-foundation.md`; commit/tag por criar |
| Fase 9 — Monthly Financial Reports & Export Foundation | `docs/phases/phase-9-monthly-financial-reports-export-foundation.md` | Registo da Fase 9 — `GET /reports/monthly` (JSON/CSV/PDF, `apps/frontrest/api/src/reports/`): relatório mensal, comparação com o mês anterior (`percentageChange: null` quando o período anterior é zero — nunca `Infinity`/`NaN`), detalhe de faturas do período (inclui `CANCELLED`, distinguível pelo estado); `ReportsService` reutiliza exclusivamente a API pública de `DashboardService` (Fase 7), nunca duplica queries financeiras nem conhece métodos privados; `month.util.ts` reutiliza `resolvePeriod()`; CSV escrito à mão (`;`, BOM UTF-8, mitigação CSV injection) e PDF via PDFKit (sem Chromium); JSON/CSV/PDF derivam do mesmo contrato; `/reports` no frontend; sem alteração a Dashboard ou AI Chat, sem package novo, sem migration | Fases | Concluído | `docs/PHASES.md`; `docs/ARCHITECTURE.md`; `docs/phases/phase-7-financial-dashboard-foundation.md`; `docs/phases/phase-8-ai-chat-foundation.md`; commit/tag por criar |
| Fase 8.1 — Financial AI Retrieval Foundation | `docs/phases/phase-8.1-financial-ai-retrieval-foundation.md` | Registo da Fase 8.1 — retrieval financeiro estruturado no Chat IA: intenção (conjunto fechado de 6) e período (mês/ano atual/anterior, mês explícito, intervalo) resolvidos deterministicamente por regex/palavras-chave a partir da mensagem, nunca pelo LLM; `FinancialRetrievalService` (`apps/frontrest/api/src/ai/financial-retrieval/`) reutiliza exclusivamente `DashboardService.getFinancialSummary()` (Fase 7) e devolve só o subconjunto relevante para a intenção; fallback explícito para pergunta não suportada/período em falta/período ambíguo/erro interno, nunca mês atual silencioso; `AiCompletionProvider` inalterado (sem tools/function calling); validado com Mock e Ollama real; sem package novo, sem migration, sem alteração ao frontend | Fases | Concluído | `docs/PHASES.md`; `docs/ARCHITECTURE.md`; `docs/phases/phase-7-financial-dashboard-foundation.md`; `docs/phases/phase-8-ai-chat-foundation.md`; `docs/phases/phase-9-monthly-financial-reports-export-foundation.md`; commit/tag por criar |
| Fase 8.2 — OpenRouter Provider Integration & AI Runtime Stabilization | `docs/phases/phase-8.2-openrouter-provider-integration-ai-runtime-stabilization.md` | Registo da Fase 8.2 — primeiro provider cloud real: `OpenRouterAiProvider` (`packages/ai/src/providers/openrouter/`), API OpenAI-compatible sobre `fetch` nativo, sem SDK; `AiConfig`/`loadAiConfig()` ganham `'openrouter'`; `AiErrorCode` estendido com `authentication`/`rate_limit` (inclui `402`, confirmado real); retry genérico (`withRetries()`, decorator interno aplicado pela `createAiProvider()`, nunca a `mock`, omissão sem alteração de comportamento); `AiChatService` ganha `Logger.error()` no ponto onde já sanitiza erros do provider; `AiCompletionProvider`/`AiChatService`/`AiController` inalterados; validado contra o serviço OpenRouter real (autorização explícita do utilizador); sem RAG/embeddings/agentes/tools/streaming/package novo/migration/dependência nova/alteração ao frontend | Fases | Concluído | `docs/PHASES.md`; `docs/ARCHITECTURE.md`; `docs/phases/phase-6.11-ai-provider-foundation.md`; `docs/phases/phase-8-ai-chat-foundation.md`; `docs/phases/phase-8.1-financial-ai-retrieval-foundation.md`; commit/tag por criar |

## Qualidade

| Documento | Localização | Objetivo | Categoria | Estado | Relação com outros documentos |
|---|---|---|---|---|---|
| Component Guidelines | `docs/quality/component-guidelines.md` | Convenções de API pública de componentes | Qualidade | Ativo | Aplica ADR-0003, ADR-0005 |
| Accessibility Guidelines | `docs/quality/accessibility.md` | Semântica HTML, teclado, foco, `aria-*`, responsive | Qualidade | Ativo | Referenciado por `docs/ai/AI_QUALITY_REVIEW.md` |
| Quality Checklist | `docs/quality/quality-checklist.md` | Checklist condensado antes de considerar um componente pronto | Qualidade | Ativo | Referencia os restantes documentos de `docs/quality/` |
| Quality Gates | `docs/quality/quality-gates.md` | Processo de validação obrigatório (typecheck/build/test/lint) | Qualidade | Ativo | Usado antes de qualquer commit em `packages/ui` |
| Component Definition of Done | `docs/quality/component-definition-of-done.md` | Definition of Done por componente individual | Qualidade | Ativo | Complementa a DoD de fase em `docs/ai/AI_RELEASE_CHECKLIST.md` |

## Release

| Documento | Localização | Objetivo | Categoria | Estado | Relação com outros documentos |
|---|---|---|---|---|---|
| Release Process | `docs/RELEASE_PROCESS.md` | Como fechar fases, criar pontos estáveis (tags) e preparar continuidade | Release | Ativo | Usa `docs/GIT_WORKFLOW.md`; referencia `docs/adr/`, `docs/phases/` |

## Outros

Nenhum documento nesta categoria por agora.

---

## Notas de fronteira

- `FrontCore/docs/Architecture/Architecture Index.md` (fora deste
  repositório) tenta cumprir um papel semelhante, mas só para
  `FrontCore/docs/` — os dois índices não se sobrepõem e não devem ser
  fundidos (ver `docs/PROJECT_STRUCTURE.md`).
- Documentação desatualizada identificada fora deste repositório (tabela de
  estado em `Architecture Index.md`, e pares quase-homónimos como `Coding
  Standards.md`/`Folder Structure.md`/`Decisions Log.md` vs os equivalentes
  aqui dentro) **não foi corrigida** — está fora do âmbito deste índice, que
  cobre apenas `frontcore/docs/`.
- `docs/DEVELOPER_GUIDE.md` deixou de ter a sua própria lista de leitura
  divergente — passou a apontar para `docs/INDEX.md` (ver ADR-0006).
