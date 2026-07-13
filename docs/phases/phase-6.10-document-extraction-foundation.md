# Fase 6.10 — Document Extraction Foundation

## Objetivo

Preparar a arquitetura para que OCR tradicional, parsing determinístico
(regex/heurísticas) e, numa fase futura, IA/modelos locais/modelos
cloud possam coexistir como extractors intercambiáveis de campos de um
documento — sem que a introdução de um novo tipo de extractor exija
voltar a alterar os extractors existentes, o serviço que os orquestra,
ou qualquer consumidor. Esta fase **não implementa IA** — só a
fundação. Ver `docs/adr/0007-document-extraction-foundation.md` para a
decisão completa (contexto, alternativas, consequências).

## Âmbito

Extração do motor genérico de `FiscalParsingService` para um novo
módulo, `apps/frontrest/api/src/document-extraction/`; contrato
`DocumentExtractor<TField, TValue>` assíncrono; `fiscal-parsing/`
refactorado para consumir esse motor, sem alteração de comportamento
observável. Fora do âmbito, explicitamente: qualquer fornecedor de IA
(OpenAI/Claude/Gemini/Azure/Ollama), prompts, embeddings, agentes, RAG,
chat, preview de PDF, editor visual, treino de modelos, persistência
automática, `InvoiceDraftItem`, alteração ao schema Prisma, alterações
à UI, alterações ao OCR Worker/pipeline OCR, alterações a `packages/ai`.

## Estado anterior

`FiscalParsingService.parse(ocrText: string): FiscalExtractionResult`
(Fase 6.6), síncrono, misturava dentro da mesma classe o motor de
orquestração (correr N extractors, resolver conflitos por confiança,
agregar metadata) com a especialização de domínio (`FiscalField`,
`FiscalExtractionResult`, os 9 extractors de fatura). O próprio
comentário de `fiscal-extractor.ts` já previa, por escrito, que um
extractor com I/O real exigiria tornar `extract()` assíncrono — decisão
adiada na Fase 6.6, resolvida agora.

## Arquitetura implementada

```
Documento → OCR (packages/ocr) → Document Extraction (motor genérico)
          → Fiscal Parsing (especialização: fatura) → Invoice Draft Review → Invoice
```

`apps/frontrest/api/src/document-extraction/` (novo módulo, mesma app —
não um package, ver ADR-0007):

```ts
interface DocumentExtractor<TField extends string, TValue> {
  readonly field: TField;
  extract(ocrText: string): Promise<ExtractionMatch<TValue> | null>;
}

function runDocumentExtractors<TField extends string>(
  extractors: DocumentExtractor<TField, unknown>[],
  ocrText: string,
): Promise<{ matches: Map<TField, ExtractionMatch<unknown>>; metadata: DocumentExtractionMetadata<TField> }>;
```

Extractors correm em paralelo (`Promise.all`) — cada um é independente;
resolução de conflitos idêntica à do motor anterior (maior confiança
vence, empate → ordem de registo no array de entrada, preservado porque
`Promise.all` devolve resultados na ordem de entrada, não na ordem de
resolução).

`apps/frontrest/api/src/fiscal-parsing/` passa a consumidor fino:
`FiscalExtractor<T>` é agora `type FiscalExtractor<T> =
DocumentExtractor<FiscalField, T>` (especialização, não duplicação);
`ExtractionMatch<T>` e a metadata deixam de ser definidos aqui —
`FiscalExtractionMetadata` é `type FiscalExtractionMetadata =
DocumentExtractionMetadata<FiscalField>`. `FiscalParsingService.parse()`
passa a `async`, delega a execução+resolução a `runDocumentExtractors()`
e só monta `FiscalExtractionResult` a partir do `Map` genérico
devolvido — a lógica de montagem (`assemble()`/`get()`) é inalterada.

Os 9 extractors existentes (`SupplierExtractor`, `TaxNumberExtractor`,
`CustomerExtractor`, `InvoiceNumberExtractor`, `InvoiceDateExtractor`,
`DueDateExtractor`, `CurrencyExtractor`, `TotalsExtractor`,
`VatExtractor`) só tiveram a assinatura alterada (`extract()` →
`async extract(): Promise<...>`) — nenhuma lógica interna mudou.

## Onde uma futura camada de IA se encaixaria (não implementado)

Um extractor de IA (fase futura) implementaria `DocumentExtractor<FiscalField, T>`
(ou `FiscalExtractor<T>`, o alias), chamando `@frontcore/ai` (contrato
de provider já existente, zero consumidores hoje) dentro do seu próprio
`extract()`, e seria registado em `FISCAL_EXTRACTORS` ao lado dos 9
extractors regex — a resolução de conflitos por confiança já existente
decide qual vence, sem nenhum mecanismo de arbitragem novo. Nenhum
consumidor (`InvoiceDraftsService`, `GET .../fiscal-parsing`, o
frontend) precisaria de saber que IA existe.

## Ficheiros criados

```
apps/frontrest/api/src/document-extraction/contracts/document-extractor.ts
apps/frontrest/api/src/document-extraction/contracts/index.ts
apps/frontrest/api/src/document-extraction/types/extraction-match.ts
apps/frontrest/api/src/document-extraction/types/document-extraction-metadata.ts
apps/frontrest/api/src/document-extraction/types/index.ts
apps/frontrest/api/src/document-extraction/document-extraction.engine.ts
apps/frontrest/api/src/document-extraction/document-extraction.engine.spec.ts
apps/frontrest/api/src/document-extraction/index.ts
docs/adr/0007-document-extraction-foundation.md
docs/phases/phase-6.10-document-extraction-foundation.md
```

## Ficheiros alterados

```
apps/frontrest/api/src/fiscal-parsing/contracts/fiscal-extractor.ts    — especialização de DocumentExtractor
apps/frontrest/api/src/fiscal-parsing/types/index.ts                   — ExtractionMatch reexportado de document-extraction
apps/frontrest/api/src/fiscal-parsing/types/invoice-extraction.ts      — import de ExtractionMatch atualizado
apps/frontrest/api/src/fiscal-parsing/types/fiscal-extraction-result.ts — FiscalExtractionMetadata como alias
apps/frontrest/api/src/fiscal-parsing/fiscal-parsing.service.ts        — parse() async, delega no motor genérico
apps/frontrest/api/src/fiscal-parsing/fiscal-parsing.service.spec.ts   — async/await, beforeAll para o resultado partilhado
apps/frontrest/api/src/fiscal-parsing/fiscal-parsing.module.spec.ts    — await
apps/frontrest/api/src/fiscal-parsing/extractors/*.extractor.ts (9)    — extract() assíncrono, lógica inalterada
apps/frontrest/api/src/fiscal-parsing/extractors/*.extractor.spec.ts (9) — async/await
docs/adr/README.md, docs/INDEX.md, docs/PHASES.md, docs/ARCHITECTURE.md
```

## Ficheiros removidos

```
apps/frontrest/api/src/fiscal-parsing/types/extraction-match.ts — reexportado de document-extraction, não duplicado
```

Nenhuma migration Prisma. `InvoiceDraft`/`Invoice`/promoção, Worker OCR,
`packages/ocr`, `packages/ai`, `apps/frontrest/web`, contrato HTTP de
`GET /invoices/drafts/:id/fiscal-parsing` **inalterados**.

## Decisões arquiteturais

Ver `docs/adr/0007-document-extraction-foundation.md` — contexto
completo, alternativas comparadas (`packages/ai`, novo package,
manter tudo em `fiscal-parsing/`) e consequências aceites.

## Testes

`document-extraction.engine.spec.ts` (novo, 6 testes): mapa vazio sem
extractors; ignora `null` sem afetar outros campos; conflito por
confiança independente da ordem de registo; empate exato → primeiro do
array; `fieldsFound` sem duplicados; não lança para texto vazio — os
mesmos comportamentos que antes viviam dispersos dentro de
`fiscal-parsing.service.spec.ts`, agora testados diretamente no motor
que os implementa.

Todos os 9 `*.extractor.spec.ts` e `fiscal-parsing.service.spec.ts`/
`fiscal-parsing.module.spec.ts` atualizados para `async`/`await` — zero
alteração de asserções, só da forma de invocação.

## Validação (comandos)

- `pnpm --filter @frontrest/api typecheck` — limpo.
- `pnpm --filter @frontrest/api test` — limpo, **212 testes** (21
  suites, +6 do motor genérico face aos 206 anteriores).
- `pnpm --filter @frontrest/api test:e2e` — limpo, **74/74**, sem
  nenhuma alteração — confirma que o contrato HTTP externo
  (`GET .../fiscal-parsing`) é bit-a-bit idêntico ao anterior.
- `pnpm typecheck` (raiz) — 23/23. `pnpm build` — 14/14. `pnpm test` —
  16/16 tarefas.

## Limitações conhecidas

- `document-extraction/` tem hoje um único consumidor real
  (`fiscal-parsing/`) — aceite conscientemente (ver ADR-0007); não é
  ainda um package porque não há um segundo produto/consumidor real a
  justificá-lo.
- Extractors correm em paralelo (`Promise.all`) — para os 9 extractors
  regex de hoje isto não é observável (síncronos na lógica); só passa a
  ter efeito real quando existir um extractor com I/O.
- Nenhuma alteração ao `@frontcore/ai` — o contrato de provider
  genérico existente (Fase 1, zero consumidores) continua tal como
  estava; a integração real fica para uma fase futura.

## Trabalho futuro

Extractor de IA real (fase futura, fora do âmbito desta) implementando
`DocumentExtractor<FiscalField, T>` sobre `@frontcore/ai`; segunda
especialização de documento (recibo, guia) reutilizando
`runDocumentExtractors()`; `InvoiceDraftItem` quando existir um
extractor real de linhas a produzir dados para armazenar.

## Critérios de conclusão

- [x] Motor genérico extraído, sem duplicar `ExtractionMatch`/metadata.
- [x] `FiscalExtractionResult`/`GET .../fiscal-parsing` inalterados externamente.
- [x] Contrato `DocumentExtractor` assíncrono, provider-agnóstico (nenhuma menção a fornecedor de IA em código).
- [x] Nenhum extractor de IA, prompt, SDK ou chamada externa.
- [x] Nenhuma alteração a Prisma/`InvoiceDraftItem`/UI/OCR Worker/`packages/ai`.
- [x] `pnpm typecheck`/`build`/`test`/`test:e2e` limpos, sem regressão.
- [x] ADR criada; `docs/phases/phase-6.10-*.md`, `PHASES.md`, `INDEX.md`, `ARCHITECTURE.md` atualizados.
- [x] Git limpo — aguarda commit/tag/push pelo utilizador (não executado nesta fase).

## Próxima fase

Por decidir — candidatos naturais: extractor de IA real sobre
`@frontcore/ai` (ver "Onde uma futura camada de IA se encaixaria",
acima); segunda especialização de documento (recibo/guia); validação
manual interativa no browser da Fase 6.8 (ainda pendente, herdada).
