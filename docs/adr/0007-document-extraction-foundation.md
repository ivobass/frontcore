# ADR-0007: Document Extraction Foundation — motor genérico de extração de campos

- **Estado:** Aceite
- **Data:** 2026-07-13
- **Fase:** 6.10 — Document Extraction Foundation

## Contexto

Desde a Fase 6.6, `FiscalParsingService` (`apps/frontrest/api/src/fiscal-parsing/`)
resolve dois problemas ao mesmo tempo dentro da mesma classe: (a) um
**motor genérico** — correr N extractors independentes sobre o mesmo
texto, resolver conflitos quando mais do que um devolve um match para o
mesmo campo (maior confiança vence; empate → ordem de registo), agregar
metadata de execução — e (b) a **especialização de domínio** — o enum
`FiscalField`, a forma `FiscalExtractionResult`, os 9 extractors regex/
heurísticos de fatura. (a) não tem nenhuma noção de fatura, fornecedor
ou restaurante; (b) tem.

O contrato `FiscalExtractor<T>.extract()` era síncrono — decisão
deliberada da Fase 6.6, mas já então registada como temporária: o
próprio comentário do contrato previa, por escrito, que um extractor
que precisasse de I/O real (um provider de IA via `@frontcore/ai`, um
modelo local correndo como processo externo) exigiria uma mudança
breaking a essa assinatura e a `FiscalParsingService.parse()`.

Nasceu a necessidade concreta (não hipotética) de preparar essa
mudança: a Fase 6.10 pede uma arquitetura onde OCR tradicional, parsing
determinístico, e (numa fase futura, não implementada aqui) IA/modelos
locais/modelos cloud possam coexistir como extractors intercambiáveis,
sem que a introdução de um novo tipo de extractor exija voltar a tocar
nos 9 extractors existentes nem em `FiscalParsingService`.

## Decisão

**Extrair o motor genérico para um novo módulo,
`apps/frontrest/api/src/document-extraction/`** — não um package novo,
não `packages/ai`. `fiscal-parsing/` passa a ser um consumidor fino
desse motor, especializado em `FiscalField`/`FiscalExtractionResult`,
sem alteração de comportamento observável (mesmo `GET
/invoices/drafts/:id/fiscal-parsing`, mesmo `FiscalExtractionResult`,
mesmos 9 extractors, mesmas regras de conflito).

Contrato novo, genérico sobre `TField extends string`:

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

`ExtractionMatch<T>` e `DocumentExtractionMetadata<TField>` movem-se
para `document-extraction/types/` — `fiscal-parsing/` deixa de os
definir, passa a reutilizá-los (`FiscalExtractionMetadata` é agora
`type FiscalExtractionMetadata = DocumentExtractionMetadata<FiscalField>`,
não uma cópia). `FiscalExtractor<T>` passa a
`type FiscalExtractor<T> = DocumentExtractor<FiscalField, T>` — uma
especialização, não uma segunda definição do mesmo conceito.

`extract()` passa a `async` nos 9 extractors existentes — mudança
puramente de assinatura, nenhuma lógica interna foi alterada (uma
função `async` que devolve um valor síncrono embrulha-o numa `Promise`
já resolvida, sem custo real).

## Onde não vive, e porquê

- **`packages/ai`** — rejeitada para o motor. Esse package é
  especificamente o contrato de *fornecedor* de IA (completions),
  ortogonal a "correr N extractors e resolver conflitos por confiança"
  — o motor nem sequer precisa de IA para existir (os 9 extractors
  regex já o provam). Um futuro extractor de IA usaria `packages/ai`
  *dentro* da sua própria implementação de `DocumentExtractor`, nunca
  o motor a depender de `packages/ai`.
- **Novo package `packages/document-extraction`** — rejeitada por YAGNI:
  sem segundo consumidor real hoje (só `fiscal-parsing/` o usa), o
  mesmo raciocínio já usado para recusar `@frontcore/fiscal-parsing`
  (Fase 6.6) e `DocumentDraft` genérico (Fase 6.3). Reversível e barato
  de mover mais tarde, se/quando um segundo produto FrontCore precisar.
- **Manter tudo dentro de `fiscal-parsing/`** — rejeitada: não resolve a
  duplicação futura. No dia em que existir um segundo tipo de documento
  (recibo, guia), a lógica do motor teria de ser copiada, ou
  `fiscal-parsing/` deixaria de fazer sentido só como "fiscal".

## Consequências

**Positivas**
- Um segundo tipo de documento futuro (recibo, guia, encomenda,
  orçamento, nota de crédito) reutiliza `runDocumentExtractors()` sem
  copiar lógica — só define o seu próprio enum de campos e resultado.
- Um extractor de IA (fase futura, não implementada aqui) pluga-se no
  mesmo `FISCAL_EXTRACTORS`/`FiscalParsingService` sem alterar o
  contrato outra vez — a assinatura assíncrona já está pronta.
- Nenhum consumidor (`InvoiceDraftsService.parseFiscalData()`, o
  endpoint HTTP, o frontend) precisou de qualquer alteração —
  `FiscalExtractionResult` é devolvido exatamente igual.

**Negativas / trade-offs aceites**
- Refactor de grande superfície (9 extractors + 9 specs + serviço +
  2 specs de módulo/serviço tocados só pela mudança de assinatura) —
  mitigado por cobertura de teste já existente para cada um.
- `document-extraction/` fica hoje com um único consumidor real
  (`fiscal-parsing/`) — aceite conscientemente como o mesmo tipo de
  "extração antecipada de responsabilidade" já usado, com sucesso, para
  justificar módulos internos de app antes de um package (ver Fase 6.6).

## Alternativas consideradas

Ver secção "Onde não vive, e porquê", acima — analisadas e descartadas
com justificação explícita, não hipóteses não exploradas.
