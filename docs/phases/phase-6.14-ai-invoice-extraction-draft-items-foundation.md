# Fase 6.14 — AI Invoice Extraction & Draft Items Foundation

## Objetivo

Complementar o parsing fiscal determinístico (Fase 6.6+) com uma
extração estruturada por IA — uma única chamada `AiCompletionProvider`
por documento — capaz de produzir também as **linhas** da fatura
(nunca extraídas deterministicamente até agora), reconciliar os dois
resultados sem escolher automaticamente em caso de conflito, e dar
origem a `InvoiceDraftItem` — staging relacional das linhas antes da
promoção a `InvoiceItem`.

## Âmbito

Pipeline final:

```
Documento PDF/JPG/PNG → OCR → ocrText
  → Fiscal Parsing determinístico (inalterado)
  → AI Invoice Extraction (nova, uma chamada por documento)
  → reconciliação (InvoiceExtractionMerger)
  → InvoiceDraftItem (staging)
  → revisão/correção humana
  → promoção explícita
  → Invoice + InvoiceItem + InvoiceAttachment
```

Multimodal explicitamente fora do âmbito — a entrada da IA é sempre
`ocrText`, nunca o PDF/imagem original. Promoção automática, inventário,
contas a pagar/receber, RAG/embeddings/agentes e billing/quotas também
fora do âmbito.

## Structured output genérico em `@frontcore/ai`

`AiCompletionRequest` ganha `responseFormat?: AiStructuredOutputDefinition`
(`{ name, schema, strict? }`) — aditivo e opcional, mesma disciplina de
`tools` (Fase 8.3): ausente, nenhum provider muda de comportamento.
`packages/ai` continua sem qualquer conhecimento de faturas ou de
qualquer schema concreto — só transporta a definição até ao provider e
devolve o texto da resposta, nunca faz parse por si.

- **OpenRouter**: traduz para o formato OpenAI-compatible
  `response_format: { type: 'json_schema', json_schema: { name, strict,
  schema } }` (`strict` por omissão `true`). Confirmado real contra o
  serviço (`google/gemini-2.5-flash`) — ver "Validação com documentos
  reais", abaixo.
- **Mock**: com `responseFormat` presente, devolve sempre um JSON
  mínimo e determinístico (`{ mock: true, schema: <nome> }`) — prova a
  canalização genérica; consumidores que precisem de testar o seu
  próprio schema constroem o seu próprio duplo de `AiCompletionProvider`
  (mesmo padrão já usado em `ai-chat.e2e-spec.ts`).
- **Ollama**: lança sempre `AiProviderError('unsupported_capability')`
  quando `responseFormat` está presente, antes de qualquer pedido de
  rede — nunca fingir uma capacidade nunca confirmada empiricamente
  contra um servidor real (mesma disciplina do resto do provider); novo
  `AiErrorCode = 'unsupported_capability'`, nunca retryable
  (`withRetries()` inalterado — a exclusão é por omissão, o código não
  está na allow-list).

## Contrato `AiInvoiceExtractionV1`

`apps/frontrest/api/src/ai-invoice-extraction/types/ai-invoice-extraction.ts`
— explicitamente versionado (`schemaVersion: '1'`), decimais financeiros
sempre `string`, campo ausente = `null` (nunca inventado), `items` como
array preservando `position` (ordem do documento). JSON Schema
correspondente (`ai-invoice-extraction.schema.ts`) segue o subconjunto
"strict" OpenAI-compatible (`additionalProperties: false`, toda a
propriedade sempre em `required`, nulidade via `type: [tipo, "null"]`).

`AiInvoiceExtractor` (`ai-invoice-extractor.service.ts`) — uma única
chamada `AiCompletionProvider.complete()` por documento, `system prompt`
explícito (extração literal, `null` quando incerto, nunca calcular,
nunca inventar unidade/IVA/quantidade, preservar descrições/ordem,
datas ISO 8601, nunca confundir cliente com fornecedor).
`parseAiInvoiceExtraction()` valida ESTRUTURALMENTE a resposta antes de
confiar nela — nunca depende só do `responseFormat`/`strict` do
provider; qualquer falha (JSON inválido, fora do schema, provider
indisponível, `unsupported_capability`) resulta em `extraction: null`,
nunca numa exceção — o parsing determinístico continua disponível
independentemente da IA.

Segundo consumidor real de `AI_COMPLETION_PROVIDER` (Fase 8, Chat IA, é
o primeiro) — `AiModule` passou a exportar o token;
`AiInvoiceExtractionModule` importa-o só por isso, nunca por
`AiChatService`/`AiController`.

## Reconciliação — `InvoiceExtractionMerger`

`invoice-extraction-merger.ts` — camada de domínio própria, separada de
`@frontcore/ai` e nunca dentro de `runDocumentExtractors()` (esse motor
resolve conflitos por confiança entre extractors do MESMO tipo; aqui as
duas fontes são estruturalmente diferentes e um "empate" nunca pode ser
resolvido silenciosamente). Por campo:

| Situação | `status` | `suggestedValue` |
|---|---|---|
| Iguais | `agreement` | o valor concordante |
| Diferentes, ambos presentes | `conflict` | `null` — nunca escolhido automaticamente |
| Determinístico vazio, IA presente | `ai_only` | o valor da IA |
| IA vazia, determinístico presente | `deterministic_only` | o valor determinístico |
| Ambos vazios | `empty` | `null` |
| Valor já corrigido manualmente | `manual` | sempre o valor manual, nunca reavaliado |

`subtotal` nunca tem contraparte determinística (`FiscalExtractionResult`
não extrai subtotal) — `deterministicValue` é sempre `null` para esse
campo, documentado, não um bug. `items` é passagem direta de
`AiInvoiceExtractionV1.items` — só a IA os produz.

## Persistência

`packages/database/prisma/schema.prisma` (migration
`20260816181603_add_invoice_draft_item_and_ai_extraction`, aplicada e
validada contra Postgres real — ver "Correções pós-revisão Codex",
abaixo, para os tipos `Decimal` finais):

- **`InvoiceDraftItem`** — staging relacional das linhas,
  `organizationId` explícito (isolamento direto por tenant, sem
  depender de um `include` até `InvoiceDraft`), todos os campos
  extraídos opcionais, `@@unique([invoiceDraftId, position])`, cascade
  ao eliminar o draft.
- **`InvoiceDraftAiExtraction`** — metadata da ÚLTIMA extração
  (`provider`/`model`/`schemaVersion`/`inputTokens`/`outputTokens`/
  `durationMs`/`processedAt`), `@@unique([invoiceDraftId])` (upsert,
  nunca histórico completo — suficiente para "quantos documentos,
  que modelo, quantos tokens", sem billing/quotas).
- **`InvoiceDraft.itemsReviewedByHuman`** (`Boolean @default(false)`) —
  único mecanismo de "não sobrescrever correções humanas" desta fase
  (YAGNI: ao nível do draft, não por campo/linha — as linhas são
  sempre substituídas em bloco). `false` até a primeira gravação
  humana explícita das linhas; a partir daí, uma extração de IA
  seguinte nunca volta a escrever `InvoiceDraftItem` automaticamente,
  mesmo com uma sugestão diferente — a decisão usa sempre o valor
  RELIDO dentro da própria transação de escrita, nunca um snapshot
  anterior à chamada ao provider (ver achado 1, abaixo).
- **`InvoiceItem`** evoluído — `quantity` `Decimal(10,2)→(11,3)`,
  `unitPrice` `Decimal(12,2)→(14,4)` (quantidades/preços com mais de
  duas casas decimais são plausíveis, preservando a capacidade da
  parte inteira do schema anterior a esta fase — ver achado 2, abaixo),
  `position Int @default(1)`, `unit String?`, `vatRate Decimal(5,2)?`
  novos, todos opcionais/com omissão segura —
  `InvoicesService.create()`/`update()` inalterados no caso omisso.

Campos de cabeçalho (`supplierId`/`number`/datas/`totalAmount`) **nunca**
são escritos automaticamente pela extração — mesma disciplina desde a
Fase 6.7/6.8 (sugestões, nunca persistidas sem ação explícita); só as
linhas são persistidas por esta fase, e só sob a proteção de
`itemsReviewedByHuman`.

## API

- `POST /invoices/drafts/:id/ai-extraction` (`MANAGER+`, mutação) —
  corre parsing determinístico + `AiInvoiceExtractor` em paralelo
  (chamada ao provider sempre FORA de qualquer transação), reconcilia,
  e dentro de uma única transação: relê `itemsReviewedByHuman`, persiste
  `InvoiceDraftItem` só se ainda for `false` (incluindo substituir por
  vazio se a extração válida não tiver linhas), faz upsert de
  `InvoiceDraftAiExtraction` — devolve
  `{ reconciliation, itemsPersisted, items }`. Ver achados 1/7/8,
  abaixo.
- `PUT /invoices/drafts/:id/items` (`MANAGER+`) — substituição integral
  das linhas (editar/adicionar/eliminar/reordenar, tudo pelo array
  completo — mesma disciplina "replace-all" de
  `InvoicesService.update()`); marca sempre `itemsReviewedByHuman = true`.
- `PATCH /invoices/drafts/:id/review` (`MANAGER+`, correção
  pós-revisão Codex, achado 9) — grava cabeçalho (`patch`, opcional) e
  linhas (`items`, opcional) dentro da MESMA transação Prisma; a UI de
  revisão usa sempre esta rota, para nunca ficar com um sucesso parcial
  (cabeçalho gravado, linhas não, ou vice-versa) não refletido
  honestamente. `PATCH :id` e `PUT :id/items` continuam disponíveis,
  sem alterações, para outros consumidores.
- `GET /invoices/drafts/:id/fiscal-parsing` (Fase 6.7) inalterado.

**Política única de locking (correção pós-revisão Codex, 2ª ronda —
achado 1 CRÍTICO).** `runAiExtraction()`, `replaceItems()`,
`saveReview()` e `promote()` — os quatro writers que podem competir
entre si sobre o mesmo `InvoiceDraft`/`InvoiceDraftItem` — adquirem
TODOS, como primeira operação dentro da sua transação, o mesmo `SELECT
... FOR UPDATE` sobre a linha `InvoiceDraft` (`id` + `organizationId`
sempre em simultâneo — achado 11), através do único helper partilhado
`lockInvoiceDraftRow()`. Nunca um lock diferente por operação, e nunca
um lock sobre `InvoiceDraftItem` antes do lock sobre `InvoiceDraft` (a
linha pai é sempre bloqueada primeiro, evitando ciclos de deadlock
entre estes quatro writers). Uma segunda transação que tente bloquear a
MESMA linha espera pelo `COMMIT`/`ROLLBACK` da primeira, e só depois lê
o estado — nunca um valor obsoleto lido em paralelo por outra
transação. Ver "Correções pós-revisão Codex — 2ª ronda", abaixo, para a
causa raiz completa e os testes que provam esta propriedade contra
Postgres real.

`InvoiceDraftsService.promote()` — depois do lock, só então lê
`draft`/`InvoiceDraftItem` (sempre por `invoiceDraftId` **e**
`organizationId` em simultâneo) e valida — tudo dentro da mesma
transação, usando sempre `tx`, nunca uma leitura solta anterior à
abertura da transação (ver achado 6, abaixo). Copia as linhas para
`Invoice.items` (`create` aninhado); uma linha com
`quantity`/`unitPrice`/`totalPrice` em falta bloqueia a promoção
inteira (`InvoiceItem` exige estes campos ao nível do schema; a
promoção nunca inventa um valor para "fazer passar"). Promoção sem
nenhuma linha continua permitida — comportamento anterior preservado.
`totalAmount` da `Invoice` continua a vir sempre do cabeçalho do draft
(nunca recalculado a partir da soma das linhas) — decisão deliberada: a
"Coerência matemática" (linhas vs. subtotal vs. total) é só um sinal
para revisão humana, nunca uma correção silenciosa.

## UI

`InvoiceDraftReviewSheet` ganha uma secção "Linhas"
(Descrição/Qtd/Unidade/Preço Unitário/IVA/Total) e um botão "Analisar
com IA" (`MANAGER+`, ação explícita — envolve sempre uma chamada real a
um provider de IA, nunca automática como o parsing fiscal
determinístico/gratuito). `MANAGER+` edita/adiciona/elimina/reordena
linhas livremente; `MEMBER` vê a tabela em texto simples, sem inputs
nem ações — mesma distinção já usada nos campos de cabeçalho. Conflitos
determinístico/IA no cabeçalho mostrados numa secção de reconciliação
(valor + rótulo de estado; `conflict` mostra os dois valores lado a
lado, nunca um escolhido). "Guardar alterações" chama
`PATCH :id/review` (correção pós-revisão Codex, achado 9) — um único
pedido atómico com o cabeçalho (se alterado) e as linhas (se
alteradas), preservando o modelo `formValues`/`savedValues` já
existente, estendido com `itemRows`/`savedItemRows`; antes desta
correção, cabeçalho e linhas eram dois pedidos HTTP independentes
(`PATCH :id` + `PUT :id/items`), o que podia deixar um sucesso parcial
silencioso se o primeiro tivesse sucesso e o segundo falhasse.

## Correções pós-revisão Codex

Uma revisão read-only (Codex) desta fase, já implementada e fechada,
encontrou 11 problemas de concorrência/validação/persistência antes do
fecho definitivo. Todos corrigidos nesta ronda, sem expandir o âmbito
original (sem inventário/multimodal/billing/agentes/RAG):

1. **CRÍTICO — corrida entre `runAiExtraction()` e `replaceItems()`.**
   A versão original lia `itemsReviewedByHuman` ANTES da chamada
   (lenta) ao provider de IA; uma correção humana concorrente durante
   essa espera podia ser silenciosamente apagada quando a extração
   finalmente resolvia. 1ª correção (insuficiente, ver "Correções
   pós-revisão Codex — 2ª ronda", abaixo): a decisão de escrever
   `InvoiceDraftItem` passou a usar o valor relido DENTRO da transação
   — mas sem qualquer lock, o que só reduzia a janela da corrida, nunca
   a eliminava (duas transações concorrentes ainda podiam ler o mesmo
   valor obsoleto em `READ COMMITTED` antes de qualquer uma escrever).
   Eliminada definitivamente na 2ª ronda com `SELECT ... FOR UPDATE`
   partilhado por todos os writers.
2. **ALTO — redução de precisão `Decimal`.** A mudança original
   `Decimal(10,2)→Decimal(10,3)` (`quantity`) e
   `Decimal(12,2)→Decimal(12,4)` (`unitPrice`) reduzia a capacidade da
   parte inteira (8→7 e 10→8 dígitos, respetivamente) — um valor válido
   antes desta fase podia deixar de caber depois dela. Corrigido para
   `Decimal(11,3)`/`Decimal(14,4)`, preservando exatamente a magnitude
   anterior (8/10 dígitos inteiros) enquanto acrescenta as casas
   decimais extra, em `InvoiceItem` e `InvoiceDraftItem`. A migração
   `20260816181603_add_invoice_draft_item_and_ai_extraction` (ainda em
   desenvolvimento, nunca lançada) foi corrigida no próprio ficheiro —
   **contém `ALTER COLUMN`, nunca "puramente aditiva"** (a `CREATE
   TABLE "InvoiceDraftItem"` é a única parte genuinamente aditiva).
   Testes de valor-limite (`ai-invoice-extraction.validators.spec.ts`)
   provam que os valores-limite do schema anterior a esta fase (8
   dígitos inteiros + 2 decimais para `quantity`; 10 + 2 para
   `unitPrice`) continuam representáveis nos tipos corrigidos.
3. **ALTO — `parseAiInvoiceExtraction()` passou a ser uma fronteira
   estrutural real.** Antes: campo obrigatório ausente → `null`; tipo
   errado → `null`; propriedades extra → ignoradas; `position`/decimais
   inválidos podiam passar. Depois: qualquer desvio de
   `AiInvoiceExtractionV1` (`hasExactKeys` a cada nível — ausência de
   uma chave e presença de `null` são explicitamente distintas) invalida
   a resposta INTEIRA (`null`), nunca "corrige" a estrutura do modelo em
   silêncio.
4. **ALTO — validação decimal canónica.** Novo
   `ai-invoice-extraction.validators.ts` (`isCanonicalDecimalString`,
   `isDecimalWithinPrismaLimits`) substitui qualquer `parseFloat`
   permissivo: só aceita sinal `-` opcional + dígitos +
   opcionalmente `.` + dígitos — nunca vírgula, notação científica,
   `NaN`/`Infinity`/string vazia/prefixos parciais. Limites
   (`DECIMAL_LIMITS`) espelham exatamente os tipos Prisma corrigidos —
   um valor fora do limite é rejeitado estruturalmente pelo parser,
   nunca chega a um erro 500 cru do Prisma.
5. **ALTO — validação de `position`.** `isValidPosition()` exige
   inteiro `>= 1`; `parseAiInvoiceExtraction()` rejeita a resposta
   inteira perante `0`, negativo, fracionário, `NaN` ou posições
   duplicadas. 1ª correção (incompleta): sequencialidade continuava
   "ideal, nunca obrigatória" (`[1, 3]` passava). Corrigido na 2ª ronda
   — ver achado 4 dessa secção.
6. **ALTO — lost update na promoção.** A versão original lia
   `draft`/`draftItems` ANTES de abrir a transação; uma alteração
   concorrente entre essa leitura e o `DELETE` final do draft ficava
   perdida silenciosamente. Corrigido com `SELECT ... FOR UPDATE`
   (`tx.$queryRaw`) a bloquear a linha do `InvoiceDraft` logo no início
   da transação — toda leitura/validação subsequente vive dentro da
   mesma transação, usando sempre `tx`.
7. **MÉDIO — semântica de `items: []`.** Uma extração de IA VÁLIDA com
   `items: []`, enquanto `itemsReviewedByHuman` ainda é `false`, limpa
   agora o staging automático anterior para vazio também — antes ficava
   intocado por omissão. Uma extração que FALHOU nunca toca nas linhas
   existentes.
8. **MÉDIO — atomicidade items/metadata.** A escrita de
   `InvoiceDraftItem` e o upsert de `InvoiceDraftAiExtraction` da mesma
   extração passam a viver na MESMA transação — uma falha em qualquer
   parte rejeita a operação inteira, nunca uma persistência parcial.
9. **MÉDIO — sucesso parcial na UI de revisão.** Ver "API"/"UI", acima
   — novo `PATCH :id/review` atómico substitui os dois pedidos
   independentes na UI de revisão.
10. **BAIXO — comparação monetária permissiva no merger.**
    `invoice-extraction-merger.ts` usava `Number.parseFloat` (aceitava
    `"123.00abc"` → `123`); passou a reutilizar `isDecimalEqual()` do
    mesmo validador do achado 4 — só concorda quando ambos os lados são
    strings canónicas válidas.
11. **Multi-tenant.** Todas as queries novas sobre `InvoiceDraftItem`/
    `InvoiceDraftAiExtraction` filtram explicitamente por
    `organizationId`, nunca só por `invoiceDraftId` — incluindo
    `deleteMany`/`findMany` dentro de transações onde o draft já tinha
    sido validado momentos antes (defesa em profundidade).

## Correções pós-revisão Codex — 2ª ronda

Uma segunda revisão Codex, já com a 1ª ronda implementada, confirmou
que a maioria dos 11 achados anteriores estava corrigida, mas
encontrou 1 problema CRÍTICO ainda aberto, 1 ALTO e 1 MÉDIO adicionais
(mais um reforço da suite de testes do achado 1). Todos corrigidos
nesta ronda, sem expandir o âmbito original:

1. **CRÍTICO — serializar TODOS os writers de `InvoiceDraftItem`.**
   Causa raiz: a 1ª correção do achado 1 relia só a releitura de
   `itemsReviewedByHuman` DENTRO da transação, sem qualquer lock —
   duas transações concorrentes (`runAiExtraction()` e
   `replaceItems()`/`saveReview()`) podiam ambas iniciar a sua leitura
   em `READ COMMITTED` antes de qualquer uma escrever, reduzindo a
   janela da corrida mas nunca a eliminando. Correção final: uma
   política ÚNICA de locking, partilhada por `runAiExtraction()`,
   `replaceItems()`, `saveReview()` e `promote()` — o novo helper
   privado `lockInvoiceDraftRow()` adquire `SELECT id FROM
   "InvoiceDraft" WHERE id = ... AND "organizationId" = ... FOR UPDATE`
   como a PRIMEIRA operação dentro de cada transação, antes de
   qualquer leitura/escrita de `InvoiceDraftItem` — nunca um lock
   diferente por operação (que só deslocaria a janela da corrida) e
   nunca um lock sobre a linha filha antes da linha pai (evita ciclos
   de deadlock entre estes quatro writers, que nunca bloqueiam mais do
   que uma única linha `InvoiceDraft` de cada vez). A chamada ao
   provider de IA continua SEMPRE fora de qualquer transação — o lock
   só é adquirido depois de o provider já ter respondido.
2. **CRÍTICO — teste de concorrência real, com as duas ordens de lock
   forçadas deterministicamente.** A suite de testes com Prisma
   mockado (`$transaction` a invocar o callback de imediato, síncrono)
   nunca consegue provar que `FOR UPDATE` serializa verdadeiramente
   dois writers concorrentes — só o Postgres real tem essa semântica.
   Uma 1ª versão da suite de integração ainda não bastava: libertava um
   lock manual e deixava o scheduler do Postgres escolher qual dos dois
   writers o adquiria primeiro — só provava "independentemente da
   ordem, o resultado final é coerente", nunca as DUAS ordens em
   concreto. Corrigido: `test/invoice-drafts-concurrency.integration-spec.ts`
   (`pnpm --filter @frontrest/api test:integration`, config dedicada
   `test/jest-integration.json`, NUNCA parte de `test`/`test:e2e`) —
   liga a um Postgres real (dev local), e usa `waitUntilPidBlocked()`
   (consulta direta a `pg_locks`, nunca `setTimeout` arbitrário) para
   confirmar que o 1º writer já está genuinamente em fila antes de
   arrancar o 2º, e que ambos estão em fila antes de libertar o lock
   manual — como o Postgres serve pedidos em conflito por ordem de
   chegada (FIFO, verificado empiricamente), a ordem fica forçada, nunca
   à mercê do scheduler. **Correção adicional (4ª ronda):** a barreira
   inicial contava `pg_locks` de forma agregada (`count(DISTINCT pid)
   WHERE NOT granted`), provando "existem N backends bloqueados",
   nunca que o backend bloqueado era especificamente o writer deste
   cenário. Cada writer passa agora por `createDedicatedWriter()` —
   uma `InvoiceDraftsService` própria, ligada por UMA ÚNICA conexão
   física (`connection_limit=1`), cujo `pg_backend_pid()` é capturado
   no arranque; `waitUntilPidBlocked(pid)` espera especificamente por
   ESSE pid, identificando o writer concreto do cenário sem
   ambiguidade. Quatro cenários determinísticos, um por ordem
   possível: **A1** (humano ganha o lock primeiro — a IA relê
   `itemsReviewedByHuman=true` depois e não escreve) / **A2** (a IA
   ganha primeiro — chega a escrever o staging, mas `replaceItems()`
   substitui-o a seguir incondicionalmente; o estado final nunca contém
   a sugestão da IA) / **B1** (`replaceItems()` ganha primeiro —
   `promote()` lê sempre o estado mais recente, nunca um snapshot
   anterior ao lock) / **B2** (`promote()` ganha primeiro — apaga o
   `InvoiceDraft`; `replaceItems()` falha 404 ao tentar bloquear uma
   linha já inexistente, nunca escreve linhas órfãs). Um 5º teste (C)
   prova rollback real — uma violação de constraint a meio da escrita
   das linhas (`saveReview()`) desfaz também o `UPDATE` do cabeçalho já
   executado na mesma transação, nunca um estado parcial. Isolada num
   `Organization` de teste próprio, sempre apagado no `afterAll` —
   nunca toca em dados reais permanentes; confirmado sem flakiness em
   10 execuções consecutivas e sem resíduos na base de dados.
3. **ALTO — política de valores negativos.** O parser de IA aceitava
   negativos em qualquer campo decimal, incluindo os de LINHA — mas
   `InvoiceDraftItemDto` (o DTO humano equivalente) já usa `@Min(0)` em
   `quantity`/`unitPrice`/`vatRate`/`totalPrice`, criando duas regras
   financeiras diferentes consoante a origem do valor (IA vs. humano)
   para o MESMO campo. Novo `isNonNegativeDecimal()`
   (`ai-invoice-extraction.validators.ts`) — `isCanonicalDecimalString()`
   continua a reconhecer `"-5.00"` sintaticamente (a IA nunca fica
   impedida de EXTRAIR um valor negativo real de um documento), mas
   `parseNullableDecimal()` no parser passou a receber um parâmetro
   `allowNegative` (omissão `true`): `false` para os quatro campos de
   LINHA, alinhando exatamente com `InvoiceDraftItemDto`; os totais de
   CABEÇALHO (`subtotal`/`vatAmount`/`total`) continuam a aceitar
   negativo — descontos/notas de crédito genuínos já são um caso real
   e aceite ao nível do cabeçalho (`UpdateInvoiceDraftDto.totalAmount`
   não tem `@Min`) — nenhuma política contabilística nova inventada.
   Nenhum DTO humano alterado.
4. **MÉDIO — `position` tem de representar a ordem exata.** A regra
   anterior só exigia `position >= 1` e únicas — `[1, 3]`, `[2, 1]` ou
   `[1, 4, 7]` passavam, contradizendo a promessa do contrato
   ("preservar a ordem das linhas do documento"). Regra final,
   inequívoca, em `parseItems()`: para um array com N linhas,
   `items[i].position` tem de ser exatamente `i + 1` — nunca reordenar
   silenciosamente uma resposta estruturalmente incoerente, rejeitar a
   resposta inteira em vez disso. Esta igualdade estrita já garante,
   por construção, que `position` é inteiro, `>= 1`, único e
   sequencial — o `Set` de posições vistas da 1ª ronda deixou de ser
   necessário.

## Testes

- `packages/ai`: 123 testes (structured output em
  OpenRouter/Mock/Ollama).
- `apps/frontrest/api`: 1178 testes (foco em `ai-invoice-extraction/`:
  `AiInvoiceExtractor` — sucesso, JSON inválido, fora do schema,
  `AiProviderError`/`unsupported_capability`, nunca lança;
  `parseAiInvoiceExtraction` — fronteira estrutural estrita (achado 3
  da 1ª ronda), incl. ausência vs. `null`, propriedades extra, tipos
  errados, política de negativos de linha (achado 3 da 2ª ronda) e
  `position` sequencial exata (achado 4 da 2ª ronda);
  `ai-invoice-extraction.validators.spec.ts` — decimal canónico,
  limites Prisma, valores-limite do schema anterior, `position`,
  `isNonNegativeDecimal`; `reconcileInvoiceExtraction` — os 6 estados
  de reconciliação + datas + comparação decimal estrita;
  `InvoiceDraftsService` — CRUD de items, `runAiExtraction`/
  `replaceItems`/`saveReview`/`promote` incl. a política única de
  locking `lockInvoiceDraftRow()` (ordem do `SELECT ... FOR UPDATE`
  antes de qualquer escrita, 404 quando o lock não encontra a linha,
  em cada um dos 4 writers), o teste com Promise real e controlada para
  o "provider" (achado 1/2 da 2ª ronda), semântica de `items: []`,
  atomicidade items/metadata, `saveReview()`).
  `test:integration` (`pnpm --filter @frontrest/api test:integration`,
  fora de `pnpm test`) — 5 testes contra Postgres real (A1/A2/B1/B2 —
  as duas ordens de lock forçadas deterministicamente — e C, rollback),
  ver "Correções pós-revisão Codex — 2ª ronda", achado 2.
- e2e: 207 testes (39 em `invoice-drafts.e2e-spec.ts`, incl. bloco
  dedicado com provider de IA fabricado — extração → correção humana →
  nova extração não sobrescreve → promoção reflete a correção, nunca a
  sugestão original — e o `PATCH :id/review`).
- Frontend: 136 testes (28 em `invoice-draft-review-sheet.test.tsx` —
  MEMBER read-only, adicionar/editar/eliminar/reordenar linha,
  descrição vazia bloqueia guardar, "Analisar com IA" + reconciliação,
  `saveInvoiceDraftReview()` combinado e o cenário de falha do achado 9
  sem aplicar estado parcial).
- Regressão (Fase 6.13): `fiscal-parsing.regression.spec.ts` e
  `__fixtures__/fixtures.ts` **não tocados** — continuam a proteger só
  `ocrText → FiscalExtractionResult` determinístico.

## Validação com documentos reais

Executada contra o serviço **OpenRouter real** (`google/gemini-2.5-flash`,
chave já configurada em `.env`), autorizada explicitamente pelo
utilizador, sobre 5 dos 15 documentos reais/sintéticos já usados pela
suite de regressão (Fase 6.13): `farmacia-monumental-real.txt`,
`coca-cola.txt`, `mercedes.txt`, `ovos-girao.txt`, `pingo-doce.txt`.

**Resultados factuais** (script de validação, não commitado — depende
de rede/crédito real, incompatível com CI):

- **Validade estrutural**: 5/5 respostas passaram
  `parseAiInvoiceExtraction()` — nunca `null` por falha de schema.
- **Cabeçalho — concordância**: `supplierTaxId` concorda em 3/3
  documentos onde ambas as fontes o encontram (511234740, 511081383,
  511022220); `total` concorda em 4/5 (37.80 / 145.54 / 93.17 / 48.00)
  sempre que ambas as fontes o encontram.
- **Cabeçalho — `supplierName` em conflito em 4/5 documentos** — mas
  sempre pela mesma razão: o extractor determinístico inclui ruído de
  OCR que a IA exclui (ex. `"|! FARMACTA MONUMENTAL..."` vs.
  `"FARMACTA MONUMENTAL UNIPESSOAL LDA"`; sufixo `"SE oieA"` na
  Coca-Cola; saudação do cliente `"Exmo.(s) Sr.(s)"` a vazar no nome do
  fornecedor Nunes & Freitas). O `status: 'conflict'` está a cumprir
  exatamente a função pedida — nunca escolhe automaticamente, mesmo
  quando um dos dois lados é visivelmente mais correto.
- **`mercedes.txt` — o determinístico não encontrou nenhuma data, número
  ou total; a IA encontrou os 6 campos** (`ai_only` em todos) — prova
  concreta de valor acrescentado real em formatos que os 9 extractors
  regex não cobrem (documento de financiamento automóvel, layout muito
  distinto de uma fatura de retalho).
- **Linhas**: extraídas com sucesso nos 5 documentos, incluindo casos
  estruturalmente difíceis — linhas de desconto/promoção tratadas como
  linhas próprias em vez de fundidas no produto (Coca-Cola:
  `"PROMO-DN MARCAS VR"`/`"Desc Base"`; Pingo Doce:
  `"Poupança Imediata"`), quantidades decimais de produtos vendidos a
  peso (`"2.125"`, `"0.345"` kg), e `null` correto em campos não
  determináveis por linha (unidade/IVA ausentes em várias linhas do
  Pingo Doce) — nunca um valor inventado.
- **Custo/latência reais** (metadata capturada): ~1200 tokens de
  entrada / ~700 de saída, ~3 segundos por documento (`pingo-doce.txt`:
  1236/713 tokens, 3161 ms) — primeira medição real disponível para a
  pergunta "qual o custo médio por documento".

Não afirmado sem medir: os números acima são os observados nesta
validação pontual (5 documentos, um único modelo) — nunca uma garantia
estatística sobre precisão geral do modelo.

## Limitações conhecidas

- `subtotal` nunca tem contraparte determinística — a reconciliação
  para esse campo é sempre `ai_only`/`empty`, nunca `conflict`/
  `deterministic_only`.
- `itemsReviewedByHuman` é uma flag ao nível do DRAFT, não por linha —
  uma segunda extração depois de revisto substitui zero ou todas as
  linhas, nunca uma seleção parcial.
- `ManualInvoiceExtractionValues` (parâmetro do merger para valores já
  corrigidos manualmente, campo a campo) está implementado e testado,
  mas nenhum chamador real o preenche ainda — os campos de cabeçalho de
  `InvoiceDraft` continuam sem rastreabilidade de "já corrigido
  manualmente" (nunca necessário nesta fase: nunca são escritos
  automaticamente, ao contrário das linhas).
- `OllamaAiProvider` rejeita sempre `responseFormat` — nunca validado
  empiricamente se as versões recentes do Ollama nativo suportam
  structured output com segurança; decisão explícita de não fingir.
- Validação com documentos reais limitada a 5 dos 15 disponíveis, um
  único modelo (`google/gemini-2.5-flash`) — nunca testado contra
  outro modelo/provider.
- `pnpm --filter @frontrest/api test:integration` (Correções
  pós-revisão Codex — 2ª ronda, achado 2) exige um Postgres real
  acessível em `DATABASE_URL` (por omissão, o `docker compose` local) —
  nunca corre em CI/ambientes sem essa dependência disponível; por
  isso fica deliberadamente fora de `pnpm test`/`pnpm test:e2e`, nunca
  bloqueia a validação normal da fase.

## Trabalho futuro

- Preencher `ManualInvoiceExtractionValues` a partir de rastreabilidade
  real por campo do cabeçalho, se uma fase futura decidir também
  persistir sugestões de cabeçalho automaticamente (hoje continuam
  transitórias, nunca aplicadas sem ação explícita).
- Fallback multimodal (enviar a imagem/PDF diretamente ao provider)
  quando existir evidência real de que o `ocrText` linearizado perde
  estrutura crítica de tabelas — registado como candidato, nunca
  implementado nesta fase.
- Validação com mais documentos/modelos, se surgir necessidade real de
  medir precisão de forma mais ampla.
