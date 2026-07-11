# Fase 6.6 — Fiscal Parsing & Structured Extraction Foundation

## Objetivo

Construir a primeira camada que interpreta o texto bruto produzido pelo
OCR (Fase 6.2) e o transforma numa estrutura fiscal normalizada —
determinística (regex/heurísticas), sem IA/LLM. Fundação análoga à
Fase 6.2 (`@frontcore/ocr`): a capacidade em si, testável de forma
isolada, sem integração com persistência ainda.

## Âmbito

Só o serviço de parsing e os extractors. Fora do âmbito, explicitamente:
IA/LLM/machine learning, escrita em `InvoiceDraft`/`Invoice`, endpoint
HTTP, integração com o Worker OCR, regras por país além da estrutura de
extensão, validações fiscais (ex. validação de NIF por dígito de
controlo), UI.

## Decisão de localização: `apps/frontrest/api`, não um package novo

**Revista numa auditoria técnica posterior a esta fase** (ver "Revisão
técnica", abaixo) — a justificação original ("interpreta conceitos de
domínio que vivem exclusivamente em `apps/frontrest`") não resiste bem
a escrutínio: o código implementado não toca em `Supplier`/`Invoice`
do Prisma nem em nenhuma regra de negócio de restaurante — é puro
`string` → struct, tão domain-agnostic na sua lógica interna quanto
`@frontcore/ocr`. Uma leitura literal de `docs/CODING_STANDARDS.md`
("Lógica específica de restaurante pertence a `apps/frontrest`") não
se aplica diretamente aqui, porque nada neste módulo é específico de
restaurante.

A justificação correta é outra, e mais forte: **YAGNI / ausência de
segundo consumidor real**, não "é lógica de domínio". `docs/ai/AI_WORKFLOW.md`
("Execution Mode") proíbe explicitamente arquitetura para "problemas
hipotéticos, sem consumidor real"; a Fase 6.3 aplicou o mesmo raciocínio
ao rejeitar um `DocumentDraft` genérico ("só quando existir um segundo
tipo de documento real... a justificar a generalização"). Hoje há
exactamente zero consumidores reais deste módulo (nem sequer está
importado por `AppModule`) — criar `@frontcore/fiscal-parsing` agora
seria generalizar antes de existir procura. Se um segundo produto
FrontCore precisar exactamente disto, a migração é barata: os
extractors não têm nenhuma dependência de `apps/frontrest` (nem
Prisma, nem HTTP, nem conceitos de restaurante) — mover
`fiscal-parsing/` para um package novo seria, nesse momento, uma
operação quase mecânica (mover ficheiros + trocar `@Injectable()` por
convenção do package + apontar o `import`), não uma reescrita. É essa
reversibilidade barata que torna seguro adiar a decisão em vez de a
antecipar.

Módulo novo: `apps/frontrest/api/src/fiscal-parsing/`, ao lado dos
restantes módulos de domínio (`invoices/`, `suppliers/`,
`expense-categories/`). Estrutura interna (`types/`, `contracts/`,
`utils/`, `extractors/`) espelha deliberadamente `packages/ocr/src/`
(`types/`, `contracts/`, `providers/`, `services/`, `utils/`) — mesma
filosofia de organização, aplicada dentro de um módulo de app em vez de
um package.

## Decisões arquiteturais

### 1. `FiscalExtractor<T>` — o mesmo padrão de `OCRProvider`

```ts
export interface FiscalExtractor<T> {
  readonly field: FiscalField;
  extract(ocrText: string): ExtractionMatch<T> | null;
}
```

Cada extractor é uma classe `@Injectable()` independente, sem
dependências entre si — nenhum extractor lê o resultado de outro.
`null` significa "não encontrado", nunca uma exceção (extractors nunca
lançam para dados em falta, só para erros de programação genuínos, que
não deveriam poder acontecer dado que só operam sobre `string`).
Adicionar um extractor novo é: (a) um valor novo em `FiscalField`, (b)
uma classe nova que implementa `FiscalExtractor<T>`, (c) registá-la em
`FiscalParsingModule` e injetá-la em `FiscalParsingService`.

### 2. `FiscalParsingService` — pipeline sem I/O, extractors injetados via token de coleção

`parse(ocrText: string): FiscalExtractionResult` corre todos os
extractors sobre o mesmo texto, recolhe os resultados num
`Map<FiscalField, ExtractionMatch<unknown>>` e monta o resultado final.
Sem `Prisma`, sem HTTP, sem fila — a mesma entrada produz sempre a
mesma saída (puro, testável sem mocks de infraestrutura).

**Revisto duas vezes em auditorias técnicas posteriores a esta fase.**
A primeira versão injetava cada extractor como um parâmetro de
construtor próprio (9 parâmetros nomeados) — viável com 9, mas um code
smell real a 20–30. A segunda versão introduziu um token de coleção,
`FISCAL_EXTRACTORS` (`fiscal-extractors.token.ts`), mas ainda listava
as 9 classes em quatro sítios dentro do módulo (`providers`,
parâmetros nomeados da factory, array de retorno da factory, `inject`)
— sem nada a impedir a ordem do `inject` de dessincronizar da ordem
dos parâmetros da factory (um erro silencioso: NestJS injeta
posicionalmente, TypeScript não valida que a ordem das duas listas
corresponde). **Versão atual**: uma única constante,
`EXTRACTOR_CLASSES` (`fiscal-parsing.module.ts`), reutilizada por
`providers` (spread) e por `inject` (spread) — a mesma lista, uma vez
só, elimina essa classe de erro por construção. A `useFactory` deixou
de nomear parâmetros um a um: `(...extractors: FiscalExtractor<unknown>[]) => extractors`,
um rest parameter que captura o array na mesma ordem de `inject` — não
foi assumido que isto funciona, foi verificado empiricamente contra o
container real do NestJS (`fiscal-parsing.module.spec.ts`, ver
"Testes adicionados"). `FiscalParsingService` continua com um único
parâmetro, `@Inject(FISCAL_EXTRACTORS) extractors: FiscalExtractor<unknown>[]`.
Adicionar um extractor novo agora só toca em `EXTRACTOR_CLASSES` — nem
o resto do módulo, nem a service, mudam.

Cada extractor continua registado como provider NestJS normal (não
`useValue: [new X(), ...]`, que seria mais curto) — preserva a
capacidade de um extractor futuro ter as suas próprias dependências
injetadas (ex. um cliente HTTP para um extractor de IA). Mesmo padrão
de nome de `QUEUE_CONSUMER`/`OBJECT_STORAGE`, mas motivo diferente:
aqueles escondem uma implementação de infraestrutura substituível;
este agrega N providers do mesmo contrato numa lista injetável — o
problema estrutural que resolve é "lista de parâmetros", não "trocar a
implementação".

Se dois extractors devolverem um match para o **mesmo** `FiscalField`
(cenário só possível quando existir um segundo extractor por campo —
ex. um extractor por país a par de um genérico, ver decisão 6), o
pipeline guarda o de maior confiança, nunca "o último a correr" — essa
ambiguidade existia silenciosamente na primeira versão (um `Map.set()`
sem verificar se já havia um match anterior) e foi corrigida antes de
ser um bug real, coberta por teste. Em empate exato de confiança,
vence o primeiro extractor a ser registado em `EXTRACTOR_CLASSES` —
regra determinística e testada, não pretende ser "melhor" do que
"o último vence", só previsível.

### 3. Forma do resultado — confiança e origem em cada campo, não centralizadas

```ts
interface FiscalExtractionResult {
  supplier: ExtractionMatch<SupplierExtraction> | null;
  supplierTaxId: ExtractionMatch<string> | null;
  customer: ExtractionMatch<CustomerExtraction> | null;
  invoice: InvoiceExtraction;   // number/issueDate/dueDate/currency, cada um ExtractionMatch<T> | null
  totals: ExtractionMatch<TotalsExtraction> | null;
  vat: ExtractionMatch<VatExtraction> | null;
  confidence: number;           // 0–100, agregado
  metadata: FiscalExtractionMetadata;
}
```

Cada campo carrega a sua própria confiança/fonte (`ExtractionMatch<T>`)
em vez de um bloco `metadata` central duplicar essa informação — um
consumidor que só quer o valor de `result.supplier?.value.name` já tem
a confiança ao lado (`result.supplier?.confidence`), sem precisar
cruzar com outra estrutura. `metadata` guarda só diagnóstico do
processamento em si (quais extractors correram, quantos encontraram
algo, tempo, tamanho do texto de entrada) — não repete o que já está em
cada `ExtractionMatch`.

`supplierTaxId` é um campo próprio, não `supplier.value.taxId` —
`SupplierExtractor` (nome) e `TaxNumberExtractor` (NIF) são extractors
independentes que podem encontrar (ou não) o seu campo de forma
totalmente separada; juntá-los num único `SupplierExtraction.taxId`
obrigaria a inventar uma regra de combinação de confiança/fonte entre
dois extractors não pedida por ninguém.

### 4. Confiança por extractor — heurística explícita, documentada em cada ficheiro

Sem fórmula de scoring sofisticada — cada extractor atribui uma
confiança fixa por padrão de match (rótulo explícito bate mais alto que
heurística de fallback). Ex.: `SupplierExtractor` com rótulo
`"Fornecedor:"` → 85; sem rótulo, cai para a 1ª linha não vazia do texto
→ 40 (fallback deliberadamente mais fraco, documentado no próprio
extractor). `VatExtractor` distingue três níveis conforme encontra
taxa+montante (85), só taxa (70) ou só montante (65). Consistente com
"não introduzir complexidade desnecessária" — um score fixo por padrão
é suficiente para esta fundação; scoring adaptativo/aprendido fica para
uma fase de IA futura.

**Agregado — revisto.** O `confidence` de topo (`FiscalExtractionResult.confidence`)
é a média simples dos campos encontrados, calculada por
`aggregateConfidence()` (`utils/aggregate-confidence.ts`) em vez de
inline em `FiscalParsingService.assemble()`. Extraída para uma função
pura isolada (com testes próprios) para que, se uma fase futura
precisar de pesos por campo (ex. `totals`/`vat` pesarem mais do que
`customer` no agregado — "weighted confidence"), a mudança fique
contida nessa função — quem chama continua só a passar a lista de
matches encontrados. Nenhum peso foi introduzido agora (média simples
continua a ser suficiente para esta fundação); só o local onde essa
lógica vive foi isolado.

### 5. `parseAmount`/`parseFlexibleDate` — utilitários locais, não um package

Decimais em dois formatos (`1.234,56` PT/EU vs `1,234.56` EN/US) e datas
em `DD/MM/YYYY` ou `YYYY-MM-DD` — heurísticas puras, sem `Intl`/locale
do processo, para o resultado ser determinístico independentemente de
onde o processo corre. Vivem em `fiscal-parsing/utils/` (não em
`@frontcore/shared`) pela mesma razão do módulo inteiro não ser um
package: são específicas do domínio de parsing fiscal, sem segundo
consumidor a justificar partilha.

### 6. Preparação explícita para "múltiplos países" sem implementar múltiplos países

A arquitetura pedida — extractors independentes, interface `FiscalExtractor<T>`
genérica, `FiscalField` como enum central — já é o ponto de extensão
para regras por país: um país novo com convenções muito diferentes
(ex. NIF com formato diferente) pode ganhar a sua própria implementação
de `TaxNumberExtractor` (ou um extractor que escolhe o padrão certo por
configuração), sem tocar em `FiscalParsingService` nem nos outros
extractors. Esta fase **não** implementa essa seleção por país (não há
consumidor real para isso ainda — Execution Mode, `docs/ai/AI_WORKFLOW.md`)
— só garante que a arquitetura não a impede. Concretamente, dois
extractors já podem hoje partilhar o mesmo `field` sem conflito — ver
a regra de "maior confiança vence" na decisão 2.

Modelo de seleção de país assumido: **candidatos a competir por
documento**, não **conjunto de extractors por organização**. Ou seja,
registar `PortugalTaxNumberExtractor` e `SpainTaxNumberExtractor` lado
a lado (ambos no `FISCAL_EXTRACTORS`) e deixar a confiança de cada um
decidir qual vence PARA CADA DOCUMENTO — não escolher, por
`organizationId`/config, QUAL extractor sequer corre. `extract(ocrText: string)`
não recebe nenhum contexto de organização/locale — não é um esquecimento,
é uma decisão: nenhuma fase real precisou disso ainda, e inventar a
forma desse contexto agora (que campos, de onde viria) seria
especulação. Se uma fase futura precisar mesmo de seleção por
organização em vez de competição por confiança, é `extract()` que
ganha um parâmetro novo — mudança aditiva e não-breaking (parâmetro
opcional), ao contrário da mudança para `Promise` na decisão 7.

### 7. Limitação conhecida e deliberada: `FiscalExtractor.extract()` é síncrono

Identificada numa auditoria técnica posterior a esta fase, ao avaliar
se o contrato está preparado para extractors de IA/ML. Síncrono cobre
regex/heurísticas (esta fase) e continuaria a cobrir um extractor de
machine learning local sem I/O de rede — não cobre um extractor de IA
que chame um serviço externo (`@frontcore/ai`), que precisaria de
`Promise<ExtractionMatch<T> | null>`. Essa é uma mudança breaking ao
contrato `FiscalExtractor<T>` e a `FiscalParsingService.parse()` (que
passaria a `async`). **Não implementada agora** — sem IA nesta fase,
por instrução explícita, e tornar o contrato assíncrono sem nenhum
extractor assíncrono real seria complexidade especulativa (Execution
Mode). Registada aqui para não ser descoberta tarde: quando existir o
primeiro extractor assíncrono, é este contrato que muda primeiro,
arrastando os restantes só na assinatura (`extract` ganha `async`),
nunca na lógica de cada um.

## Extractors implementados

| Extractor | Campo (`FiscalField`) | Rótulos reconhecidos (PT/EN) | Confiança |
|---|---|---|---|
| `SupplierExtractor` | `SUPPLIER` | "Fornecedor:", "Emitente:", "Supplier:", "Vendor:", "Issued by:"; sem rótulo → 1ª linha não vazia | 85 / 40 (fallback) |
| `TaxNumberExtractor` | `SUPPLIER_TAX_ID` | "NIF", "NIPC", "VAT Number/No/ID", "Tax ID" | 90 |
| `CustomerExtractor` | `CUSTOMER` | "Cliente:", "Bill To:", "Customer:", "Sold To:", "Exmo(s). Sr(s):" | 85 |
| `InvoiceNumberExtractor` | `INVOICE_NUMBER` | "Fatura N.º", "Factura N.º", "Invoice Number/No/#" | 85 |
| `InvoiceDateExtractor` | `INVOICE_DATE` | "Data (de Emissão)", "Invoice Date", "Date of Issue", "Issued on" | 80 |
| `DueDateExtractor` | `DUE_DATE` | "Data de Vencimento", "Vencimento", "Due Date", "Payment Due" | 80 |
| `CurrencyExtractor` | `CURRENCY` | "Moeda:", "Currency:"; sem rótulo → símbolo €/$/£ | 85 / 50 (símbolo) |
| `TotalsExtractor` | `TOTALS` | "Total a Pagar", "Total Geral", "Grand Total", "Valor Total", "Total" | 80 |
| `VatExtractor` | `VAT` | "IVA"/"VAT" + taxa%, + montante, ou ambos | 65–85 |

## Bugs reais encontrados e corrigidos durante os testes

Três problemas concretos, todos com teste de regressão:

1. **`TotalsExtractor` lia "Subtotal" como "Total"** — a alternativa
   solta `total` na regex não tinha fronteira de palavra, por isso
   casava dentro de "Subtotal" (sem espaço entre "Sub" e "total").
   Corrigido com `\btotal\b`.
2. **`VatExtractor`/`TaxNumberExtractor` liam "vat" dentro de "activate"**
   — mesma causa raiz, corrigido com `\b` antes de "iva"/"vat"/"nif"/
   "nipc".
3. **`InvoiceNumberExtractor` capturava "umber" em vez do código** —
   a forma abreviada do rótulo (`n[º°o]?\.?`) casava só com o "N"
   inicial de "Number" (resto do grupo todo opcional). Corrigido
   reordenando a alternação (formas completas primeiro) e com
   `(?![a-zA-Z])` a proteger só a forma abreviada.

Todos descobertos ao escrever os testes com texto realista (não só
casos isolados) — o teste do pipeline completo (`fiscal-parsing.service.spec.ts`)
com uma fatura simulada de ponta a ponta foi o que expôs o bug do
`InvoiceNumberExtractor`; os outros dois foram apanhados a testar
adversarialmente cada extractor.

## Ficheiros criados

```
apps/frontrest/api/src/fiscal-parsing/
  contracts/fiscal-extractor.ts, index.ts
  types/fiscal-field.ts, extraction-match.ts, supplier-extraction.ts,
        customer-extraction.ts, invoice-extraction.ts,
        totals-extraction.ts, vat-extraction.ts,
        fiscal-extraction-result.ts, index.ts
  utils/parse-amount.ts(+.spec), parse-flexible-date.ts(+.spec),
        aggregate-confidence.ts(+.spec), index.ts
  extractors/supplier.extractor.ts(+.spec), customer.extractor.ts(+.spec),
             invoice-number.extractor.ts(+.spec), invoice-date.extractor.ts(+.spec),
             due-date.extractor.ts(+.spec), currency.extractor.ts(+.spec),
             totals.extractor.ts(+.spec), vat.extractor.ts(+.spec),
             tax-number.extractor.ts(+.spec), index.ts
  fiscal-extractors.token.ts
  fiscal-parsing.service.ts(+.spec)
  fiscal-parsing.module.ts(+.spec)
docs/phases/phase-6.6-fiscal-parsing-foundation.md
```

42 ficheiros no total (21 de implementação, 21 spec — `aggregate-confidence.ts`
e `fiscal-parsing.module.ts` ganharam teste próprio em auditorias
técnicas posteriores a esta fase; `fiscal-extractors.token.ts` continua
sem spec próprio, mesma convenção de `queue-consumer.token.ts`/
`object-storage.token.ts`, que também não têm).

## Ficheiros alterados

```
docs/PHASES.md, docs/INDEX.md, docs/ARCHITECTURE.md
```

Nenhum ficheiro fora de `apps/frontrest/api/src/fiscal-parsing/` e
documentação foi tocado — sem alterações a `InvoiceDraft`, `Invoice`,
Worker, schema Prisma, ou frontend.

## Testes adicionados

14 suites, 108 testes: `parseAmount` (11), `parseFlexibleDate` (9),
`aggregateConfidence` (4), um por extractor (7–10 cada, cobrindo todos
os rótulos PT/EN documentados na tabela acima — incluindo variantes só
adicionadas na segunda auditoria técnica: "Vendor:"/"Issued by:" em
`SupplierExtractor`, "Sold To:"/"Exmo(s). Sr(s):" em
`CustomerExtractor`, "Factura N.º" em `InvoiceNumberExtractor`, "Date
of Issue"/"Issued on" em `InvoiceDateExtractor`, "Valor Total" em
`TotalsExtractor` — e os três casos adversariais dos bugs corrigidos),
`FiscalParsingService` (15, incluindo o pipeline completo sobre uma
fatura simulada realista, documento vazio, documento parcial, prova de
independência entre extractors, competição pelo mesmo campo por maior
confiança, e o empate exato de confiança), e `FiscalParsingModule` (1,
adicionado na segunda auditoria — único teste que resolve
`FiscalParsingService` através do container real de DI, não por
construção manual, provando que `providers`/`inject` estão
corretamente ligados).

## Validação (comandos)

- `pnpm typecheck` — 23/23
- `pnpm build` — 14/14
- `pnpm test` — 15/15 tasks (`@frontrest/api`: 189 testes, 108 de Fiscal Parsing)
- `pnpm --filter @frontrest/api test:e2e` — 64/64, inalterado
  (nenhum endpoint tocado)
- `pnpm lint` — 0 tasks executadas; sem linter real configurado em
  nenhuma parte do monorepo (`docs/quality/quality-gates.md`, decisão
  já documentada, não é gate ativo — reportado tal como está, não
  fingido como validação real)

## Limitações conhecidas

- Datas por extenso (ex. "12 de Julho de 2026") não são suportadas —
  só formatos numéricos (`DD/MM/YYYY`, `YYYY-MM-DD`).
- Convenção `DD/MM/YYYY` assumida para datas de 3 partes — `MM/DD/YYYY`
  (EN-US) não é suportado nesta fase (produto PT/EU-first).
- `SupplierExtractor` sem rótulo explícito usa sempre a 1ª linha do
  texto como fallback (confiança 40) — nunca devolve `null` para texto
  não vazio, mesmo quando essa linha claramente não é um nome de
  fornecedor. Aceitável para uma fundação (confiança baixa sinaliza a
  incerteza), mas um consumidor futuro não deve tratar `supplier` como
  garantidamente correto sem olhar à confiança.
- Números de fatura com espaços internos (ex. "FA 2026/123") podem não
  ser capturados por completo — o desenho atual não permite espaços na
  captura, para evitar over-matching através de texto livre.
- Sem validação de dígito de controlo de NIF — `TaxNumberExtractor`
  só confirma o formato (contagem de dígitos), não a validade fiscal
  real do número.
- Sem seleção de regras por país — arquitetura preparada (ver decisão
  6), não implementada.
- `FiscalParsingService.get<T>()` faz um cast interno não verificado
  em runtime (`matches.get(field) as ExtractionMatch<T>`) — confia que
  cada extractor regista o `field` correspondente ao `T` que produz;
  garantido por convenção e pelos testes de cada extractor, não pelo
  compilador. Uma correlação `field↔T` ao nível de tipos (mapped type)
  foi considerada e rejeitada — ver "Revisão técnica".

## Revisão técnica (pós-implementação)

Duas auditorias arquiteturais desta fase, feitas antes de a considerar
concluída. Resultado completo de cada uma (problemas encontrados,
melhorias aplicadas, melhorias consideradas e rejeitadas) reportado ao
utilizador nas respetivas revisões; resumo do que ficou registado em
código/docs:

**Primeira auditoria:**

- **Aplicado**: `FISCAL_EXTRACTORS` (token de coleção) substitui os 9
  parâmetros nomeados do construtor de `FiscalParsingService` — ver
  decisão 2.
- **Aplicado**: `aggregateConfidence()` extraída para
  `utils/aggregate-confidence.ts`, testada isoladamente — ver decisão 4.
- **Aplicado**: "maior confiança vence" quando dois extractors
  partilham `field`, em vez de "o último a correr" — ver decisão 2.
- **Aplicado**: `FiscalExtractor<T>` documenta explicitamente a
  limitação síncrona e o que muda quando existir IA — ver decisão 7.

**Segunda auditoria** (mais crítica — "assume o papel de um Principal
Engineer que nunca viu este código, procura problemas"):

- **Aplicado**: `EXTRACTOR_CLASSES` — única lista de classes,
  reutilizada em `providers` e `inject` — substitui a versão anterior,
  que listava as mesmas 9 classes em quatro sítios sem nada a impedir
  o `inject` de dessincronizar da ordem dos parâmetros da `useFactory`
  (um erro silencioso possível, nunca reportado como bug real, mas
  eliminado por construção). Verificado empiricamente contra o
  container real do NestJS, não só por inspeção — ver decisão 2 e
  `fiscal-parsing.module.spec.ts`.
- **Aplicado**: `fiscal-parsing.module.spec.ts` — até aqui, nenhum
  teste exercitava a resolução real de DI do módulo; todos construíam
  `FiscalParsingService` à mão com um array. Uma quebra na ligação
  `providers`↔`inject` teria passado despercebida por todos os 98
  testes anteriores.
- **Aplicado**: +9 testes a rótulos documentados na tabela "Extractors
  implementados" mas nunca verificados por nenhum teste — "Vendor:"/
  "Issued by:" (`SupplierExtractor`), "Sold To:"/"Exmo(s). Sr(s):"
  (`CustomerExtractor`), "Factura N.º" (`InvoiceNumberExtractor`),
  "Date of Issue"/"Issued on" (`InvoiceDateExtractor`), "Valor Total"
  (`TotalsExtractor`). Verificados empiricamente antes de escrever o
  teste — nenhum era um bug, mas a lacuna de cobertura era real.
- **Aplicado**: teste de empate exato de confiança (dois extractors,
  mesmo `field`, mesma confiança) — o teste de competição já existente
  só cobria confianças diferentes; o comportamento em empate ("vence o
  primeiro registado") existia por construção mas não estava provado
  nem documentado com precisão. Corrigido o comentário de
  `FiscalParsingService` e de `FiscalExtractionMetadata.extractorsRun`
  (que pode conter o mesmo campo duas vezes se dois extractors o
  partilharem — só `fieldsFound` garante unicidade).
- **Considerado e rejeitado**: mover `fiscal-parsing/` para um
  package novo (`@frontcore/fiscal-parsing`). Ver "Decisão de
  localização" — mantido em `apps/frontrest/api` por YAGNI (sem
  segundo consumidor real), não por a lógica ser específica de
  restaurante (não é).
- **Considerado e rejeitado**: extrair os símbolos monetários (`€$£`)
  repetidos em `CurrencyExtractor`/`TotalsExtractor`/`VatExtractor`
  para uma constante partilhada. Reduziria uma duplicação real e
  pequena, mas obrigaria a construir essas regex dinamicamente
  (`new RegExp(...)`) em vez de literais — pior para a legibilidade e
  auditabilidade deste código, cuja correção depende de o padrão ser
  inspecionável a olho. Duplicação aceite; risco anotado (adicionar
  uma moeda nova exige lembrar de atualizar as três).
- **Considerado e rejeitado**: correlacionar `FiscalField` e `T` ao
  nível de tipos (ex. um mapped type `FieldValueMap`) para eliminar o
  cast em `FiscalParsingService.get<T>()`. Mudaria a forma pública de
  `FiscalExtractor<T>` (deixaria de aceitar um `T` livre) e tocaria em
  todos os extractors, por um risco que hoje só existe por erro de
  programação num módulo pequeno e totalmente controlado — desproporcionado
  para o risco real. Documentado como limitação conhecida em vez de
  corrigido.
- **Considerado e rejeitado**: extrair valores de confiança mágicos
  (`85`, `40`, ...) para constantes nomeadas por extractor. Os valores
  já estão explicados em prosa nos comentários de cada extractor e na
  tabela "Extractors implementados"; nomear constantes de uso único
  (`CONFIANCA_ROTULO_EXPLICITO = 85`) acrescentaria verbosidade sem
  reduzir ambiguidade real.
- **Considerado e rejeitado**: tornar `FiscalExtractor.extract()`
  assíncrono agora (`Promise<ExtractionMatch<T> | null>`), para não
  ser uma mudança breaking mais tarde. Sem nenhum extractor assíncrono
  real hoje, seria complexidade especulativa proibida pelo Execution
  Mode — documentado como limitação conhecida (decisão 7) em vez de
  implementado.
- **Considerado e rejeitado** (segunda auditoria): agregar
  `FISCAL_EXTRACTORS` com `useValue: [new SupplierExtractor(), ...]`
  em vez de `useFactory`/`inject`. Mais curto — remove a necessidade de
  registar cada extractor como provider — mas construir instâncias com
  `new` fora do container impede-as de ter as suas próprias
  dependências injetadas, exatamente a capacidade que a decisão 2
  preserva deliberadamente para um futuro extractor de IA (precisaria
  de, por exemplo, `AiCompletionProvider` injetado). Rejeitado por
  remover uma capacidade preparatória explicitamente pedida (ver
  Preparação para futuras fases, ponto "IA").
- **Considerado e rejeitado** (segunda auditoria): mudar a regra de
  empate exato de confiança de "primeiro registado vence" para "último
  registado vence". Nenhuma das duas é objetivamente melhor — ambas
  são determinísticas e prováveis por teste; trocar não teria nenhuma
  razão técnica, só preferência. Mantida a regra existente,
  documentada com precisão em vez de alterada.
- **Considerado e rejeitado** (segunda auditoria): adicionar um
  parâmetro de contexto (`organizationId`/locale) a
  `FiscalExtractor.extract()` agora, para preparar seleção de
  extractors por país. Sem nenhum consumidor real a definir que forma
  esse contexto deveria ter, seria especulação — Execution Mode. O
  mecanismo já existente (extractors a competir por confiança no mesmo
  `field`, decisão 6) cobre o cenário de país sem precisar deste
  parâmetro; documentado como o modelo assumido em vez de implementar
  o parâmetro.

## Trabalho futuro

- Integração com `InvoiceDraft` — persistir o resultado do parsing
  (provavelmente novos campos ou uma tabela própria; decisão em aberto
  para essa fase) e decidir o gatilho: automático após o Worker OCR
  (mirroring a integração Fase 6.2→6.4), ou sob pedido via endpoint.
- Endpoint HTTP para expor `FiscalParsingService` — nenhum criado nesta
  fase.
- Validação fiscal real (dígito de controlo de NIF, validade de IVA
  intracomunitário).
- Regras por país — seleção de conjunto de padrões por `organizationId`/
  configuração.
- IA/LLM como fallback quando os extractors determinísticos não
  encontram um campo com confiança suficiente — explicitamente adiado
  por instrução desta fase.

## Critérios de conclusão

- [x] Módulo `fiscal-parsing` criado em `apps/frontrest/api`, não em
      `packages/*`.
- [x] `FiscalParsingService` transforma texto OCR em dados estruturados.
- [x] Modelo normalizado de Invoice Extraction definido
      (`FiscalExtractionResult`).
- [x] Pipeline composto por 9 extractors especializados e independentes.
- [x] Cada extractor devolve valor, confiança e origem.
- [x] Interfaces/tipos/contratos criados, sem DTOs HTTP especulativos
      (sem endpoint nesta fase — ver "Trabalho futuro").
- [x] Sem IA/LLM.
- [x] Arquitetura preparada para extractors novos, regras por país,
      validações fiscais e IA futura, sem as implementar agora.
- [x] Testes unitários completos (108 testes, 14 suites).
- [x] `pnpm typecheck`/`build`/`test`/`test:e2e` limpos, sem regressões.
- [x] `pnpm lint` verificado e reportado com precisão (sem gate real).
- [x] Documentação da fase criada; `PHASES.md`/`INDEX.md`/`ARCHITECTURE.md`
      atualizados.
- [x] Nenhuma alteração a `InvoiceDraft`/`Invoice`/Worker/frontend/schema.
- [x] Revisão técnica arquitetural concluída, achados aplicados ou
      documentados como rejeitados com justificação.

## Próxima fase

Por decidir — candidatos naturais: integração do parsing fiscal com
`InvoiceDraft` (mirroring Fase 6.4), ou recovery manual de OCR (já
preparado desde a Fase 6.5). Ver "Trabalho futuro".
