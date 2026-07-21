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
- **Fase 8.1 — Financial AI Retrieval Foundation**: substitui o resumo
  fixo do período por omissão do Chat IA (Fase 8) por retrieval
  financeiro estruturado — intenção (`FINANCIAL_SUMMARY`/
  `OUTSTANDING_BALANCE`/`BY_STATUS`/`BY_CATEGORY`/`TOP_SUPPLIERS`/
  `MONTHLY_TREND`, conjunto fechado) e período (mês/ano atual/anterior,
  mês explícito, intervalo explícito) resolvidos deterministicamente por
  regex/palavras-chave sobre a mensagem do utilizador, nunca pelo LLM;
  `FinancialRetrievalService` (`apps/frontrest/api/src/ai/financial-retrieval/`)
  reutiliza exclusivamente `DashboardService.getFinancialSummary()`
  (Fase 7) e devolve só o subconjunto de dados relevante para a
  intenção; fallback explícito para pergunta não suportada, período em
  falta/ambíguo e erro interno — nunca cai silenciosamente no mês
  atual; `AiCompletionProvider` inalterado, sem tools/function
  calling/agentes/RAG; sem package novo, sem migration, sem alteração
  ao frontend
  (`docs/phases/phase-8.1-financial-ai-retrieval-foundation.md`).
- **Fase 8.2 — OpenRouter Provider Integration & AI Runtime
  Stabilization**: primeiro provider cloud real —
  `OpenRouterAiProvider` (`packages/ai/src/providers/openrouter/`),
  API OpenAI-compatible, sobre `fetch` nativo, sem SDK; `AiConfig`/
  `loadAiConfig()` ganham `'openrouter'` com a mesma disciplina do
  Ollama (`AI_MODEL`/`OPENROUTER_API_KEY` obrigatórios, sem default
  permanente); `AiErrorCode` estendido com `authentication`/
  `rate_limit` (reais desde que existe um provider com credencial e
  limite de taxa — inclui `402`, confirmado real na validação manual);
  retry genérico (`withRetries()`, decorator interno aplicado pela
  `createAiProvider()` a providers reais, nunca a `mock`, backoff
  exponencial, omissão sem alteração de comportamento);
  `AiChatService` ganha `Logger.error()` no ponto onde já sanitiza
  erros do provider (mesmo padrão de `InvoiceDraftsService`).
  `AiCompletionProvider`/`AiChatService`/`AiController` inalterados —
  adicionar o terceiro provider não exigiu tocar em nenhum consumidor;
  validado contra o serviço OpenRouter real (autorização explícita do
  utilizador, um pedido pago mínimo); sem RAG, embeddings, agentes,
  tools, streaming complexo, package novo, migration, dependência nova
  ou alteração ao frontend
  (`docs/phases/phase-8.2-openrouter-provider-integration-ai-runtime-stabilization.md`).
- **Fase 8.3 — AI Tools (Function Calling) Foundation**: fase única,
  dois blocos. Bloco 1 — correção de um bug real de alucinação
  financeira, confirmado por investigação com dados reais: o retrieval
  determinístico (Fase 8.1) não reconhecia perguntas naturais
  ("Quantas faturas existem?", "Existem faturas pendentes?", "Onde
  estou a gastar mais dinheiro?", respostas de continuação como "sim
  este mês"), deixando o `system prompt` sem dados e o modelo a
  inventar valores apesar da instrução para não o fazer. Vocabulário do
  regex alargado diretamente; recuperação de intenção/período por
  histórico recente (sem persistência nova, mesma janela já enviada ao
  provider); `AiChatService` deixa de confiar no provider como resposta
  final sem `DATA` real — fallback determinístico
  (`buildDeterministicReply()`) marcado (`provider='deterministic'`),
  nunca texto livre sem dados por trás; `ERROR` nunca tenta o
  orquestrador de tools nem o provider. Bloco 2 — tool calling
  read-only, só como oportunidade adicional quando o Bloco 1 não
  reconhece a pergunta, nunca substituto — `AiCompletionProvider` ganha
  `tools`/`toolCalls` (aditivo, `packages/ai` continua genérico);
  `AiToolOrchestratorService` (`apps/frontrest/api/src/ai/tools/`)
  bounded a 1 tool call e 2 chamadas ao provider, nunca um loop aberto,
  com a garantia estrutural de que a 2ª chamada só acontece quando a
  tool devolveu `kind === 'DATA'`; 6 tools read-only reutilizando
  `FinancialRetrievalService.retrieveForIntent()`; `organizationId`
  sempre do chamador autenticado, nunca do modelo; texto livre sem tool
  nunca é a resposta final. Inclui também gestão de conversas —
  `DELETE /ai/conversations/:id` (cascata já provisionada no schema,
  sem migration), eliminação com confirmação na barra lateral
  (`ConfirmDialog`/`EmptyState` já existentes, reutilizados),
  `titlePreview` (primeira mensagem, não a última), lista atualizada
  sem refresh. Sem RAG, embeddings, agentes autónomos, streaming,
  escrita financeira, package novo
  (`docs/phases/phase-8.3-ai-tools-function-calling-foundation.md`).
- **Fase 8.4 — Hybrid AI Routing & Conversational Financial Queries
  Foundation**: router híbrido determinístico
  (`classifyMessageRelevance()`) — perguntas genuinamente gerais
  passam a ser respondidas diretamente pelo provider, por um `system
  prompt` mínimo e separado, sem tools nem dados da organização;
  perguntas financeiras nunca são tratadas como gerais só por um regex
  de intenção falhar (vocabulário financeiro-adjacente deliberadamente
  amplo). `DashboardService` ganha 3 filtros fechados e aditivos
  (`status`/`supplierId`/`categoryId`) e um primitivo novo
  (`getLargestInvoices()`, faturas individuais de maior valor).
  `FinancialEntityResolverService` resolve nomes de fornecedor/
  categoria de forma segura (nunca escolhe arbitrariamente quando
  ambíguo), reutilizando `SuppliersService`/`ExpenseCategoriesService`.
  Continuidade conversacional estruturada — filtros herdados só em
  continuações explícitas, sempre substituídos pela mensagem atual
  quando esta indica o seu próprio filtro. 6 tools existentes ganham
  filtros opcionais + 1 tool nova (`get_largest_expenses`). Bug real
  encontrado e corrigido na validação manual: fornecedor e categoria
  com o mesmo nome nunca são combinados como filtro AND independente
  (o fornecedor prevalece). Sem RAG, embeddings, agentes autónomos,
  package novo, migration, alteração ao frontend
  (`docs/phases/phase-8.4-hybrid-ai-routing-conversational-financial-queries-foundation.md`).
- **Fase 8.5 — Conversational Filter Continuity Foundation**: corrige e
  consolida a aplicação de filtros explícitos em mensagens de
  continuação ("só as pagas", "apenas as canceladas", "só as vencidas",
  "só as pendentes", "e dessas, quantas estão pagas?"), garantindo que
  substituem sempre o filtro herdado, mesmo sem verbo ou intenção
  financeira completa. Separação explícita em três responsabilidades:
  resolução de intenção (`financial-intent.resolver.ts`, inalterada na
  sua responsabilidade); extração pura do filtro de estado da mensagem
  atual (`financial-filter.extractor.ts`, novo,
  `resolveStatusFilter()`, dependência unidirecional
  `financial-intent.resolver.ts → financial-filter.extractor.ts`,
  nunca o inverso); herança de contexto do histórico
  (`FinancialRetrievalService`, inalterada na estrutura, só na fonte
  do filtro). `PENDING` incluído sem exclusão artificial.
  `FinancialIntentResolution` deixa de transportar `statusFilter`
  (removido diretamente, decisão justificada — só 2 consumidores
  internos, ambos alterados nesta fase, garantia do compilador
  confirmada). Sem comparação de períodos (candidata a Fase 8.6, não
  iniciada), sem alteração ao Dashboard, Reports, frontend, memória
  persistente ou OCR
  (`docs/phases/phase-8.5-conversational-filter-continuity-foundation.md`).
- **Fase 8.6 — Financial Period Comparison Foundation**: comparação
  entre dois períodos financeiros explicitamente nomeados na mesma
  mensagem do Chat IA ("compara maio com junho", "compara janeiro com
  fevereiro", "este mês versus o mês passado"). Matemática de
  comparação (`compareAmount()`/`compareCount()`, `percentageChange`
  sempre `null` — nunca `Infinity`/`NaN` — quando o período anterior é
  zero) extraída de `ReportsService` (Fase 9) para
  `dashboard/period-comparison.util.ts`, partilhada, sem alteração de
  comportamento nos relatórios; novo `financial-period-pair.resolver.ts`
  divide a mensagem em dois períodos e reutiliza
  `resolveFinancialPeriod()` (Fase 8.1) para cada lado, sem segunda
  semântica de datas; novo `FinancialIntentType = 'PERIOD_COMPARISON'`;
  router híbrido (Fase 8.4) reconhece a forma da comparação mesmo sem
  vocabulário financeiro-adjacente; `DashboardService.getFinancialSummary()`
  chamado duas vezes (Fase 7, sem alteração); nunca recupera por
  histórico (comparação relativa a um período discutido antes fica
  fora do âmbito); sem tool associada (`compare_periods` fica para
  fase futura); validado com dados reais via `POST /api/ai/chat`
  (Docker, OpenRouter, autorizado explicitamente)
  (`docs/phases/phase-8.6-financial-period-comparison-foundation.md`).
- **Fase 8.7 — Financial Conversation Context Foundation**: contexto
  financeiro versionado (`FinancialConversationContextV1`) persistido
  em `AiConversation.financialContext` (`Json?`, nova migration
  Prisma) — snapshot da última intenção/período/filtros resolvidos com
  sucesso, construído só a partir de resultados `DATA` reais, nunca de
  texto livre do modelo. Substitui a reanálise de texto do histórico
  recente (Fases 8.3/8.4) como fonte de recuperação preferida em
  `FinancialRetrievalService.retrieve()`, `classifyMessageRelevance()`
  (router híbrido, Fase 8.4) e `AiToolOrchestratorService` (exposição
  do `retrievalResult` real por trás de uma resposta de tool) — a
  reanálise de texto permanece como fallback para conversas sem
  snapshot ainda, comportamento idêntico ao anterior a esta fase.
  `resolvePeriodComparison()` (Fase 8.6) permanece inalterado, nunca
  recupera por histórico nem por snapshot. Isolamento por organização/
  utilizador/conversa herdado do já garantido por
  `findOwnedConversation()`, sem mecanismo novo — confirmado por testes
  unitários e e2e dedicados, incluindo recuperação comprovada além da
  janela de histórico carregada (`AI_CHAT_HISTORY_LIMIT=1`). Nota
  factual registada nesta fase: o commit histórico `58eb497` (tag
  `v0.8.7-...`) continha só alterações ao AI Framework
  (`docs/ai/`), nunca esta implementação funcional. Sem migração entre
  versões do snapshot, sem alteração à comparação de períodos, sem
  tool nova, sem alteração ao frontend; validação manual real via
  Docker/OpenRouter não foi executada nesta fase (pendente)
  (`docs/phases/phase-8.7-financial-conversation-context-foundation.md`).
- **Fase 8.8 — Financial AI Reliability & Strict Grounding Foundation**:
  cinco reforços de fiabilidade sobre a arquitetura já existente
  (Fases 8.1–8.7), sem alterar nenhuma estruturalmente. Strict
  Grounding (regras de prompt): `ASSISTANT_RULES`/`TOOL_ATTEMPT_RULES`
  proíbem explicitamente alterar/arredondar/reformular um valor/data/
  período/fornecedor/categoria já fornecido (distinto de "nunca
  inventar"), resposta final só com espaço em branco tratada como
  inconsistente. Router Hardening: vocabulário financeiro-adjacente
  alargado (`saldo`/`extrato`/`preço`/`cobrança`), nunca a forma nua
  "cobra" (colide com o substantivo "cobra"/serpente). Financial
  Conversation Context Hardening: `parseFinancialConversationContext()`
  (Fase 8.7) passa a validar também o calendário real do período e que
  `recordedAt` é parseável, nunca aceita filtro nomeado vazio, corpo
  todo dentro de `try`/`catch` — corrige um bug real (snapshot com
  calendário impossível fazia `resolvePeriod()` lançar mais tarde
  dentro de `FinancialRetrievalService.retrieve()`). Prompt Injection
  Hardening: `sanitizeDomainText()` em `financial-context.builder.ts`,
  aplicada a todo nome de fornecedor/categoria antes de entrar em
  qualquer mensagem ao modelo. **Strict Grounding estrutural
  (correção obrigatória, aplicada na mesma fase)**: as regras de prompt
  por si só nunca são uma garantia estrutural — novo
  `financial-grounding.validator.ts`
  (`validateFinancialGrounding()`) é uma fronteira determinística entre
  `FinancialRetrievalResult` e a resposta final, nunca o LLM como
  validador: extrai diretamente do resultado tipado os valores/
  contagens/datas reais permitidos, rejeita qualquer valor/data/contagem
  na resposta que não pertença a esse conjunto, e exige a presença do
  fornecedor/categoria/estado real quando a pergunta é explicitamente
  sobre um deles (`filters` definido); uma resposta rejeitada nunca é
  persistida — substituída por `buildFinancialContextMessage(result)`,
  marcada `provider: 'deterministic'`, `model: 'financial-grounding-fallback'`.
  Aplicada aos dois caminhos exigidos (retrieval direto e resposta
  final após tool calling). Sem OCR, Fiscal Parsing, InvoiceDraft,
  promoção, validações contabilísticas, IVA, NIF, Dashboard, Reports,
  tools novas, providers novos, embeddings, RAG, agentes, streaming,
  package novo, migration, alteração Prisma, ao frontend, ou ao tool
  registry
  (`docs/phases/phase-8.8-financial-ai-reliability-strict-grounding-foundation.md`).
- **Fase 10 — Admin & operação**: painel admin, gestão, activity logs,
  métricas, health dashboard, deploy Coolify. Inclui a criação do
  documento dedicado de entrega de infraestrutura ao responsável pela
  operação (registo de intenção em `docs/DEPLOY-COOLIFY.md`, secção
  "Trabalho futuro" — não desenvolvido antecipadamente).
- **Fase 10.1 — DevOps CI Foundation**: primeira infraestrutura DevOps
  do FrontCore — `.github/workflows/ci.yml` (job único, 12 passos:
  checkout, setup pnpm/Node 20 com cache, install, Documentation
  Validation, Lint, build do `@frontcore/database`, typecheck, test,
  build, `docker compose config`, `docker compose build`; nunca
  `docker compose up`), executado em `push`/`pull request` para `main`.
  Novo `scripts/validate-docs.mjs` (agregador) + 5 validadores em
  `scripts/validators/` (responsabilidade única cada um): existência de
  `docs/INDEX.md`/`docs/PHASES.md`/`docs/ARCHITECTURE.md`/`docs/ai/`,
  existência dos documentos de fase referenciados por `docs/PHASES.md`,
  e deteção de referências locais quebradas em toda a documentação
  (links Markdown e caminhos entre backticks). Novo script
  `docs:validate` em `package.json`, nenhum script existente alterado.
  `pnpm lint` continua um no-op (nenhum package define a tarefa `lint`
  ainda — fora do âmbito desta fase). Sem deploy automático,
  Kubernetes, Dependabot, security scanning, code coverage, release
  automation, Docker Hub, deploy em VPS, backups, monitorização,
  alertas, múltiplos workflows ou CI matrix — todos candidatos a fase
  futura
  (`docs/phases/phase-10.1-devops-ci-foundation.md`).
- **Fase 10.2 — DevOps CI Verification & Hardening**: verificação e
  reforço do pipeline da Fase 10.1 antes da Fase 8.9. `workflow_dispatch`,
  `concurrency` (cancela execuções antigas da mesma branch/PR) e
  `timeout-minutes: 30` adicionados ao job, renomeado `quality`
  (`name: Quality, Tests and Build`); novo passo "API E2E Tests"
  (`pnpm --filter @frontrest/api test:e2e`, mockado — sem serviços
  Postgres/Redis/MinIO no CI) entre "Test" e "Build". Substituído o
  no-op de `pnpm lint` por ESLint 9 real (flat config em
  `eslint.config.mjs`, `typescript-eslint` recommended não type-aware,
  `@next/eslint-plugin-next` — dependência direta fixada a `15.1.3`,
  nunca só transitiva via `eslint-config-next` — + `eslint-plugin-react-hooks`
  com regras só em `apps/frontrest/web`, plugins registados sem
  `files` para o `next build` os detetar corretamente (corrige "The
  Next.js plugin was not detected"); `"lint": "eslint ."` em
  `apps/frontrest/{api,web,workers}` e nas 11 `packages/*`); achados
  reais corrigidos (imports/variáveis não usados, escapes de regex
  desnecessários em 5 extractors fiscais, 2 diretivas `eslint-disable`
  obsoletas); `@typescript-eslint/no-explicit-any` mantida como `warn`
  (5 warnings conhecidos e documentados, sem mass refactor). Badge de
  CI único no `README.md`.
  Recomendações de proteção de branch documentadas (não aplicadas —
  sem acesso à API/CLI do GitHub). Sem deploy automático, staging,
  produção, VPS, Kubernetes, Dependabot, CodeQL, coverage gates,
  observabilidade, CI matrix ou alteração à Fase 8.9
  (`docs/phases/phase-10.2-devops-ci-verification-hardening.md`).

> Regra: não avançar de fase sem aprovação. Não refazer. Não tocar em ficheiros
> fora da fase atual.
