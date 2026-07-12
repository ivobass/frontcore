# Fase 6.7 — Fiscal Parsing Draft Integration Foundation

## Objetivo

Criar o primeiro consumidor real de `FiscalParsingService` (Fase 6.6),
ligando-o a `InvoiceDraft` de forma simples e explícita: um endpoint
síncrono que executa o pipeline de parsing fiscal sobre o `ocrText` já
persistido num draft e devolve o resultado estruturado, sem persistência
automática, sem tocar no Worker/filas, sem alterar o schema Prisma nem a
promoção para `Invoice`.

## Âmbito

Só a ligação entre `InvoiceDraftsService`/`InvoiceDraftsController` e
`FiscalParsingService`. Fora do âmbito, explicitamente: IA/LLM,
validação real de NIF/VIES, regras fiscais por país, frontend de
revisão, edição manual, supplier matching, parsing de linhas de fatura,
alterações a providers OCR, Dead Letter Queue, promoção automática dos
dados extraídos para `Invoice`, novos packages, migration Prisma.

## Estado anterior

- `InvoiceDraft` (Fase 6.3) já tinha `ocrText`/`ocrConfidence`,
  escritos pelo Worker (Fase 6.4/6.5). Nenhum campo estruturado
  (fornecedor, datas, totais) existia no schema.
- `FiscalParsingService.parse(ocrText: string): FiscalExtractionResult`
  (Fase 6.6) existia, puro e síncrono, mas **sem nenhum consumidor
  real** — `FiscalParsingModule` não era importado por `AppModule` nem
  por `InvoicesModule`.

## Alternativas comparadas

| Opção | Avaliação |
|---|---|
| 1. Endpoint síncrono, sem persistência | **Escolhida.** Mínimo acoplamento — zero migration, zero alteração ao Worker/filas, zero alteração à promoção. `parse()` já é síncrono e opera sobre texto de página única — sem justificação para assincronia. Idempotente por construção (função pura). |
| 2. Endpoint síncrono + persiste no draft | Exigiria migration (campos novos ou tabela própria), e uma decisão sobre o que fazer quando o rascunho já tem valores preenchidos manualmente e o parsing é repetido — nenhum consumidor (UI) real hoje a justificar essa decisão. |
| 3. Parsing automático após OCR no Worker | Acoplaria o Worker (infraestrutura, `apps/frontrest/workers`) a um módulo hoje inteiramente da API (`apps/frontrest/api/src/fiscal-parsing`) — exigiria mover o módulo ou criar uma dependência entre apps, que o FrontCore não permite. |
| 4. Fila/job dedicado para parsing fiscal | Complexidade desproporcional para uma operação síncrona, sub-segundo, sem I/O — não há nada a enfileirar. |

Decisão aprovada: **Opção 1**, coerente com "Trabalho futuro" da Fase
6.6 ("sob pedido via endpoint" citado como alternativa a "automático") e
reversível de forma barata para a Opção 2, caso uma fase futura precise
de persistência — `parse()` já devolve exatamente a estrutura que seria
gravada.

## Decisões arquiteturais

### `FiscalParsingModule` importado por `InvoicesModule`

Mesmo padrão de `UploadsModule`/`QueueModule`, já importados pelo mesmo
módulo. `FiscalParsingService` é injetado no construtor de
`InvoiceDraftsService` — um serviço único continua responsável por
todas as operações sobre `InvoiceDraft` (`create`/`findAll`/`findOne`/
`update`/`remove`/`promote`/`parseFiscalData`), em vez de um controller
ou serviço paralelo.

### `GET`, não `POST`

`GET /invoices/drafts/:id/fiscal-parsing` — a operação não tem efeitos
secundários (sem escrita, função pura sobre dados já persistidos) e é
idempotente por construção; semântica REST mais correta que `POST` para
"calcular e devolver". Sem colisão de rota com `GET :id`: o Express só
despacha `:id` para caminhos de exatamente um segmento — um caminho com
`/fiscal-parsing` a mais nunca corresponde a essa rota, ao contrário do
cenário resolvido na Fase 6.3 (`GET /invoices/drafts` vs.
`GET /invoices/:id`, mesmo número de segmentos, controllers diferentes).

### Sem `@Roles()` — mesmo alcance de `findOne`/`findAll`

Qualquer membro autenticado da organização pode consultar, tal como já
acontece nas restantes operações de leitura de `InvoiceDraft`. Só
`create`/`update`/`remove`/`promote` (operações que escrevem) exigem
`MANAGER+`.

### Reutilização de `findOne()` para validação

`parseFiscalData()` chama `this.findOne(organizationId, id)` antes de
tudo — reutiliza a validação de posse por organização já testada
(`NotFoundException` para draft inexistente ou de outra organização),
em vez de duplicar a query.

### `ocrText` ausente ou vazio → `BadRequestException`

`draft.ocrText` pode ser `null` (OCR ainda não correu, ou falhou —
`ocrStatus: FAILED`) ou, em teoria, uma string vazia/só espaços.
`parseFiscalData()` rejeita ambos os casos com uma mensagem controlada
("Este rascunho ainda não tem texto OCR disponível para processamento
fiscal."), nunca chamando `FiscalParsingService.parse()` com texto
inútil.

### Sem DTO de resposta novo

`FiscalExtractionResult` (Fase 6.6) já é uma interface simples —
valores, confiança e origem por campo, sem nada interno (sem IDs de
base de dados, sem detalhes de infraestrutura) — devolvida diretamente
pelo controller, sem wrapper. Criar um DTO novo só para replicar a
mesma forma seria duplicação sem propósito.

### Idempotência e ausência de efeitos laterais

Garantidas pela composição de duas propriedades já existentes: `findOne()`
não escreve nada, e `FiscalParsingService.parse()` é uma função pura
(Fase 6.6, "sem `Prisma`, sem HTTP, sem fila — a mesma entrada produz
sempre a mesma saída"). `parseFiscalData()` não introduz nenhum estado
novo — chamar o endpoint duas vezes com o mesmo `ocrText` devolve
sempre o mesmo `FiscalExtractionResult` (testado explicitamente, unitário
e e2e), e nunca escreve em `InvoiceDraft` (testado explicitamente —
`prisma.invoiceDraft.update` nunca é chamado).

## Contrato HTTP

`GET /invoices/drafts/:id/fiscal-parsing`

| Cenário | Resposta |
|---|---|
| Draft inexistente ou de outra organização | `404` |
| Draft sem `ocrText` (`null` ou string vazia/só espaços) | `400` |
| Sucesso | `200`, corpo = `FiscalExtractionResult` |

Sem autenticação → `401` (herdado do `JwtAuthGuard` global, `AppModule`).

## Ficheiros alterados

```
apps/frontrest/api/src/invoices/invoices.module.ts                    — importa FiscalParsingModule
apps/frontrest/api/src/invoices/drafts/invoice-drafts.service.ts       — + FiscalParsingService injetado, + parseFiscalData()
apps/frontrest/api/src/invoices/drafts/invoice-drafts.service.spec.ts  — + 7 testes (secção "parseFiscalData (Fase 6.7)")
apps/frontrest/api/src/invoices/drafts/invoice-drafts.controller.ts    — + GET :id/fiscal-parsing
apps/frontrest/api/test/invoice-drafts.e2e-spec.ts                     — + 8 testes (secção "GET :id/fiscal-parsing (Fase 6.7)")
apps/frontrest/api/src/fiscal-parsing/fiscal-parsing.module.ts         — comentário "sem consumidor" corrigido
docs/PHASES.md, docs/INDEX.md, docs/ARCHITECTURE.md
```

Nenhuma migration Prisma. `Invoice`/`InvoicesService`/`InvoicesController`,
promoção, Worker, filas, `apps/frontrest/web`, schema Prisma **inalterados**.

## Testes adicionados

**Unitários** (`invoice-drafts.service.spec.ts`, secção "parseFiscalData
(Fase 6.7)", 7 testes): draft inexistente → `NotFoundException`
(delega em `findOne`); draft de outra organização → `NotFoundException`,
query confirma filtro `organizationId`; `ocrText` `null` → `BadRequestException`;
`ocrText` vazio/só espaços → `BadRequestException`; `ocrText` válido →
devolve o `FiscalExtractionResult` do pipeline real (instância real de
`FiscalParsingService` com os 9 extractors reais, não mockada — pipeline
puro, sem necessidade de mock); duas chamadas com o mesmo `ocrText`
devolvem o mesmo resultado (idempotência, exclui `metadata.processingTimeMs`
da comparação — único campo não determinístico, medição de tempo sem
relação com o resultado do parsing); nenhuma escrita em `InvoiceDraft`.

**e2e** (`invoice-drafts.e2e-spec.ts`, secção "GET :id/fiscal-parsing
(Fase 6.7)", 8 testes): sem token → `401`; draft inexistente → `404`;
draft de outra organização → `404`; sem `ocrText` → `400`; `ocrText`
vazio → `400`; `MEMBER` consegue consultar (sem `@Roles()`); resultado
correto devolvido (fornecedor + NIF + confiança); nenhuma escrita
(`prisma.invoiceDraft.update` não chamado); chamadas repetidas
idempotentes.

## Validação (comandos)

- `pnpm --filter @frontrest/api typecheck` — limpo.
- `pnpm --filter @frontrest/api test` — limpo, **196 testes** (189
  existentes + 7 novos de `parseFiscalData`).
- `pnpm --filter @frontrest/api test:e2e` — limpo, **72 testes** (64
  existentes + 8 novos).
- `pnpm typecheck`/`build`/`test` (raiz) — sem regressões em nenhum
  package/app do monorepo.

## Limitações conhecidas

- **Resultado transitório, não persistido** — decisão desta fase (ver
  "Alternativas comparadas"), não uma lacuna: repetir o pedido repete o
  cálculo (rápido, sem I/O) em vez de ler um valor guardado.
- **Síncrono sobre texto potencialmente grande** — `FiscalParsingService.parse()`
  corre no mesmo request/thread; um `ocrText` anormalmente grande
  bloquearia o event loop por mais tempo que uma query normal. Aceitável
  para esta fundação (mesma ordem de grandeza de regex sobre texto de
  página única, já assumida pela Fase 6.6); sem limite de tamanho de
  `ocrText` imposto nesta fase.
- **Herdado da Fase 6.6, inalterado**: sem validação de dígito de
  controlo de NIF, sem seleção de regras por país, datas por extenso
  não suportadas.

## Trabalho futuro

- Persistir o resultado do parsing no `InvoiceDraft` (Opção 2, rejeitada
  nesta fase por falta de consumidor real) — campos explícitos vs. JSON
  vs. modelo próprio continua uma decisão em aberto.
- Pré-preencher `supplierId`/`issueDate`/`totalAmount` do draft a partir
  do resultado do parsing (sugestão automática, nunca escrita direta
  sem confirmação humana).
- UI de rascunhos a consumir este endpoint.
- Parsing automático após o Worker OCR concluir (mirroring Fase 6.2→6.4),
  só quando existir um consumidor real a justificar o acoplamento
  adicional ao Worker.
- Validação fiscal real (dígito de controlo de NIF, IVA intracomunitário).

## Critérios de conclusão

- [x] Primeiro consumidor real de `FiscalParsingService` ligado a `InvoiceDraft`.
- [x] Solução escolhida justificada face às alternativas.
- [x] Isolamento por organização garantido (reutiliza `findOne()`).
- [x] Draft inexistente tratado (`404`).
- [x] Draft sem `ocrText` válido tratado (`400`).
- [x] Resultado preserva valores, confiança, origem e metadata (`FiscalExtractionResult` devolvido sem alteração).
- [x] Chamadas repetidas determinísticas, sem efeitos laterais (testado).
- [x] Contrato público de `FiscalParsingService` inalterado.
- [x] Worker e filas inalterados.
- [x] `Invoice` e promoção inalterados.
- [x] Testes unitários adicionados (7).
- [x] Testes e2e adicionados (8).
- [x] `pnpm typecheck`/`build`/`test`/`test:e2e` limpos, sem regressões.
- [x] Documentação da Fase 6.7 criada; `PHASES.md`/`INDEX.md`/`ARCHITECTURE.md` atualizados.
- [x] Observações para fases futuras — nenhuma encontrada fora do já registado em "Limitações conhecidas"/"Trabalho futuro".
- [x] Git limpo — aguarda commit/tag/push pelo utilizador (não
      executado nesta fase, por instrução explícita).

## Próxima fase

Por decidir — candidatos naturais: persistência do resultado do parsing
no `InvoiceDraft`; UI de rascunhos; recovery manual de OCR (já preparado
desde a Fase 6.5). Ver "Trabalho futuro".
