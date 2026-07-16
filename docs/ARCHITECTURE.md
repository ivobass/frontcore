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
| `@frontcore/storage`     | Storage de objetos S3-compatível (MinIO/S3)          | ativo         |
| `@frontcore/queue`       | Filas assíncronas sobre BullMQ/Redis                 | ativo         |
| `@frontcore/ai`          | Provider de IA para completions (mock + Ollama)      | ativo         |
| `@frontcore/notifications` | Contrato de notificações                           | contrato      |
| `@frontcore/monitoring`  | Helpers de health/observabilidade                    | ativo         |
| `@frontcore/ui`          | Design system base (tokens + cn)                     | ativo         |

> "contrato" = na Fase 1 expõe apenas tipos/interfaces de fronteira. A
> implementação concreta entra na fase indicada, sem quebrar consumidores.

## Storage de objetos

`@frontcore/storage` passou de contrato vazio (Fase 1) a implementação
real sobre MinIO/S3 (`S3ObjectStorage`, Fase 5.1) e ganhou o primeiro
consumidor real em `apps/frontrest/api` (Fase 5.2):

```
UploadsController → UploadsService → ObjectStorage → S3ObjectStorage
```

Só `apps/frontrest/api/src/uploads/uploads.module.ts` importa
`S3ObjectStorage`/`@frontcore/storage` diretamente — regista-o sob um
token de injeção NestJS (`OBJECT_STORAGE`). `UploadsController` e
`UploadsService` só conhecem o tipo `ObjectStorage`, nunca a
implementação concreta, o que permite substituir o provider (testes, ou
uma implementação alternativa futura) sem tocar em mais nenhum ficheiro.
Ver `docs/phases/phase-5.1-upload-storage-foundation.md` e
`docs/phases/phase-5.2-upload-api-foundation.md`.

## Filas assíncronas

`@frontcore/queue` (Fase 6.1) segue exatamente a mesma forma de
`@frontcore/storage`: contrato genérico (`QueueProducer`/`QueueConsumer`),
configuração (`loadQueueConfig()`), erros normalizados (`QueueError`) e
um provider concreto sobre BullMQ/Redis. Sem lógica de domínio — o nome
da fila e o payload são sempre decisão do consumidor.

```
apps/frontrest/api      → QueueProducer (token) → BullMQQueueProducer
apps/frontrest/workers  → QueueConsumer (token) → BullMQQueueConsumer
```

Só `apps/frontrest/api/src/queue/queue.module.ts` importa
`BullMQQueueProducer` diretamente (token `QUEUE_PRODUCER`), e só
`apps/frontrest/workers/src/queues/ocr-processing.module.ts` importa
`BullMQQueueConsumer` diretamente (token `QUEUE_CONSUMER`) — mesmo
padrão do `OBJECT_STORAGE` em `uploads.module.ts`. Ver
`docs/phases/phase-6.1-ocr-worker-foundation.md`.

**Exceção documentada** (Fase 6.4): o contrato da única fila real hoje
(`OcrProcessingJob`/`OCR_PROCESSING_QUEUE`, em
`packages/queue/src/jobs/`) inclui `invoiceDraftId`, um conceito de
domínio FrontRest — normalmente proibido dentro de `packages/*`. Vive
ali porque é o único ponto que `apps/frontrest/api` (produtor) e
`apps/frontrest/workers` (consumidor) já partilham sem duplicar a
interface nem criar uma dependência direta entre as duas apps.
Justificação completa em
`docs/phases/phase-6.4-ocr-draft-integration-foundation.md`.

**Retry & Recovery** (Fase 6.5): `EnqueueOptions` ganhou `backoff`
(mapeado 1:1 para o backoff nativo do BullMQ) e `JobHandler` passou a
receber `JobAttemptInfo { attemptNumber; maxAttempts }`, derivado
diretamente de `job.attemptsStarted`/`job.opts.attempts` — nenhuma
contagem de tentativas paralela é mantida em código FrontCore. Ver
`docs/phases/phase-6.5-ocr-retry-recovery-foundation.md`.

## Rasterização PDF (`@frontcore/ocr`)

Desde a Fase 6.9, `OCRService` (`packages/ocr/src/services/ocr.service.ts`)
reconhece `application/pdf` e trata-o inteiramente antes de qualquer
`OCRProvider` — `TesseractProvider` continua a declarar suporte só a
`image/jpeg`/`image/png`, nunca soube que PDF existe. Um `PdfRasterizer`
(contrato genérico, `packages/ocr/src/contracts/pdf-rasterizer.ts`),
implementado sobre o binário de sistema Poppler
(`pdfinfo`/`pdftoppm`, `packages/ocr/src/rasterizers/poppler/`),
converte cada página a PNG sequencialmente (`AsyncIterable`, nunca
todas as páginas em memória simultaneamente), e cada página passa pelo
`TesseractProvider` já existente como se fosse uma imagem normal. Se
uma página falhar, o documento inteiro falha — sem texto parcial, sem
`COMPLETED`. `poppler-utils` só é instalado na imagem Docker do Worker
(`docker/workers.Dockerfile`) — `apps/frontrest/api`/`apps/frontrest/web`
inalterados. Ver `docs/phases/phase-6.9-pdf-rasterization-foundation.md`
para os limites configuráveis (páginas/DPI/dimensão/timeout) e a
comparação de alternativas (Poppler vs. PDF.js+Canvas vs. MuPDF vs.
Ghostscript/ImageMagick).

## Document Extraction (motor genérico de extração de campos)

Desde a Fase 6.10, `apps/frontrest/api/src/document-extraction/`
(novo módulo, não um package — ver `docs/adr/0007-document-extraction-foundation.md`)
hospeda o motor genérico de extração de campos de um documento:
`DocumentExtractor<TField extends string, TValue>` (contrato
assíncrono) e `runDocumentExtractors()` (corre N extractors em
paralelo, resolve conflitos pelo campo — maior confiança vence, empate
→ ordem de registo — e agrega metadata de execução). Sem qualquer
noção de fatura, fornecedor, OCR ou IA — genérico o suficiente para
qualquer especialização futura de documento (recibo, guia, encomenda,
nota de crédito).

`fiscal-parsing/` (Fase 6.6) é hoje o único consumidor real: um
consumidor fino que especializa o motor em `FiscalField`/
`FiscalExtractionResult` — `FiscalExtractor<T>` é
`DocumentExtractor<FiscalField, T>`, `FiscalExtractionMetadata` é
`DocumentExtractionMetadata<FiscalField>`, nenhum dos dois duplicado.
`FiscalParsingService.parse()` passou a `async` só por causa da
assinatura de `DocumentExtractor.extract()` (assíncrona, para cobrir um
futuro extractor de IA/modelo local/modelo cloud com I/O real) — o
comportamento observável (`GET /invoices/drafts/:id/fiscal-parsing`,
`FiscalExtractionResult`) é bit-a-bit idêntico ao anterior; os 9
extractors regex continuam determinísticos, sem IA. Sem novo package
(YAGNI — sem segundo consumidor real hoje, mesmo raciocínio já usado
para `fiscal-parsing/` em si, Fase 6.6, e para rejeitar `DocumentDraft`
genérico, Fase 6.3); sem alteração a `packages/ai` (contrato de
provider de IA já existente desde a Fase 1, ainda sem implementação
concreta nem consumidores).

## Provider de IA (`@frontcore/ai`)

`@frontcore/ai` existia desde a Fase 1 só como contrato ("implementação
real" nunca chegou a acontecer nas fases originalmente previstas). Desde
a Fase 6.11, é um package operacional: `AiCompletionProvider`
(`complete(request): Promise<AiCompletionResponse>`), `AiConfig` (união
discriminada por `AiProviderName = 'mock' | 'ollama'` — nunca um
`string` solto), `loadAiConfig()` (convenção `load<X>Config()`) e
`createAiProvider(config)` (mesma fábrica de `createOcrProvider()`,
`@frontcore/ocr` — um `case` por provider, nada nos consumidores muda).

Dois providers: `MockAiProvider` (determinístico, sem I/O, sem
credenciais — testes e desenvolvimento local) e `OllamaAiProvider`,
sobre a **API HTTP nativa do Ollama** (`POST /api/chat`, confirmado
empiricamente contra um servidor local real — não o endpoint
OpenAI-compatible, `/v1/chat/completions`, que obrigaria a montar um
pedido no formato OpenAI só para o Ollama o traduzir de volta ao nativo
internamente). Primeiro provider real escolhido por rodar localmente:
sem custo por pedido, sem API key cloud, sem dependência de internet,
maior privacidade dos documentos. `AiMessage[]` do contrato genérico é
enviado quase sem tradução (`{role, content}`, o mesmo shape da API
nativa); a resposta normalizada a partir de `message.content`
(`message.thinking`, presente em modelos de raciocínio como `qwen3`,
nunca é lido). Transporte: `fetch` nativo do Node (sem SDK, sem
dependência nova — `packages/ai` tem hoje menos dependências do que
antes desta fase). Timeout via `AbortController` real (cancela o
pedido HTTP subjacente, nunca um `Promise.race` que só deixaria de
esperar) — sem retries automáticos (`fetch` nunca reintenta sozinho) e
sem streaming (`stream: false` sempre). Erros classificados numa única
`AiProviderError` com `code` tipado
(`timeout`/`invalid_response`/`provider_unavailable`/`model_not_found`/`unknown`
— sem `authentication`/`rate_limit`: conceitos de fronteira cloud que
um provider local não tem, a reintroduzir só quando um provider cloud
real os exigir) — nunca a mensagem bruta do Ollama, nunca o nome do
modelo pedido, só texto fixo sanitizado por `code`.

Zero consumidor real ainda — nenhum extractor de IA foi implementado.
Um futuro extractor fiscal de IA (ver `docs/adr/0007-document-extraction-foundation.md`)
implementaria `DocumentExtractor<FiscalField, T>`
(`apps/frontrest/api/src/document-extraction/`) chamando
`AiCompletionProvider` no seu próprio `extract()` — `packages/ai`
continua sem qualquer conhecimento de faturas, OCR ou `FiscalField`. Um
segundo provider cloud (OpenAI, Anthropic, Azure OpenAI, OpenRouter)
fica para uma fase futura, sobre o mesmo `AiCompletionProvider`. Ver
`docs/phases/phase-6.11-ai-provider-foundation.md` para o contrato
completo e a comparação API nativa vs. OpenAI-compatible do Ollama.

## Base de dados partilhada entre apps NestJS

`PrismaModule`/`PrismaService` vivem em `@frontcore/database`
(`src/nestjs/`), não em cada app individualmente — mesmo padrão já usado
por `@frontcore/auth` (`src/nestjs/`, guards e decorators). Qualquer app
NestJS do monorepo (`apps/frontrest/api`, `apps/frontrest/workers`, e
futuras) importa `PrismaModule` de `@frontcore/database`, nunca duplica
o ficheiro. `@nestjs/common`/`@nestjs/core` são `peerDependencies` de
`@frontcore/database` — o package continua utilizável sem NestJS (o
singleton `prisma` exportado do barrel raiz, reservado a scripts fora de
qualquer container Nest, ex. seeds).

## Staging de documentos vs. domínio financeiro

`InvoiceDraft` (Fase 6.3) é uma entidade separada de `Invoice`, não um
estado (`status = DRAFT`) do mesmo modelo. `Invoice` continua a
representar sempre um documento financeiro válido e completo
(`supplierId`/`issueDate`/`totalAmount` obrigatórios, sem alteração);
`InvoiceDraft` referencia `StorageObject`/`Supplier`/`ExpenseCategory`
de forma unidirecional, com todos os campos de domínio opcionais,
mesmo padrão já usado por `InvoiceAttachment` (Fase 5.3) — uma entidade
nova referencia as existentes, nunca o contrário. Promoção explícita
(`InvoiceDraftsService.promote()`, transação Prisma única) cria a
`Invoice` + `InvoiceAttachment` reais e só depois elimina o draft. Ver
`docs/phases/phase-6.3-invoice-draft-foundation.md` para a comparação
arquitetural completa entre as duas abordagens.

Desde a Fase 6.4, a criação de um `InvoiceDraft` publica automaticamente
um job na fila `ocr-processing`; o Worker OCR lê o `StorageObject`
associado e persiste texto bruto (`ocrText`) e confiança
(`ocrConfidence`) de volta no mesmo `InvoiceDraft` — sem parsing fiscal,
sem extração de campos estruturados (fornecedor, datas, totais
continuam a ser preenchidos manualmente). Ver
`docs/phases/phase-6.4-ocr-draft-integration-foundation.md`.

Desde a Fase 6.5, `InvoiceDraft` também tem `ocrStatus`
(`PENDING`/`PROCESSING`/`COMPLETED`/`FAILED`) e `ocrError` (mensagem
sanitizada, só preenchida em `FAILED`) — falhas técnicas transitórias
(storage/OCR/Prisma) acionam retry automático com backoff exponencial
nativo do BullMQ; ao esgotar as tentativas configuradas, o draft fica
`FAILED` em vez de silenciosamente `null`. Ver
`docs/phases/phase-6.5-ocr-retry-recovery-foundation.md`.

## Parsing fiscal

`apps/frontrest/api/src/fiscal-parsing/` (Fase 6.6) transforma texto
OCR em dados estruturados — determinístico (regex/heurísticas), sem
IA/LLM. Vive em `apps/frontrest/api`, não em `packages/*`, por YAGNI —
sem segundo consumidor real fora de FrontRest hoje (não porque a lógica
interna seja específica de restaurante — não é; ver "Decisão de
localização" em `docs/phases/phase-6.6-fiscal-parsing-foundation.md`
para a justificação completa, incluindo a revisão da justificação
original). Pipeline de extractors independentes (`FiscalExtractor<T>`,
mesmo padrão de `OCRProvider`), orquestrados por `FiscalParsingService`
— puro, sem `Prisma`/HTTP/fila.

Desde a Fase 6.7, `InvoicesModule` importa `FiscalParsingModule`:
`GET /invoices/drafts/:id/fiscal-parsing` (`InvoiceDraftsService.parseFiscalData()`)
é o primeiro consumidor real — executa `FiscalParsingService.parse()`
sobre o `ocrText` já persistido no `InvoiceDraft` e devolve o
`FiscalExtractionResult` diretamente, sem o persistir. Nenhuma escrita
automática no `InvoiceDraft`, nenhuma alteração ao Worker/filas/schema
Prisma/promoção para `Invoice`. Ver
`docs/phases/phase-6.7-fiscal-parsing-draft-integration-foundation.md`.

Desde a Fase 6.8, `apps/frontrest/web` (rota `/invoice-drafts`) é o
primeiro consumidor frontend: upload → criação do rascunho →
acompanhamento do estado OCR por polling local → consulta automática
do parsing fiscal quando `ocrStatus` chega a `COMPLETED` → revisão
humana → `PATCH` só com os campos alterados → promoção explícita.
Sugestões do parsing nunca são aplicadas nem persistidas
automaticamente — só uma ação explícita ("Aplicar sugestões") as copia
para o formulário, e só "Guardar alterações" grava no draft. Ver
`docs/phases/phase-6.8-invoice-draft-review-ui-foundation.md`.

Desde a Fase 6.12, `FiscalParsingService` também aplica uma verificação
de **coerência entre campos** (`applyCoherenceChecks()`) depois de
todos os extractors terem corrido — deliberadamente uma verificação
única e pequena (`dueDate` anterior a `issueDate` nunca é válido, o
`dueDate` é descartado), não um motor de regras genérico. Existe aqui,
e não dentro de um extractor, porque nenhum extractor pode ver o
resultado de outro por desenho (`runDocumentExtractors()` corre-os em
paralelo — ver "Document Extraction", acima). `TaxNumberExtractor`
também deixou de aceitar só a primeira ocorrência de um rótulo
("NIF"/"NIPC"/"Contribuinte") — considera todas e valida o dígito de
controlo do NIF português (módulo 11) antes de escolher, para nunca
devolver um número estruturalmente inválido. Ver
`docs/phases/phase-6.12-ocr-fiscal-parsing-stabilization.md`.

## Dashboard financeiro

Desde a Fase 7, `apps/frontrest/api/src/dashboard/` (`DashboardService`)
agrega `Invoice` já confirmadas (nunca `InvoiceDraft` — staging, nunca
dado financeiro) num único endpoint de leitura,
`GET /dashboard/financial-summary`, sempre isolado por
`organizationId` e usando `issueDate` como dimensão temporal.
`CANCELLED` fica fora dos totais "ativos" mas continua contado à parte
e visível em `byStatus` — nunca escondido. Período `from`/`to`
opcional (ISO `YYYY-MM-DD`, omisso → mês atual), resolvido sempre em
UTC (`period.util.ts`) — início inclusivo, fim exclusivo internamente,
nunca dependente do timezone do processo Node; rejeita formato
inválido, `from > to`, e datas de calendário impossíveis (`@IsDateString()`
sozinho aceita "2026-02-30" — só a validação adicional em
`resolvePeriod()` o rejeita). Nenhuma query depende do número de
faturas (sem N+1) e nenhuma monta agregações sobre a listagem
paginada. Montantes serializados sempre como string
(`Prisma.Decimal.toJSON()`), nunca convertidos para `number` antes da
resposta — evita perda de precisão. `/dashboard`
(`apps/frontrest/web`) consome o endpoint com cards e barras HTML/CSS
proporcionais (`ProportionalBarList`, reutilizado por evolução mensal/
categoria/fornecedores — sem biblioteca gráfica); datas em `pt-PT` via
`lib/format.ts::formatDate()` já existente, sem formatador novo. Ver
`docs/phases/phase-7-financial-dashboard-foundation.md`.

## Chat IA (`@frontcore/ai`, primeiro consumidor real)

Desde a Fase 8, `apps/frontrest/api/src/ai/` (`AiModule`) é o primeiro
consumidor real de `@frontcore/ai` (Fase 6.11 — até aqui, zero
consumidores). `AiChatService`/`AiController` nunca conhecem
`OllamaAiProvider`/`MockAiProvider` diretamente — só o tipo
`AiCompletionProvider`, injetado via token `AI_COMPLETION_PROVIDER`
registado dentro do próprio `ai.module.ts` (mesmo padrão de
`OBJECT_STORAGE` em `uploads.module.ts`: único consumidor real, sem
ciclo de vida a fechar no shutdown — ao contrário de `QueueProducer`,
que por isso vive no seu próprio `QueueModule`).

`AiConversation`/`AiMessage` (novos modelos Prisma) pertencem sempre a
uma organização **e** a um utilizador — nunca só um dos dois. Todo o
isolamento acontece nas queries (`findFirst({ where: { id,
organizationId, userId } })`, mesmo padrão de
`InvoiceDraftsService.findOne()`), nunca no modelo de IA: uma conversa
de outro tenant ou de outro utilizador da mesma organização é
indistinguível de uma conversa inexistente na resposta HTTP.
`organizationId`/`userId` vêm sempre de `CurrentUser()`, nunca do corpo/
query/path do pedido. `AiConversation` não tem `title` nem endpoint de
eliminação nesta fase — um campo sempre `null` ou uma operação com
decisões de retenção/auditoria ainda por tomar não pertencem a uma
foundation; a lista de conversas usa só `createdAt`/`updatedAt`/
`lastMessagePreview` (derivado, nunca persistido).

`AiTenantContextService` é o mecanismo arquitetural de contexto por
tenant — nesta fase, construído chamando
`DashboardService.getFinancialSummary()` (Fase 7) diretamente em
processo — nunca um pedido HTTP interno, nunca queries Prisma
duplicadas. `DashboardModule` passou a exportar `DashboardService` para
este reuso. Esta integração é uma demonstração do mecanismo, não o
objetivo funcional da fase — o chat continua uma foundation genérica de
conversas/histórico/isolamento/providers, não um assistente financeiro
dedicado; um consumidor de contexto diferente reutilizaria a mesma forma
sem alterar `AiChatService`/`AiController`. O contexto é pequeno,
read-only, limitado ao mês atual (mesma omissão do dashboard) e
reconstruído em cada pedido, nunca persistido nem cacheado. O `system
prompt` declara explicitamente que só pode responder com os dados
fornecidos e que o modelo nunca é fronteira de autorização — reforço,
não o mecanismo de segurança real (esse já está garantido antes de
qualquer dado chegar ao provider).

`POST /ai/chat` persiste a mensagem `USER` antes de chamar o provider —
uma falha do provider (`AiProviderError`, mesma taxonomia da Fase 6.11)
nunca apaga essa mensagem nem cria uma resposta `ASSISTANT` falsa;
`code` mapeado para HTTP sanitizado (`timeout`→504, `provider_unavailable`/
`model_not_found`→503, `invalid_response`/`unknown`→502), nunca a
mensagem bruta do provider. Histórico enviado ao provider limitado por
`AI_CHAT_HISTORY_LIMIT`, sempre reordenado cronologicamente (carregado
descendente pelo índice, invertido em memória) antes de
`AiCompletionProvider.complete()`. `/ai/chat`
(`apps/frontrest/web`) consome o endpoint com lista de conversas +
thread; sem package novo, sem streaming, sem RAG. Ver
`docs/phases/phase-8-ai-chat-foundation.md`.

## Apps (FrontRest)

| App                    | Stack       | Porta | Estado Fase 1            |
|------------------------|-------------|-------|--------------------------|
| `@frontrest/api`       | NestJS      | 3001  | health + prisma          |
| `@frontrest/web`       | Next.js 15  | 3000  | página de estado         |
| `@frontrest/workers`   | NestJS std. | —     | foundation (Fase 6.1)    |

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
