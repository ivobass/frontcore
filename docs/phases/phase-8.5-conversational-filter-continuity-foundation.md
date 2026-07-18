# Fase 8.5 — Conversational Filter Continuity Foundation

## Objetivo

Corrigir e consolidar a aplicação de filtros explícitos presentes em
mensagens de continuação, garantindo que substituem corretamente os
filtros herdados mesmo quando a mensagem não contém um verbo ou uma
intenção financeira completa — "só as pagas", "apenas as canceladas",
"só as vencidas", "só as pendentes", "e dessas, quantas estão pagas?".

## Âmbito

Separação explícita, em três responsabilidades distintas, da resolução
de um filtro de estado a partir de uma mensagem de chat: resolução de
**intenção** (`financial-intent.resolver.ts`, inalterada na sua
responsabilidade); extração do **filtro da mensagem atual** (módulo
novo, `financial-filter.extractor.ts`); **herança do contexto
anterior** (`FinancialRetrievalService`, inalterada na sua estrutura,
só na fonte do filtro). Inclusão explícita de `PENDING` como estado
extraível (nunca excluído artificialmente). Mantido fora do âmbito:
comparação de períodos (candidata a Fase 8.6, não iniciada nesta
fase); alterações ao Dashboard e Reports; memória persistente; OCR;
frontend; providers; resolução de entidades nomeadas isoladas como
primeira mensagem (comportamento já existente da Fase 8.4, inalterado).

## Estado inicial

A Fase 8.4 introduziu `SPECIFIC_STATUS_PATTERN` diretamente em
`financial-intent.resolver.ts`, que produzia tanto a intenção
(`FinancialIntentType`) como o filtro de estado (`statusFilter`, no
mesmo objeto `FinancialIntentResolution`) — duas responsabilidades
distintas (decidir a intenção da mensagem; extrair um filtro
explícito) misturadas na mesma função e no mesmo tipo de retorno.
`FinancialRetrievalService.resolveFilters()`/`recoverFilters()` liam
`statusFilter` diretamente de `intentResolution`, incluindo na
recuperação por histórico — `recoverFilters()` chamava
`resolveFinancialIntent(pastMessage)` só para obter o `statusFilter`
de uma mensagem passada, obrigando a extração do filtro a depender
sempre de uma intenção também ter sido resolvida. Este acoplamento
nunca causou uma regressão observável nos exemplos testados até à
Fase 8.4, mas concentrava duas responsabilidades num único módulo,
dificultando a reutilização futura da extração de filtro isolada
(ex. um filtro combinado com uma intenção diferente, ou reutilizado
fora do fluxo de intenção).

## Arquitetura final

### Bloco 1 — Extração pura do filtro da mensagem atual

`apps/frontrest/api/src/ai/financial-retrieval/financial-filter.extractor.ts`
(novo) — `resolveStatusFilter(message: string): InvoiceStatus |
undefined`, pura e síncrona, sem I/O, sem conhecimento de intenção
financeira nem de histórico conversacional. Única fonte de verdade
para "esta mensagem pede explicitamente um estado". Exige sempre um
sinal explícito de contagem/filtro (`quantas`/`quantos`/`número de`/
`contagem`/`mostra(r)`/`lista(r)`/`só`/`apenas`) imediatamente antes de
uma palavra de estado (`pendente(s)`/`paga(s)`/`pago(s)`/`vencida(s)`/
`cancelada(s)`) — nunca um estado isolado, para nunca criar um falso
positivo a partir de uma frase como "Isto já está pago." `PENDING`
está incluído sem exclusão: a distinção com `OUTSTANDING_BALANCE`
(Pendente + Vencida combinado, decisão da Fase 8.3, preservada) nunca
depende da palavra "pendente" em si, só da presença deste sinal
explícito — "Existem faturas pendentes?"/"quanto tenho por pagar"
nunca contêm o sinal, por isso continuam a resolver via
`OUTSTANDING_PATTERN`, inalterado.

Dependência estritamente unidirecional:
`financial-intent.resolver.ts → financial-filter.extractor.ts`, nunca
o inverso — `resolveStatusFilter()` nunca importa nem chama
`resolveFinancialIntent()`, para poder ser reutilizado no futuro
(outro tipo de consulta, outro consumidor) sem acoplamento a lógica de
intenção.

### Bloco 2 — Intenção estreitada à sua única responsabilidade

`financial-intent.resolver.ts` — `FinancialIntentResolution` deixou de
transportar `statusFilter`; passou a ser exatamente `{ kind:
'SUPPORTED'; intent: FinancialIntentType } | { kind: 'UNSUPPORTED' }`.
O ponto de verificação que antes usava `SPECIFIC_STATUS_PATTERN`
passou a reutilizar `resolveStatusFilter(text) !== undefined` — mesma
posição na cadeia de prioridade (depois de `LARGEST_INVOICES_PATTERN`,
antes de `OUTSTANDING_PATTERN`), preservando exatamente a regressão
real da Fase 8.3 ("Existem faturas pendentes?"/"quanto tenho por
pagar", sem sinal explícito, continuam a resolver `OUTSTANDING_BALANCE`)
e o comportamento novo da Fase 8.4 ("quantas pendentes", com sinal,
isola corretamente `FINANCIAL_SUMMARY` em vez do combinado). O ficheiro
usa a extração só para decidir se uma mensagem sem nenhum outro sinal
de intenção merece o `intent` de fallback `FINANCIAL_SUMMARY` — nunca
expõe o valor do filtro no seu retorno.

### Bloco 3 — Herança de contexto desacoplada da intenção

`FinancialRetrievalService` — `resolveFilters()` (mensagem atual)
deixou de receber `intentResolution` como parâmetro; passou a chamar
`resolveStatusFilter(message)` diretamente. `recoverFilters()`
(histórico) deixou de chamar `resolveFinancialIntent(pastMessage)`
para obter um filtro; passou a chamar `resolveStatusFilter(pastMessage)`
diretamente sobre cada mensagem anterior. Em ambos os casos, o filtro
da mensagem atual (quando presente) tem sempre prioridade absoluta
sobre o herdado do histórico, por dimensão independente — a
substituição de estado nunca depende de fornecedor/categoria também
terem sido substituídos na mesma mensagem, e vice-versa (o objeto de
filtros nunca é substituído por inteiro, só a dimensão que a mensagem
atual resolve).

### Decisão: remoção direta de `statusFilter`

`statusFilter` foi removido diretamente de `FinancialIntentResolution`
nesta fase, em vez de mantido por compatibilidade com preenchimento
duplo durante uma transição:

- **Contrato interno, nunca público**: `FinancialIntentResolution` é
  um tipo interno de `financial-intent.resolver.ts`, nunca exposto por
  nenhum controller, DTO ou resposta HTTP — uma alteração ao seu
  formato não pode quebrar nenhum consumidor externo à API interna do
  módulo `ai/`.
- **Consumidores pesquisados e confirmados**: pesquisa exaustiva (grep)
  por `FinancialIntentResolution`/`statusFilter` em todo o
  repositório, antes de qualquer alteração, confirmou exatamente 2
  ficheiros de produção como consumidores —
  `financial-intent.resolver.ts` (produtor) e
  `financial-retrieval.service.ts` (único consumidor, em
  `resolveFilters()` e `recoverFilters()`). Nenhum controller, nenhuma
  tool, nenhum teste e2e, nenhum outro serviço depende do campo.
  `resolveNamedFilters()` (caminho das AI Tools, usado por
  `retrieveForIntent()`) já lia `status` diretamente dos argumentos da
  tool-call, nunca de `FinancialIntentResolution` — confirmado
  inalterado.
- **Manter `statusFilter` teria criado duas fontes de verdade**: com
  `resolveStatusFilter()` já a existir como extrator dedicado, manter
  `FinancialIntentResolution.statusFilter` como campo preenchido em
  paralelo (por compatibilidade) exigiria decidir, em cada ponto de
  leitura, qual das duas fontes é a correta — exatamente o acoplamento
  que esta fase existe para eliminar, com risco real de as duas
  divergirem silenciosamente numa alteração futura a qualquer uma
  delas.
- **Remoção protegida por TypeScript e validações reais**: a remoção
  do campo do tipo é uma alteração estrutural detetável em tempo de
  compilação — `pnpm --filter @frontrest/api typecheck` confirmado
  limpo (0 erros) depois da remoção, prova direta de que nenhum
  consumidor foi esquecido; adicionalmente confirmado por
  `pnpm build`, `pnpm test` (696/696) e `pnpm --filter @frontrest/api
  test:e2e` (143/143), todos limpos.
- **`resolveStatusFilter()` passa a ser a única fonte de verdade** para
  "esta mensagem pede explicitamente um filtro de estado", reutilizada
  identicamente pela mensagem atual e pela recuperação por histórico —
  nunca duas implementações divergentes da mesma extração.

Com exatamente 2 consumidores internos, ambos alterados nesta mesma
fase, e a garantia estrutural do compilador, a remoção direta
manteve-se a opção mais simples e segura — uma transição de
compatibilidade teria adicionado complexidade (dois campos a manter
sincronizados) sem reduzir um risco real mensurável.

> **Princípio**: a extração de filtros da mensagem deve permanecer
> independente da resolução da intenção, permitindo reutilização
> futura sem acoplamento entre parsing linguístico e lógica de
> negócio.

## Ficheiros criados

```
apps/frontrest/api/src/ai/financial-retrieval/financial-filter.extractor.ts
apps/frontrest/api/src/ai/financial-retrieval/financial-filter.extractor.spec.ts
docs/phases/phase-8.5-conversational-filter-continuity-foundation.md
```

## Ficheiros alterados

```
apps/frontrest/api/src/ai/financial-retrieval/financial-intent.resolver.ts (+ .spec.ts) — FinancialIntentResolution deixa de transportar statusFilter; reutiliza resolveStatusFilter()
apps/frontrest/api/src/ai/financial-retrieval/financial-retrieval.service.ts (+ .spec.ts) — resolveFilters()/recoverFilters() chamam resolveStatusFilter() diretamente, nunca via intentResolution
apps/frontrest/api/src/ai/router/financial-relevance.classifier.spec.ts — teste de confirmação: palavra de estado isolada continua vocabulário financeiro-adjacente por desenho, nunca um falso positivo de intenção (responsabilidade de resolveFinancialIntent()/resolveStatusFilter())
docs/PHASES.md, docs/INDEX.md, docs/ARCHITECTURE.md
```

Sem alteração a `dashboard.service.ts`, `reports.service.ts`,
`financial-context.builder.ts`, `ai-tool-orchestrator.service.ts`,
`financial-tool.registry.ts`, `ai-chat.service.ts`, `packages/ai`, a
nenhum provider, ao frontend, ao schema Prisma, a nenhuma migration,
ou a OCR.

## Testes

`financial-filter.extractor.spec.ts` (23, novo): as 5 frases exigidas
("só as pagas", "apenas as canceladas", "só as vencidas", "só as
pendentes", "e dessas, quantas estão pagas?"); variações já existentes
da Fase 8.4 (regressão); frases reais sem sinal explícito
("Existem faturas pendentes?", "quanto tenho por pagar") continuam
`undefined`; estado mencionado sem sinal ("Isto já está pago.", "A
fatura está vencida.") continua `undefined`; insensibilidade a
acentos/maiúsculas; singular/plural.

`financial-intent.resolver.spec.ts` (39, +6): as 5 frases exigidas
resolvem `FINANCIAL_SUMMARY` sem `statusFilter` no retorno; regressão
exata de "Existem faturas pendentes?"/"quanto tenho por pagar" →
`OUTSTANDING_BALANCE`; "só as pendentes"/"só as vencidas" (sinal sem
verbo de contagem) → `FINANCIAL_SUMMARY`; "Isto já está pago." →
`UNSUPPORTED` (palavra de estado isolada nunca cria intenção falsa).

`financial-retrieval.service.spec.ts` (47, +11): as 5 frases exigidas
como continuação, com histórico de estado diferente, confirmando
prioridade absoluta da mensagem atual; substituição independente de
estado/fornecedor/categoria herdados (cada dimensão testada
isoladamente); recuperação de intenção **e** filtro do histórico via
`resolveStatusFilter()`, nunca via `FinancialIntentResolution
.statusFilter` (removido); mensagem não financeira isolada, fora de
qualquer continuação, nunca cria um falso positivo.

`financial-relevance.classifier.spec.ts` (18, +1): confirma que uma
palavra de estado isolada, mesmo sem contexto financeiro nem sinal de
continuação, continua `FINANCIAL` por desenho (vocabulário
financeiro-adjacente deliberadamente amplo, decisão da Fase 8.4,
preservada) — o filtro de falso positivo de **intenção** é
responsabilidade de `resolveFinancialIntent()`/`resolveStatusFilter()`,
nunca deste classificador de relevância.

## Comandos de validação executados

| Comando | Resultado |
|---|---|
| `pnpm typecheck` | 24/24 |
| `pnpm build` | 14/14 |
| `pnpm test` | 18/18 tarefas — `@frontrest/api` 696/696 |
| `pnpm --filter @frontrest/api test:e2e` | 143/143 (incl. `ai-chat.e2e-spec.ts`) |

## Validação manual (Docker, `POST /api/ai/chat` real)

Stack reconstruída (`docker compose build api && docker compose up -d
api`) para incluir o código desta fase antes da validação — os
contentores anteriores (`frontcore-api`, até 2h de uptime) antecediam
as alterações. Confirmado `frontcore-api` saudável após o rebuild.

Sessão real de continuação, autenticada via `POST /api/auth/login`
(utilizador de validação já existente), sobre `POST /api/ai/chat`:

1. "Quantas faturas pagas este mês?" (mensagem inicial, estabelece
   `conversationId` e contexto financeiro) → resposta determinística
   sobre o estado `PAID`.
2. "só as pagas" (continuação) → `PAID`, correto.
3. "apenas as canceladas" (continuação) → "faturas Canceladas no
   período de 2026-07-01 a 2026-07-31" — `CANCELLED` corretamente
   substituído sobre o `PAID` herdado.
4. "só as vencidas" (continuação) → `OVERDUE`, substituído
   corretamente.
5. "só as pendentes" (continuação) → `PENDING`, substituído
   corretamente — confirma `PENDING` extraído sem exclusão artificial.
6. "e dessas, quantas estão pagas?" (continuação) → `PAID`, correto.

Confirmado adicionalmente: "Isto já está pago." (mensagem isolada, sem
continuação, organização sem histórico financeiro recente na janela)
→ resposta de fallback determinístico ("Não tenho essa informação
disponível... Posso ajudar com...") — nunca um dado financeiro
fabricado, confirmando que a palavra de estado isolada não cria um
falso positivo de intenção mesmo classificada `FINANCIAL` pelo router
(Bloco desta fase, ver testes do classificador).

A organização usada para a validação manual não tinha fornecedores nem
categorias cadastrados — a substituição de filtros de fornecedor/
categoria não pôde ser exercida manualmente com dados reais nesta
sessão; permanece coberta extensivamente pelos testes automatizados
(`financial-retrieval.service.spec.ts`, casos de substituição de
fornecedor e categoria herdados).

## Limitações conhecidas

- **Sinal de filtro exige uma das palavras fixas do conjunto fechado**
  (`quantas`/`quantos`/`número de`/`contagem`/`mostra(r)`/`lista(r)`/
  `só`/`apenas`) imediatamente antes da palavra de estado — uma
  fraseação totalmente nova fora deste conjunto não é reconhecida
  (mesma disciplina determinística das fases anteriores, nunca uma
  correspondência semântica).
- **Substituição de filtro de fornecedor/categoria não validada
  manualmente nesta fase** por ausência de dados reais na organização
  de validação — coberta só por testes automatizados (ver "Testes").
- Confirmação visual manual no browser não tecnicamente possível neste
  ambiente (mesma limitação já registada em fases anteriores) — sem
  alteração ao frontend nesta fase, mitigado pela validação real via
  `POST /api/ai/chat`.

## Fora do âmbito (confirmado, não implementado)

Comparação de períodos (candidata registada a **Fase 8.6 — Financial
Period Comparison Foundation**, não iniciada, não aprovada nesta
fase); alterações ao Dashboard e Reports; memória conversacional
persistente; OCR; alterações ao frontend; alterações a providers;
resolução de entidades nomeadas isoladas como primeira mensagem
(comportamento já existente da Fase 8.4, inalterado); refactors
oportunistas fora dos módulos afetados.

## Critérios de conclusão

- [x] Filtro de estado da mensagem atual tem sempre prioridade sobre o
      herdado do histórico, por dimensão independente.
- [x] `PENDING` extraído corretamente, sem exclusão artificial.
- [x] "quanto tenho por pagar"/"Existem faturas pendentes?" continuam
      `OUTSTANDING_BALANCE`, regressão da Fase 8.3 preservada.
- [x] Extração do filtro isolada da resolução de intenção, dependência
      unidirecional confirmada (`financial-intent.resolver.ts →
      financial-filter.extractor.ts`, nunca o inverso).
- [x] `statusFilter` removido de `FinancialIntentResolution`, decisão
      justificada e documentada.
- [x] Palavras de estado isoladas nunca criam falsos positivos de
      intenção fora de uma continuação.
- [x] Testes obrigatórios das 5 frases + substituição de fornecedor/
      categoria/estado herdados adicionados.
- [x] `pnpm typecheck`/`build`/`test`/`test:e2e` limpos.
- [x] Validação manual real via `POST /api/ai/chat` (Docker
      reconstruído com o código desta fase).
- [x] Documentação da fase criada e índices arquiteturais atualizados.
- [x] Comparação de períodos, Dashboard, Reports, frontend, memória
      persistente e OCR confirmados fora do âmbito, não tocados.

## Próxima fase

**Fase 8.6 — Financial Period Comparison Foundation** (candidata
registada, não iniciada, não aprovada) — comparação entre períodos
("Compara maio com junho", "e comparado com o mês passado?"),
identificada como um objetivo distinto desta fase por introduzir
alterações transversais ao Dashboard, Reports, retrieval, context
builder, tools e testes.
