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

Zero consumidor de extração ainda — nenhum extractor de IA foi
implementado. Um futuro extractor fiscal de IA (ver
`docs/adr/0007-document-extraction-foundation.md`) implementaria
`DocumentExtractor<FiscalField, T>`
(`apps/frontrest/api/src/document-extraction/`) chamando
`AiCompletionProvider` no seu próprio `extract()` — `packages/ai`
continua sem qualquer conhecimento de faturas, OCR ou `FiscalField`.
Ver `docs/phases/phase-6.11-ai-provider-foundation.md` para o contrato
completo e a comparação API nativa vs. OpenAI-compatible do Ollama.

### Provider cloud — OpenRouter, retries e taxonomia de erro completa (Fase 8.2)

`OpenRouterAiProvider` (`packages/ai/src/providers/openrouter/`) é o
primeiro provider cloud real — API **OpenAI-compatible** do OpenRouter
(`POST {baseUrl}/chat/completions`, endpoint público
`https://openrouter.ai/api/v1`), que dá acesso a dezenas de modelos
(OpenAI, Anthropic, Google, Mistral, DeepSeek, ...) atrás de uma única
API e uma única credencial. Mesma disciplina do Ollama: `fetch` nativo,
sem SDK; `model` usa a convenção `"<fabricante>/<modelo>"` do
OpenRouter — uma string de configuração (`AiConfig.model`), nunca uma
nova abstração de seleção de modelo. Adicionar este terceiro provider
**não exigiu nenhuma alteração** a `AiCompletionProvider`,
`AiChatService` ou `AiController` — confirma empiricamente a promessa
provider-agnostic desde a Fase 6.11.

`AiErrorCode` ganha `authentication` (401/403/**402**) e `rate_limit`
(429) — só fazem sentido com um provider com credencial e limite de
taxa reais, nenhum dos dois existia com só Mock/Ollama. `402`
(saldo insuficiente) foi confirmado real contra o serviço OpenRouter
durante a validação manual desta fase, não assumido a partir de
documentação — classificado como `authentication` (mesma categoria
operacional, nunca reintentável), sem introduzir um oitavo código para
um caso de baixa frequência.

`withRetries()` (`packages/ai/src/providers/with-retries.ts`) é um
decorator interno, nunca exportado do package, aplicado por
`createAiProvider()` a providers reais (`ollama`/`openrouter`, nunca
`mock`, que nunca falha) — reintenta só códigos transitórios
(`timeout`/`provider_unavailable`/`rate_limit`) com backoff
exponencial, nunca erros de configuração/pedido
(`authentication`/`model_not_found`/`invalid_response`/`unknown`, onde
reintentar não mudaria o resultado). `retryAttempts=0` (omissão)
devolve o provider original sem qualquer wrapper — nenhuma alteração
de comportamento para consumidores existentes. Um único ponto de
aplicação, não duplicado por provider — qualquer provider futuro ganha
retries sem alteração própria. Confirmado a reintentar de facto contra
falhas reais (HTTP 429 genuíno do nível gratuito do OpenRouter) durante
a validação manual — não só simulado em testes.

Alternativas consideradas e rejeitadas (YAGNI): um Provider Registry
dinâmico em vez do `switch` de `createAiProvider()` (sem problema de
manutenção que uma tabela resolva com 3 providers reais); um sistema
de negociação de capacidades (zero consumidor real a diferenciar
comportamento por capacidade); retry duplicado dentro de cada provider
concreto; logging dentro de `packages/ai` (exigiria uma dependência de
framework num package deliberadamente agnóstico — o log do erro real
do provider, antes da sanitização, vive em `AiChatService`
(`apps/frontrest/api`), mesmo padrão já usado por
`InvoiceDraftsService`).

Ver `docs/phases/phase-8.2-openrouter-provider-integration-ai-runtime-stabilization.md`
para a validação manual completa contra o serviço real (incluindo os
casos reais de `402`/`429` que motivaram a classificação de erro
acima).

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
read-only, e reconstruído em cada pedido, nunca persistido nem
cacheado — desde a Fase 8.1, já não fixo ao mês atual (ver "Retrieval
financeiro estruturado do Chat IA", abaixo). O `system prompt` declara
explicitamente que só pode responder com os dados fornecidos e que o
modelo nunca é fronteira de autorização — reforço, não o mecanismo de
segurança real (esse já está garantido antes de qualquer dado chegar
ao provider).

`POST /ai/chat` persiste a mensagem `USER` antes de chamar o provider —
uma falha do provider (`AiProviderError`, taxonomia estendida na Fase
8.2) nunca apaga essa mensagem nem cria uma resposta `ASSISTANT` falsa;
`code` mapeado para HTTP sanitizado (`timeout`→504,
`provider_unavailable`/`model_not_found`/`authentication`→503,
`rate_limit`→429, `invalid_response`/`unknown`→502), nunca a mensagem
bruta do provider — o detalhe real é registado server-side
(`Logger.error()`, Fase 8.2), nunca devolvido ao cliente. Histórico
enviado ao provider limitado por
`AI_CHAT_HISTORY_LIMIT`, sempre reordenado cronologicamente (carregado
descendente pelo índice, invertido em memória) antes de
`AiCompletionProvider.complete()`. `/ai/chat`
(`apps/frontrest/web`) consome o endpoint com lista de conversas +
thread; sem package novo, sem streaming, sem RAG. Ver
`docs/phases/phase-8-ai-chat-foundation.md`.

### Retrieval financeiro estruturado do Chat IA (Fase 8.1)

`AiTenantContextService.buildSystemMessage()` já não chama
`DashboardService.getFinancialSummary()` com o período por omissão do
dashboard — delega em `FinancialRetrievalService`
(`apps/frontrest/api/src/ai/financial-retrieval/`), que resolve
deterministicamente (regex/palavras-chave sobre a mensagem do
utilizador, **nunca** uma completion) uma intenção financeira fechada
(`FINANCIAL_SUMMARY`/`OUTSTANDING_BALANCE`/`BY_STATUS`/`BY_CATEGORY`/
`TOP_SUPPLIERS`/`MONTHLY_TREND`) e um período (mês/ano atual/anterior,
mês explícito, intervalo explícito), reutilizando sempre
`resolvePeriod()` (Fase 7) e `resolveMonth()`/`previousMonth()`/
`currentMonth()` (Fase 9) para a validação de calendário/UTC — nunca
uma segunda semântica temporal. Continua a chamar exclusivamente
`DashboardService.getFinancialSummary(organizationId, { from, to })`
(a API pública, nunca métodos privados), mas agora seleciona só o
subconjunto de dados relevante para a intenção antes de o enviar ao
provider — nunca o resumo completo independentemente da pergunta.

Uma pergunta fora do conjunto fechado de intenções, ou cujo período não
seja identificável/ambíguo, nunca cai silenciosamente no mês atual —
ver "Hardening da precisão do retrieval" e "Tool calling", abaixo, para
o desenho final (Fase 8.3) de como esses casos são tratados sem nunca
confiar em texto livre do modelo sem dados reais por trás.

### Hardening da precisão do retrieval e fallback determinístico (Fase 8.3)

Uma investigação real (organização com dados reais) confirmou que,
quando `FinancialRetrievalService` não reconhecia a pergunta, o
`system prompt` ficava sem nenhum dado financeiro — e o modelo, apesar
da instrução para admitir insuficiência, por vezes inventava valores e
entidades inexistentes. Duas correções: (1) o vocabulário de
`resolveFinancialIntent()`/`resolveFinancialPeriod()` foi alargado
diretamente (mais padrões, mesma disciplina regex); (2) quando a
mensagem atual não resolve intenção **ou** período sozinha mas o outro
dos dois resolve, `FinancialRetrievalService` procura a peça em falta
na janela de histórico já carregada para o provider (mais recente
primeiro, nunca persistida, nunca mais longe que `AI_CHAT_HISTORY_LIMIT`) —
resolve continuações como "sim este mês".

Mais estruturalmente: `AiChatService.sendMessage()` passou a decidir
**antes** de construir qualquer `system prompt`. Só chama o provider a
confiar na resposta como final em duas situações — resultado `DATA`
(dados reais) ou uma tool real respondida com sucesso (ver abaixo).
Em qualquer outro caso, persiste diretamente `buildDeterministicReply()`
(`financial-context.builder.ts` — texto pt-PT final, já pronto para o
utilizador, não uma instrução para o modelo), marcado
(`provider='deterministic'`, `model='financial-retrieval-fallback'`)
para nunca ser confundido com uma resposta real numa auditoria. `buildFinancialContextMessage()`
passou a tratar exclusivamente resultados `DATA`. `ERROR` (falha
interna, ex. `DashboardService`) nunca tenta o orquestrador de tools
nem o provider — vai direto a este fallback. Ver
`docs/phases/phase-8.3-ai-tools-function-calling-foundation.md`.

### Tool calling — oportunidade adicional, nunca substituto (Fase 8.3)

`AiCompletionProvider` ganhou uma extensão aditiva e opcional
(`tools`/`toolCalls`, `AiMessage.role: 'tool'`, `AiMessage.toolCalls`
em mensagens `assistant`) — `packages/ai` continua completamente
genérico, sem qualquer conhecimento de faturas;
`MockAiProvider`/`OllamaAiProvider`/`OpenRouterAiProvider` implementam
o protocolo (Ollama e OpenRouter em formatos ligeiramente diferentes —
`function.arguments` objeto vs. string JSON, `tool_name` vs.
`tool_call_id` na mensagem `tool`, sem `id` nas tool calls nativas do
Ollama — tudo normalizado para o mesmo `AiToolCall`/`AiMessage`). Ao
reenviar a mensagem `assistant` que originou a tool call, ambos os
providers preservam as tool calls no formato nativo (`tool_calls` em
ambos, com forma diferente) — nunca só `role`/`content`, exigido pelos
dois protocolos reais para correlacionar com a mensagem `tool`
seguinte. A parte específica do domínio vive inteiramente em
`apps/frontrest/api/src/ai/tools/`: 6 tools read-only
(`financial-tool.registry.ts`, allow-list fechada) espelhando as
intenções da Fase 8.1, cada uma reutilizando
`FinancialRetrievalService.retrieveForIntent()` (novo método público,
mesma fonte de dados, nunca duplicada); `AiToolOrchestratorService`
orquestra um protocolo bounded — no máximo 1 tool call, no máximo 2
chamadas ao provider (a 2ª nunca volta a oferecer `tools`, força uma
resposta final) — nunca um loop aberto, nunca um agente autónomo.
**Garantia estrutural**: a 2ª chamada só acontece quando
`retrieveForIntent()` devolve `kind === 'DATA'` — qualquer outro
resultado (`PERIOD_MISSING`/`PERIOD_AMBIGUOUS`/`ERROR`/`UNSUPPORTED`)
devolve `NOT_ANSWERED` de imediato, sem nunca construir uma mensagem
`tool` a partir de dados inexistentes nem confiar na resposta textual
do modelo nesse caso. `organizationId` vem sempre do chamador
autenticado, nunca declarado como parâmetro de nenhuma tool nem lido
de argumentos do modelo. Texto livre do modelo sem nenhuma tool
chamada nunca é a resposta final — `AiChatService` só recorre ao
orquestrador quando o retrieval determinístico (Fase 8.1, reforçado
neste mesmo Bloco 1 da Fase 8.3) devolveu
`UNSUPPORTED`/`PERIOD_MISSING`/`PERIOD_AMBIGUOUS` (nunca para `ERROR`,
que vai direto ao fallback), e só confia no resultado quando uma tool
real foi executada com sucesso; caso contrário, cai no mesmo fallback
determinístico. Ver
`docs/phases/phase-8.3-ai-tools-function-calling-foundation.md`.

### Gestão de conversas (Fase 8.3)

`DELETE /ai/conversations/:id` (`AiChatService.deleteConversation()`,
mesma verificação de propriedade de `findOwnedConversation()`) —
eliminação física, cascata já provisionada no schema
(`AiMessage.conversation`, `onDelete: Cascade` desde a Fase 8), sem
migration nova. `titlePreview` (renomeado de `lastMessagePreview`)
passou a derivar da primeira mensagem da conversa, não da última —
único consumidor (barra lateral de `/ai/chat`) atualizado em conjunto.
Frontend reutiliza `ConfirmDialog`/`EmptyState` já existentes (mesmo
padrão de Fornecedores/Categorias/Faturas) — sem componente novo em
`@frontcore/ui`; lista atualizada localmente após eliminação, sem
`listConversations()` nem refresh da página.

### Router híbrido e consultas financeiras combinadas (Fase 8.4)

`classifyMessageRelevance()` (`apps/frontrest/api/src/ai/router/`,
determinístico, sem LLM) decide, **antes** de qualquer retrieval
financeiro, se uma mensagem é `GENERAL` ou financeira. Vocabulário
financeiro-adjacente deliberadamente amplo — falsos positivos
permanecem no caminho financeiro seguro, nunca o inverso. Regra
estrutural: a ausência de correspondência a uma intenção específica
(Fase 8.1) nunca classifica `GENERAL` — só a ausência de qualquer
vocabulário financeiro-adjacente, sem sinal de continuação apoiado em
contexto financeiro recente. `GENERAL` → `AiChatService` chama o
provider diretamente com um `system prompt` mínimo e separado
(`AiTenantContextService.buildGeneralSystemMessage()` — nunca o mesmo
texto de `ASSISTANT_RULES`), sem tools nem dados da organização,
resposta confiada e persistida com provider/model/tokens reais. A
garantia "nunca confiar sem `DATA`" (Fase 8.3) mantém-se integralmente
para qualquer alegação financeira — o caminho `GENERAL` nunca faz
nenhuma.

`DashboardService.getFinancialSummary()` ganha 3 filtros fechados e
aditivos (`status`/`supplierId`/`categoryId` — nunca uma API de
consulta genérica); `status` explícito substitui a exclusão por
omissão de `CANCELLED`. Novo `getLargestInvoices()` (`findMany`/
`orderBy: totalAmount desc`, estrutura distinta de `groupBy`) para
"maiores faturas individuais" — "maiores despesas" resolve-se conforme
a pergunta (faturas individuais → este primitivo; fornecedor agregado
→ `TOP_SUPPLIERS`; categoria agregada → `BY_CATEGORY`, agora
ordenado). `FinancialEntityResolverService`
(`apps/frontrest/api/src/ai/financial-retrieval/entity-resolver.service.ts`)
resolve nomes de fornecedor/categoria mencionados na mensagem
reutilizando `SuppliersService`/`ExpenseCategoriesService` (nunca uma
query Prisma duplicada) — `AMBIGUOUS` quando mais do que uma entidade
distinta corresponde, nunca escolhido arbitrariamente
(`FinancialRetrievalResult.kind === 'ENTITY_AMBIGUOUS'`, tratado como
`ERROR` por `AiChatService`). **Regra de prioridade confirmada
necessária por um bug real** (fornecedor e categoria com o mesmo nome
real, ex. "Hetzner", nunca são combinados como filtro `AND`
independente — o fornecedor prevalece).

Continuidade conversacional (`FinancialRetrievalService.retrieve()`):
filtros (estado/fornecedor/categoria) resolvidos sempre a partir da
mensagem atual; só recuperados do histórico quando a mensagem atual
sinaliza uma continuação explícita (`hasContinuationSignal()`,
partilhado com o classificador do router) — nunca herdados
silenciosamente numa pergunta nova. Um filtro que a mensagem atual já
resolve por si substitui sempre o herdado dessa dimensão. As 6 tools
da Fase 8.3 ganham os mesmos 3 filtros como parâmetros opcionais + 1
tool nova (`get_largest_expenses`) — `AiToolDefinition.parameters`
já suficientemente genérico, sem alteração a `packages/ai`. Ver
`docs/phases/phase-8.4-hybrid-ai-routing-conversational-financial-queries-foundation.md`.

### Continuidade de filtros conversacionais (Fase 8.5)

A extração de um filtro de estado explícito ("só as pagas", "apenas as
canceladas") foi separada em três responsabilidades distintas, antes
misturadas em `financial-intent.resolver.ts` (Fase 8.4). Resolução de
**intenção** (`financial-intent.resolver.ts`) continua responsável só
por `FinancialIntentType`, nunca por transportar um filtro no seu
retorno. Extração pura do **filtro da mensagem atual**
(`apps/frontrest/api/src/ai/financial-retrieval/financial-filter.extractor.ts`,
novo) — `resolveStatusFilter(message): InvoiceStatus | undefined`,
síncrona, sem I/O, sem conhecimento de intenção nem de histórico;
exige sempre um sinal explícito (`quantas`/`quantos`/`número de`/
`contagem`/`mostra(r)`/`lista(r)`/`só`/`apenas`) imediatamente antes de
uma palavra de estado — nunca um estado isolado, para nunca criar um
falso positivo a partir de "Isto já está pago." `PENDING` incluído sem
exclusão artificial; a distinção com `OUTSTANDING_BALANCE` (Pendente +
Vencida combinado) depende só da presença do sinal, nunca da palavra
"pendente" em si. Dependência estritamente unidirecional —
`financial-intent.resolver.ts → financial-filter.extractor.ts`, nunca
o inverso — para o extrator poder ser reutilizado no futuro sem
acoplamento a lógica de intenção.

Herança do **contexto anterior** (`FinancialRetrievalService`)
mantém-se estruturalmente igual à Fase 8.4 (filtro herdado só em
continuações explícitas, `hasContinuationSignal()`), mas passou a
chamar `resolveStatusFilter()` diretamente — tanto para a mensagem
atual como para cada mensagem do histórico em `recoverFilters()` —
nunca através de `FinancialIntentResolution`. O filtro de estado que a
mensagem atual resolve por si tem sempre prioridade absoluta sobre o
herdado, por dimensão independente do fornecedor/categoria.

`FinancialIntentResolution.statusFilter` foi removido diretamente
(não mantido por compatibilidade) — confirmado por pesquisa exaustiva
como tendo exatamente 2 consumidores internos (o próprio ficheiro e
`financial-retrieval.service.ts`), ambos alterados na mesma fase,
nenhum consumidor externo (tipo interno, nunca exposto por HTTP);
remoção protegida por `pnpm typecheck` (0 erros) — decisão justificada
em detalhe em
`docs/phases/phase-8.5-conversational-filter-continuity-foundation.md`.

## Relatórios financeiros mensais

Desde a Fase 9, `apps/frontrest/api/src/reports/` (`ReportsModule`,
importando `DashboardModule`) é o segundo consumidor real de
`DashboardService` (o primeiro foi o Chat IA, Fase 8) — `ReportsService`
reutiliza exclusivamente a sua API pública (`getFinancialSummary()`),
nunca conhece métodos privados nem duplica nenhuma agregação
financeira; a única query Prisma própria deste módulo é o detalhe de
faturas do mês (`invoices[]`, inclui `CANCELLED`, distinguível pelo
`status`, sem paginação — volume naturalmente limitado por
organização+mês). `month.util.ts` resolve `YYYY-MM` reutilizando
`resolvePeriod()` (Fase 7) para toda a validação de calendário e
construção UTC — sem lógica de datas duplicada.

`GET /reports/monthly` (JSON/CSV/PDF) chama sempre
`ReportsService.getMonthlyReport()` — os três formatos derivam do mesmo
`MonthlyFinancialReport`, nunca queries diferentes por formato. A
comparação com o mês anterior é `Infinity`/`NaN`-impossível por
construção: `percentageChange` fica `null` antes de qualquer divisão
quando o período anterior é zero, nunca calculado e depois validado.
Exportação sem armazenamento (sem `StorageObject`/MinIO) — CSV escrito
à mão (RFC4180, delimitador `;` e BOM UTF-8 para compatibilidade com
Excel em `pt-PT`, mitigação OWASP contra CSV injection) e PDF via
PDFKit (fontes standard `WinAnsiEncoding`, sem Chromium, sem
dependências nativas — comparado explicitamente contra `pdf-lib`,
`@react-pdf/renderer` e Puppeteer). `/reports`
(`apps/frontrest/web`) consome o endpoint com seleção de mês, resumo,
comparação e tabela de faturas; downloads autenticados via `Blob`/
`ObjectURL` (nunca um link direto sem `Authorization`). Ver
`docs/phases/phase-9-monthly-financial-reports-export-foundation.md`.

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
