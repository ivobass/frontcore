# Fase 6.9 — PDF Rasterization Foundation

## Objetivo

Permitir que faturas PDF reais — incluindo multipágina — sejam
processadas pelo pipeline OCR existente, através de uma camada de
rasterização PDF→PNG genérica, sem domínio, dentro de `@frontcore/ocr`.
Suporte a JPEG/PNG inalterado.

## Problema confirmado

`ALLOWED_MIME_TYPES` (`apps/frontrest/api/src/uploads/constants.ts`)
sempre aceitou `application/pdf` no upload; `TesseractProvider.SUPPORTED_CONTENT_TYPES`
(Fase 6.2) sempre se limitou a `image/jpeg`/`image/png`. Um PDF real
passava o upload e a criação do draft, mas `OCRService.extract()`
rejeitava-o antes de chamar o provider
(`OCRUnsupportedFormatError`), terminando em `ocrStatus: FAILED`,
`ocrError: "Formato de ficheiro não suportado pelo motor de OCR."` —
confirmado como consumidor real durante a validação manual da Fase
6.8, com faturas PDF reais (farmácias, Mercedes, NOS).

## Alternativas comparadas

| Opção | Avaliação |
|---|---|
| **Poppler CLI (`pdfinfo`/`pdftoppm`)** | **Escolhida.** Confirmado empiricamente nesta fase, não só em teoria: `apk add poppler-utils` instala limpo em `node:20-alpine` (~568 KiB + libpoppler partilhada); códigos de saída limpos e diferenciáveis (0 sucesso, 1 falha, com stderr distinguível para PDF corrompido vs. protegido); `-f k -l k -singlefile` dá nome de ficheiro determinístico por página; `-r`/DPI efetivo dão controlo preciso de qualidade/dimensão sem amplificar imagens pequenas. |
| PDF.js + Canvas em Node | Rejeitada: `node-canvas` exige bindings nativos (`cairo`/`pixman`/`pango`), historicamente frágeis em Alpine (`musl`), sem ganho sobre uma alternativa já confirmada a funcionar. |
| MuPDF / `mutool draw` | Sem vantagem técnica concreta sobre o Poppler já validado; pacote Alpine menos testado nesta base. |
| Ghostscript / ImageMagick | `ImageMagick` delega PDF para Ghostscript internamente — camada extra sem necessidade; Ghostscript sozinho tem CLI menos direta para PNG por página com DPI/dimensão explícitos. |
| Provider cloud com PDF nativo | Fora de âmbito — mudaria o motor OCR, não só acrescentaria rasterização; `TesseractProvider` mantém-se o motor. |
| `pdftotext` (extração direta) | Explicitamente fora do âmbito — extrai texto digital, não rasteriza; o pedido é OCR sobre imagem. |

## Localização arquitetural

`packages/ocr` — nunca `apps/frontrest/*`, nunca `TesseractProvider`,
nunca `OcrProcessingProcessor`. `TesseractProvider` continua a
declarar suporte só a `image/jpeg`/`image/png`
(`tesseract-provider.ts`) — nunca sabe que PDF existe. `OCRService`
reconhece `application/pdf` e trata-o inteiramente antes de o provider
ser chamado:

```text
Imagem (JPEG/PNG):  OCRService → provider.supports() → provider.extract()
PDF:                OCRService → PdfRasterizer (Poppler) → páginas PNG → provider.extract() por página → agregação
```

O Worker (`OcrProcessingProcessor`) continua a só conhecer
`OCRService.extract()` — nunca soube, e continua a não saber, que
Poppler existe.

## Contratos

`packages/ocr/src/contracts/pdf-rasterizer.ts`:

```ts
interface PdfRasterizer {
  readonly name: string;
  rasterize(pdf: Buffer, options: PdfRasterizationOptions): AsyncIterable<RasterizedPage>;
}
```

`packages/ocr/src/types/pdf-rasterization.ts`:

```ts
interface RasterizedPage {
  pageNumber: number;
  buffer: Buffer;
  contentType: 'image/png';
}
interface PdfRasterizationOptions {
  maxPages: number;
  dpi: number;
  maxDimensionPx: number;
  timeoutMs: number;
}
```

**`AsyncIterable`, não callback**: mais simples no código atual —
`OCRService` consome com `for await`, uma tradução direta de "uma
página de cada vez" sem inversão de controlo manual; implementado como
`async function*` em `PopplerPdfRasterizer`, sem introduzir nenhum
padrão de callback novo neste package (que hoje não tem nenhum).

`createPdfRasterizer(): PdfRasterizer` (`rasterizers/create-pdf-rasterizer.ts`)
— único ponto de construção, mesma filosofia de `createOcrProvider()`;
sem seleção por configuração ainda (só existe Poppler).

## Configuração

`OcrConfig` (`contracts/ocr-config.ts`) ganhou 4 campos, lidos por
`loadOcrConfig()` com validação mínima (finito, positivo — nunca um
sistema de schemas genérico):

| Variável | Omissão | Significado |
|---|---|---|
| `OCR_PDF_MAX_PAGES` | 10 | Páginas máximas por documento |
| `OCR_PDF_DPI` | 200 | DPI pedido à rasterização |
| `OCR_PDF_MAX_DIMENSION_PX` | 2500 | Maior dimensão (px) aceite por página |
| `OCR_PDF_RASTER_TIMEOUT_MS` | 30000 | Timeout de cada chamada a `pdfinfo`/`pdftoppm` |

Valor inválido (não numérico, ≤ 0, `Infinity`) lança no arranque —
nunca um `NaN` silencioso a chegar ao `pdftoppm`.

## Limites e estratégia de memória

- **Páginas**: `pdfinfo` corre primeiro; se `Pages` exceder `maxPages`,
  `PdfPageLimitExceededError` antes de qualquer `pdftoppm` — nenhuma
  página é rasterizada.
- **DPI/dimensão — achado real durante a implementação**: `-scale-to`
  do `pdftoppm` **não é um limite, força cada página a caber
  exatamente numa caixa**, incluindo **ampliar** páginas pequenas/de
  baixo DPI (confirmado empiricamente: 50dpi + `-scale-to 2500` produz
  2500×1250, não o tamanho nativo muito menor). Ampliar artificialmente
  piora a imagem entregue ao Tesseract — o oposto do que
  `maxDimensionPx` pretende. Por isso `maxDimensionPx` nunca é passado
  como `-scale-to`: é aplicado **reduzindo o DPI efetivo**
  (`computeEffectiveDpi()`) só quando o tamanho nativo
  (`pageSizePts / 72 × dpi`) excederia o limite — nunca aumenta o DPI
  pedido. Baseado no tamanho da 1ª página (aproximação aceite; PDFs com
  páginas de tamanhos muito diferentes entre si não são o caso comum de
  uma fatura).
- **Memória**: uma página de cada vez — `PopplerPdfRasterizer.rasterize()`
  é um `async function*`; cada iteração rasteriza, lê o PNG para
  `Buffer`, elimina o ficheiro, e só depois `yield`. Nunca todas as
  páginas em memória simultaneamente. Confirmado por teste dedicado
  (`readFile`/`unlink` da página N sempre antes do `pdftoppm` da página
  N+1).

## Timeout e terminação do processo

`execFile` (nunca `exec`, nunca `shell: true`, nunca interpolação de
string) com a opção nativa `timeout`/`killSignal: 'SIGTERM'` do Node —
mata o processo sozinho, sem `setTimeout`+`kill` manual. `maxBuffer`
limitado (10 MB) em `stdout`/`stderr`. Erro classificado por
`killed`/`signal` → `PdfRasterizationTimeoutError`.

## Tratamento de PDFs inválidos/protegidos

5 erros novos em `@frontcore/ocr/errors`, classificados a partir do
código de saída/`stderr` do Poppler (nunca o `stderr` bruto persistido
— só a classe do erro chega ao Worker):

| Erro | Gatilho real (confirmado empiricamente) | Mensagem sanitizada (`ocrError`) |
|---|---|---|
| `PdfInvalidError` | `stderr` com "Syntax Error"/"trailer"/"Couldn't" | Documento PDF inválido, corrompido ou protegido. |
| `PdfProtectedError` | `stderr` com "password" | Documento PDF inválido, corrompido ou protegido. |
| `PdfPageLimitExceededError` | `Pages` > `maxPages` | Documento PDF excede os limites de processamento. |
| `PdfRasterizationTimeoutError` | `killed`/`SIGTERM` | Tempo limite excedido durante a preparação do documento. |
| `PdfRasterizerError` | `ENOENT`/saída inesperada | Falha ao preparar o documento para OCR. |

Nunca uma classe combinada com "razão tipada" — 5 classes pequenas,
mesma convenção já usada pelos 4 erros existentes de `@frontcore/ocr`
(um ficheiro, uma classe, sem estado).

Comportamento não alterado nesta fase: PDFs deterministicamente
inválidos esgotam as 3 tentativas já configuradas (Fase 6.5) antes de
`FAILED` — sem distinção erro-permanente vs. transitório, mesma
limitação já registada nessa fase.

## Agregação multipágina

- **Sequencial, sem paralelismo**: um só worker Tesseract ativo de
  cada vez — `for await` natural do `AsyncIterable`.
- **Falha de uma página falha o documento inteiro** — sem try/catch
  por página; o erro propaga tal e qual, nenhum texto parcial é
  persistido, nunca `COMPLETED`.
- **Texto**: `aggregatePdfText()` (`utils/aggregate-pdf-pages.ts`).
  **Regra corrigida durante a validação real desta fase**: nunca insere
  marcador antes da 1ª página — um PDF de uma única página produz
  exatamente o texto OCR normalizado dessa página, sem nenhuma linha
  artificial. A partir da 2ª página, o marcador `--- Página N ---`
  aparece **antes** do texto que identifica:
  ```text
  <texto da página 1>

  --- Página 2 ---

  <texto da página 2>
  ```
  Cada página tem as suas quebras de linha finais removidas antes de
  montar as fronteiras (`stripTrailingNewlines()`, ancorado ao fim da
  string) — nunca depende de o provider devolver texto já terminado em
  `\n` ou não, e nunca toca em quebras internas do texto OCR. Testado
  para: sem newline final, com um, com vários, página vazia, várias
  páginas vazias, uma página, várias páginas.
- **Confiança**: `aggregatePdfConfidence()`, média ponderada pelos
  caracteres não vazios de cada página — uma página vazia tem peso
  zero, nunca arrasta a média para baixo só por existir; todas vazias
  → `0`, nunca `NaN`.
- **`processingTimeMs`**: cronometrado desde antes do `pdfinfo` até ao
  fim da agregação — inclui inspeção, rasterização e OCR de todas as
  páginas.
- **`metadata`**: `{ inputType: 'application/pdf', rasterizer: 'poppler', pageConfidences: number[] }`
  — nunca buffers, paths, comandos ou IDs de domínio.

## Docker

`docker/workers.Dockerfile`: `poppler-utils` acrescentado ao `apk add`
do estágio `base` (partilhado por `build`/`runtime` — garante presença
no runtime final, per requisito). Só `workers` — `api`/`web`
inalterados. `docker-compose.yml`: as 4 novas variáveis passadas ao
serviço `workers`. `.env`/`.env.example` atualizados.

## Testes

- `@frontcore/ocr`: **76 testes** (7 suites) — config (15, incl. 12
  novos: overrides válidos + inválidos das 4 variáveis), agregação
  multipágina (16 — sem marcador na 1ª página, marcador só a partir da
  2ª, ordem preservada, normalização determinística de 0/1/vários `\n`
  finais, quebras internas nunca tocadas, página(s) vazias sem
  `undefined`/`null`/`NaN`), `PopplerPdfRasterizer` (16 — 1 página,
  multipágina, ordem, limite, inválido, sem páginas, protegido,
  timeout, ENOENT, cleanup em sucesso/erro/timeout, argumentos sem
  shell, nome interno fixo, sem amplificação), `OCRService` (15, incl.
  cenários PDF atualizados para o novo contrato textual sem marcador
  na 1ª página), providers/utils existentes inalterados.
- `@frontrest/workers`: **27 testes** — 5 novos, classificação de
  cada erro PDF para a mensagem sanitizada certa, com mensagens de
  entrada deliberadamente "sujas" (path/stderr simulados) para provar
  que `sanitizeOcrError()` nunca usa `.message`, só `instanceof` + texto
  fixo.
- Mocks de `node:child_process`/`node:fs/promises` — sem Poppler real
  nos testes unitários, só na validação Docker.

## Validação (comandos)

- `pnpm typecheck` — 23/23. `pnpm build` — 14/14. `pnpm test` — 16/16
  tarefas. `pnpm --filter @frontrest/api test:e2e` — 74/74 (inalterado,
  confirma zero regressão fora do pipeline OCR).

## Validação Docker real

`docker compose build workers` (imagem reconstruída com `poppler-utils`)
+ `up -d workers`. `docker exec frontcore-workers pdfinfo -v`/`pdftoppm -v`
— confirmados presentes no runtime. Logs de arranque limpos, `OcrProcessingModule`
inicializado sem erro de configuração (confirma os 4 novos valores
válidos). `docker exec frontcore-workers printenv | grep OCR_PDF` —
confirmadas as 4 variáveis a chegar ao container.

Fluxo real, organização própria registada para esta validação:

1. **Regressão PNG/JPEG** — `COMPLETED`, texto/confiança reais,
   inalterado.
2. **PDF de 1 página** — `COMPLETED` em ~4s, `ocrText: "Pagina Unica -
   Fase 6.9"` — **sem marcador**, confiança 94%. `GET .../fiscal-parsing`
   sobre este draft: `supplier.value.name = "Pagina Unica - Fase 6.9"`
   (a 1ª linha real do documento) — nunca `"--- Página 1 ---"`.
3. **PDF multipágina (2 páginas, conteúdo diferente)** — `COMPLETED`
   em ~4s, `ocrText: "Pagina UM - Conteudo Alfa\n\n--- Página 2 ---\n\nPagina
   DOIS - Conteudo Beta"` — sem marcador antes da página 1, marcador só
   antes da 2ª, confiança 93%. **Achado real durante a primeira
   validação desta fase, não um bug do código de rasterização**: o
   PDF de teste original (gerado com `convert -size ... xc:white
   -annotate ... -size ... xc:white -annotate ...` do ImageMagick, duas
   páginas na mesma invocação) produzia uma **página 1 com ghosting
   visual real** — sobreposição de conteúdo da página 1 com o da
   página 2, confirmado por inspeção visual direta dos PNGs
   rasterizados por Poppler (independente do `@frontcore/ocr`,
   reproduzido isolando `pdftoppm` + `tesseract.js` diretamente, fora
   de qualquer código desta fase). Um PDF construído de forma correta
   (`gs -sDEVICE=pdfwrite` a fundir dois PDFs de 1 página genuinamente
   independentes) rasterizou e processou as duas páginas com texto
   limpo e correto. Conclusão: defeito na geração do PDF de teste
   (ferramenta/técnica de fixture), não no `PopplerPdfRasterizer`,
   `OCRService` ou Tesseract — registado aqui pela disciplina de nunca
   reportar um resultado sem o investigar até à causa raiz real. Um
   **segundo achado real, este sim uma regressão do código desta
   fase**, foi encontrado nessa mesma validação e corrigido nesta
   revisão — ver "Correção da agregação multipágina", abaixo.
4. **PDF acima do limite (12 páginas, `OCR_PDF_MAX_PAGES=10`)** —
   esgotou as 3 tentativas (comportamento aceite, ver "Tratamento de
   PDFs inválidos/protegidos"), `FAILED`,
   `ocrError: "Documento PDF excede os limites de processamento."` —
   nenhuma página chegou a ser rasterizada.
5. **PDF corrompido** (assinatura válida, corpo aleatório) — `FAILED`
   após 3 tentativas, `ocrError: "Documento PDF inválido, corrompido ou
   protegido."`; `docker compose ps workers` confirmou o processo **nunca
   caiu** (ao contrário do crash real do Tesseract com imagem corrompida
   já registado na Fase 6.8 — aqui o PDF nunca chega ao Tesseract).
6. **PDF protegido** (`gs` com password de utilizador+dono) — mesmo
   resultado do corrompido, `FAILED` com a mesma mensagem combinada
   (por decisão de âmbito — ver tabela acima).
7. **Concorrência**: 2 drafts PDF criados quase em simultâneo,
   ambos `COMPLETED` com o texto correto e distinto de cada um, sem
   mistura; `docker exec ... ls /tmp` confirmou **zero diretórios
   temporários órfãos** depois de toda a validação (7 documentos PDF
   processados nesta sessão).

## Correção da agregação multipágina — regressão real, corrigida nesta fase

A validação real inicial (ponto 2, acima) revelou uma regressão
funcional genuína, causada por esta fase, não deixada como trabalho
futuro:

**Regra anterior** (`aggregatePdfText()`): todo `ocrText` de PDF
começava sempre com `--- Página 1 ---\n\n`, incluindo documentos de uma
única página. `SupplierExtractor` (Fase 6.6), sem rótulo explícito,
usa a 1ª linha não vazia do texto como fallback de nome de fornecedor
— com a regra anterior, essa 1ª linha era sempre o próprio marcador de
página, nunca conteúdo real do documento. Confirmado real:
`GET .../fiscal-parsing` sobre um PDF de 1 página devolvia
`supplier.value.name: "--- Página 1 ---"`, confiança 40 — pior do que
antes desta fase (quando não havia PDF a processar de todo).

**Regra corrigida**: `aggregatePdfText()` nunca insere marcador antes
da 1ª página — um PDF de uma única página produz exatamente o texto
OCR normalizado, indistinguível de uma imagem processada diretamente. O
marcador `--- Página N ---` só aparece a partir da 2ª página, sempre
antes do texto que identifica. Cada página tem as suas quebras de
linha finais removidas (`stripTrailingNewlines()`) antes de montar as
fronteiras — resolve também, como efeito direto, a limitação cosmética
de espaço extra registada na validação inicial (texto já terminado em
`\n` deixa de produzir uma quebra a mais entre páginas). Quebras
internas do texto OCR nunca são tocadas.

**Ficheiros alterados**: só `packages/ocr/src/utils/aggregate-pdf-pages.ts`
e `aggregate-pdf-pages.test.ts` (reescrito, 16 testes) +
`services/ocr.service.test.ts` (1 asserção atualizada para o novo
contrato textual). `SupplierExtractor`/`apps/frontrest/api/src/fiscal-parsing/`
**não tocados**, por instrução explícita — a correção fica inteiramente
do lado de quem introduziu a linha artificial, não de quem a consome.

**Validação real repetida após a correção**: PDF de 1 página →
`ocrText: "Pagina Unica - Fase 6.9"` (sem marcador);
`GET .../fiscal-parsing` → `supplier.value.name: "Pagina Unica - Fase
6.9"` — nunca mais `"--- Página 1 ---"`. PDF multipágina →
`ocrText: "Pagina UM - Conteudo Alfa\n\n--- Página 2 ---\n\nPagina DOIS
- Conteudo Beta"` — sem marcador antes da página 1, marcador só antes
da 2ª, sem espaço extra.

## Limitações conhecidas

- **Crash do Tesseract com imagem corrompida (JPEG/PNG), Fase 6.8** —
  continua sem correção geral, por instrução explícita desta fase.
  Confirmado nesta validação que PDFs corrompidos/protegidos **nunca**
  chegam ao Tesseract — não reproduzem esse crash, porque o
  `PdfRasterizer` intercepta antes.
- **Página 1 de tamanho de referência para `computeEffectiveDpi()`** —
  documentos com páginas de tamanhos muito diferentes entre si não têm
  o limite de dimensão aplicado com precisão por página; aceite,
  caso raro para faturas.

## Ficheiros criados

```
packages/ocr/src/types/pdf-rasterization.ts
packages/ocr/src/contracts/pdf-rasterizer.ts
packages/ocr/src/errors/pdf-invalid-error.ts
packages/ocr/src/errors/pdf-protected-error.ts
packages/ocr/src/errors/pdf-page-limit-exceeded-error.ts
packages/ocr/src/errors/pdf-rasterization-timeout-error.ts
packages/ocr/src/errors/pdf-rasterizer-error.ts
packages/ocr/src/utils/aggregate-pdf-pages.ts (+.test.ts)
packages/ocr/src/rasterizers/poppler/poppler-pdf-rasterizer.ts (+.test.ts)
packages/ocr/src/rasterizers/poppler/index.ts
packages/ocr/src/rasterizers/create-pdf-rasterizer.ts
packages/ocr/src/rasterizers/index.ts
docs/phases/phase-6.9-pdf-rasterization-foundation.md
```

## Ficheiros alterados

```
packages/ocr/src/contracts/ocr-config.ts (+.test.ts)     — 4 campos novos + validação
packages/ocr/src/services/ocr.service.ts (+.test.ts)     — ramo PDF
packages/ocr/src/providers/create-ocr-provider.test.ts   — OcrConfig com os 4 campos novos
packages/ocr/src/providers/tesseract/tesseract-provider.ts — comentário atualizado
packages/ocr/src/{index,contracts/index,types/index,errors/index,utils/index}.ts — barrels

apps/frontrest/workers/src/queues/ocr-processing.module.ts     — injeta PdfRasterizer + PdfRasterizationOptions
apps/frontrest/workers/src/queues/ocr-processing.processor.ts  — sanitizeOcrError() + 5 ramos novos
apps/frontrest/workers/src/queues/ocr-processing.processor.spec.ts — + testes de classificação

docker/workers.Dockerfile   — + poppler-utils
docker-compose.yml           — + 4 variáveis no serviço workers
.env, .env.example            — + 4 variáveis

docs/INDEX.md, docs/PHASES.md, docs/ARCHITECTURE.md
```

Nenhuma migration Prisma. `InvoiceDraft`/`Invoice`/promoção,
`apps/frontrest/api` (fora de nada), `apps/frontrest/web`, filas,
`FiscalParsingService` **inalterados**. `packages/database` inalterado.

## Riscos restantes

- Crash do Tesseract com imagem corrompida (herdado da Fase 6.8) —
  continua sem correção, mas confirmado que PDF nunca o desencadeia.

## Critérios de conclusão

- [x] JPEG inalterado (confirmado real).
- [x] PNG inalterado (confirmado real).
- [x] PDF já não é rejeitado pelo gate inicial.
- [x] `TesseractProvider` continua só com JPEG/PNG.
- [x] Rasterização vive em `@frontcore/ocr`.
- [x] Worker não conhece Poppler.
- [x] PDF de uma página funciona (confirmado real).
- [x] PDF multipágina funciona (confirmado real, após correção do PDF de teste).
- [x] Páginas processadas sequencialmente e pela ordem correta (testado + confirmado real).
- [x] Apenas uma página rasterizada é carregada em memória de cada vez (testado).
- [x] Número de páginas correto.
- [x] Texto agregado previsível — sem marcador antes da 1ª página, sem espaço extra na fronteira (testado + confirmado real; regressão real corrigida nesta fase).
- [x] Confiança agregada documentada e testada.
- [x] Tempo total documentado.
- [x] Limite de páginas configurável (confirmado real).
- [x] DPI configurável.
- [x] Dimensão máxima configurável — sem amplificar páginas pequenas (achado real corrigido nesta fase).
- [x] Timeout configurável.
- [x] Processo filho termina no timeout (nativo do `execFile`, testado).
- [x] Cleanup garantido em sucesso e falha (testado + confirmado real, zero diretórios órfãos).
- [x] PDF inválido não chama Tesseract (testado + confirmado real).
- [x] PDF protegido tratado (confirmado real).
- [x] PDF acima do limite tratado (confirmado real).
- [x] Erros sanitizados (testado com mensagens "sujas" deliberadas).
- [x] Nenhum path/comando/stderr persistido.
- [x] Nenhuma migration Prisma.
- [x] Nenhuma alteração ao frontend.
- [x] Nenhum novo package.
- [x] Poppler presente apenas no Worker (confirmado — Dockerfiles de `api`/`web` não tocados).
- [x] Testes unitários limpos (76 em `@frontcore/ocr`).
- [x] Testes do Worker limpos (27).
- [x] Typecheck, build e testes da raiz limpos.
- [x] Docker build limpo.
- [x] Validação ponta-a-ponta real concluída (7 cenários).
- [x] Documentação da fase criada.
- [x] `INDEX`, `PHASES` e `ARCHITECTURE` atualizados.
- [x] Git limpo no final (aguarda commit/tag/push do utilizador).
- [x] Nenhum commit, tag ou push executado pela IA.

## Próxima fase

Candidatos naturais: crash do Tesseract com imagem corrompida
(herdado, Fase 6.8); endpoint de retry manual de OCR (preparado desde
a Fase 6.5); validação manual interativa no browser do fluxo PDF
completo (upload → revisão → promoção), ainda pendente desde a Fase
6.8.
