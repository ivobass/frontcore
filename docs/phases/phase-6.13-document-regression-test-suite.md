# Fase 6.13 — Document Regression Test Suite

## Objetivo

Proteger permanentemente o pipeline `ocrText → FiscalExtractionResult`
contra regressões, usando texto OCR de documentos reais já validados
manualmente nas Fases 6.8–6.12. Reutiliza inteiramente a infraestrutura
já existente (Jest, `FiscalParsingService`, os 9 extractors) — nenhuma
abstração nova.

## Âmbito

Só a camada de teste. Nenhum extractor, contrato, endpoint, schema ou
comportamento observável foi alterado. Nenhum ficheiro de teste
existente foi tocado — `fiscal-parsing.service.spec.ts` e
`supplier.extractor.spec.ts` mantêm as suas fixtures inline
inalteradas, exatamente como pedido ("não fazer refactors apenas para
eliminar duplicação").

## Estado anterior

A proteção contra regressão do pipeline de parsing fiscal existia, mas
dispersa: `fiscal-parsing.service.spec.ts` tinha um bloco "documentos
reais" com texto OCR embutido inline; `supplier.extractor.spec.ts`
tinha uma segunda cópia parcialmente sobreposta dos mesmos documentos.
Nenhum ficheiro dedicado, nenhuma razão documentada por documento,
nenhuma estrutura pensada para crescer — cada ronda de estabilização
desta sessão (Fases 6.8–6.12) precisou de comparação manual
(`git worktree`, scripts ad-hoc) para detetar regressões entre versões
do motor de parsing.

## Decisão de arquitetura: texto OCR congelado, nunca o documento original

A suite testa `FiscalParsingService.parse(ocrText)` contra texto OCR
já capturado (um ficheiro `.txt` por documento), nunca o PDF/imagem
original nem uma execução real do Tesseract. Motivo: testar contra o
documento original misturaria dois problemas ortogonais — "o OCR mudou
de qualidade" (não determinístico, depende da versão do Tesseract/
ambiente) vs. "o parsing regrediu" (determinístico, é o que esta suite
protege). A qualidade do OCR em si já tem a sua própria suite dedicada
em `packages/ocr`.

## Organização das fixtures

```
apps/frontrest/api/src/fiscal-parsing/__fixtures__/
  pingo-doce.txt
  ovos-girao.txt
  jmv.txt
  ilha-pan.txt
  coca-cola.txt
  leroy.txt
  mercedes.txt
  farmacia-esperanca-png-novo.txt
  farmacia-esperanca-pdf-1.txt
  farmacia-esperanca-pdf-2.txt
  farmacia-esperanca-png-antigo.txt
  farmacia-monumental-real.txt
  farmacia-monumental-sintetica.txt
  datas-incoerentes.txt
  nota-de-credito.txt
  fixtures.ts
```

Um ficheiro `.txt` por documento (nunca um único ficheiro TypeScript
gigante com todo o texto embutido) — cada documento fica isolado para
revisão/diff/versionamento independentes. `fixtures.ts` só descreve
metadados (`name`/`file`/`reason`/`expected`), nunca contém texto OCR.

**13 documentos reais** (texto capturado diretamente da base de dados
de desenvolvimento, mesmos IDs de rascunho já usados na validação
manual das Fases 6.8–6.12) + **2 documentos sintéticos** (`datas-
incoerentes`, `nota-de-credito`) para as duas categorias que a Fase
6.12 identificou como não tendo nenhum documento real disponível.

Cada fixture tem um campo `reason` obrigatório, uma frase concreta
explicando porque aquele documento está na suite (ex. "regressão do
NIF do cliente", "rótulo Contribuinte", "IVA múltiplo", "OCR muito
ruidoso", "data implausível") — nunca "documento de teste" genérico.

## Baseline, não ideal

`expected`, em cada fixture, é a **baseline atual confirmada** —
calculada correndo `FiscalParsingService.parse()` (build atual,
pós-Fase 6.12) contra cada texto e usando exatamente o resultado
devolvido, campo a campo. Nunca o valor ideal. Dois exemplos onde isto
é explícito no `reason`: Coca-Cola (NIF do cliente, limitação
conhecida, não corrigida) e Mercedes (nome do fornecedor imperfeito,
mas melhor do que o "Pr" anterior).

**Regra permanente, registada aqui para não se perder**: se um
extractor melhorar no futuro, a ordem é sempre (1) alterar o
extractor, (2) validar manualmente contra o documento real, (3) só
depois atualizar `expected` — nunca o contrário. Atualizar `expected`
sem validação manual prévia transformaria a suite em documentação de
intenção, não em proteção real.

## Suite

`fiscal-parsing.regression.spec.ts` — um único ficheiro, usa
`describe.each(REGRESSION_FIXTURES)` (Jest nativo) para gerar um
`describe`/`it` por documento, lê o `.txt` correspondente com
`fs.readFileSync`, corre `FiscalParsingService.parse()`, e afirma
igualdade estrutural contra `expected` (fornecedor, NIF, cliente,
número, datas, moeda, total, IVA — todos os campos de
`FiscalExtractionResult`, não só o que motivou a inclusão do
documento).

## Ficheiros criados

```
apps/frontrest/api/src/fiscal-parsing/__fixtures__/*.txt (15 ficheiros)
apps/frontrest/api/src/fiscal-parsing/__fixtures__/fixtures.ts
apps/frontrest/api/src/fiscal-parsing/fiscal-parsing.regression.spec.ts
docs/phases/phase-6.13-document-regression-test-suite.md
```

## Ficheiros alterados

```
docs/PHASES.md
docs/INDEX.md
```

Nenhum outro ficheiro tocado — confirmado por `git status` no final da
fase.

## Resultados dos testes

- `pnpm typecheck` — 23/23.
- `pnpm build` — 14/14.
- `pnpm test` (raiz) — 17/17 tarefas; `@frontrest/api`: **386/386**
  (371 pré-existentes + **15 novos**, todos verdes à primeira execução
  — a baseline foi calculada diretamente a partir do comportamento
  atual, nunca escrita "à mão").
- `pnpm --filter @frontrest/api test:e2e` — 80/80, inalterado.

## Hardening pós-validação manual

Fixture "Coca-Cola" atualizada: `invoiceNumber` deixa de ser `null` —
`"Fatura/Recibo : ZFRC B036/9823519819"` passou a ser reconhecido por
`InvoiceNumberExtractor` (novo padrão `WITH_COLON_SEPARATOR_PATTERN`,
`invoice-number.extractor.ts`), deixando de ser uma limitação conhecida
para este campo. Detalhe completo (causa raiz, correção, ficheiros) em
`docs/phases/phase-6.8-invoice-draft-review-ui-foundation.md`, secção
"Hardening pós-validação manual — OCR Fiscal Parsing & Invoice
Promotion" — não repetido aqui.

## Limitações conhecidas

- A suite protege só a camada `ocrText → FiscalExtractionResult` — não
  cobre Upload/OCR real/Worker/Review UI/Save/Promote como cadeia
  única automatizada; essas etapas já têm a sua própria cobertura
  dedicada (ver "Estado atual dos testes" na análise desta fase),
  deliberadamente fora do âmbito aqui.
- `expected` inclui, deliberadamente, comportamentos imperfeitos já
  documentados como limitação conhecida (Mercedes — NIF do cliente,
  moeda "USD" da fixture "Coca-Cola") — a suite protege contra
  regressão, não afirma que estes valores estão corretos.

## Observações para fases futuras

- **Problema encontrado**: fixtures duplicadas em
  `fiscal-parsing.service.spec.ts`/`supplier.extractor.spec.ts`
  continuam a existir, deliberadamente não tocadas nesta fase (pedido
  explícito: "não fazer refactors apenas para eliminar duplicação").
  **Impacto**: continua o risco de divergência silenciosa já registado
  na Fase 6.12. **Sugestão**: reavaliar consolidação numa fase futura
  dedicada, só quando isso reduzir claramente manutenção sem aumentar
  risco. **Prioridade**: Baixa (já não é a única proteção de
  regressão existente, como era antes desta fase).

## Critérios de conclusão

- [x] Existe uma Regression Suite dedicada (`fiscal-parsing.regression.spec.ts`).
- [x] Fixtures organizadas em ficheiros `.txt` separados, um por documento.
- [x] Cada documento tem uma razão documentada (`reason`).
- [x] Sem abstrações desnecessárias (Jest nativo, `describe.each`).
- [x] Sem refactors cosméticos — ficheiros de teste existentes inalterados.
- [x] A suite protege regressões reais (não cobertura artificial) — cada fixture liga-se a um achado real ou uma categoria identificada na Fase 6.12.
- [x] Testes existentes continuam válidos — 371/371 pré-existentes inalterados.
- [x] Todos os testes continuam verdes — 386/386 unitários, 80/80 e2e.
- [x] Documentação da fase criada.
- [x] `PHASES.md`/`INDEX.md` atualizados.

## Próxima fase

Candidatos naturais, por ordem já recomendada na Fase 6.12: Token
Refresh (sem dependência técnica, alto impacto diário); Validation
Layer mais ampla, se surgir evidência real; Supplier Resolution como
camada própria.
