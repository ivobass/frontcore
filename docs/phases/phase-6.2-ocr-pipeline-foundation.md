# Phase 6.2 — OCR Pipeline Foundation

## Objetivo

Construir a fundação completa do pipeline de OCR — arquitetura
extensível para motores OCR, sem IA, sem parsing de faturas, sem
extração de campos fiscais. Sobre a foundation de filas/worker da Fase
6.1, esta fase acrescenta o package `@frontcore/ocr` (contrato
`OCRProvider`, resultado normalizado `OCRResult`, `OCRService`, um
provider real — Tesseract) e atualiza o Worker para o fluxo completo:
receber job → obter ficheiro → extrair texto → registar resultado →
terminar job.

## Estado inicial

A Fase 6.1 deixou `apps/frontrest/workers` como app NestJS standalone
real, com uma fila `ocr-processing` e um consumidor **mock** (só
confirmava a receção do job, sem tocar em `StorageObject` nem em
storage). `ObjectStorage` (`@frontcore/storage`) só tinha `put`/
`getDownloadUrl`/`delete` — nenhum método para ler bytes diretamente a
partir do servidor. `@frontcore/ai` já tinha um contrato de IA vazio,
com um comentário a antecipar "OCR, extração, chat" nas Fases 6/8, mas
sem nenhuma implementação.

## Decisões arquiteturais

- **`ObjectStorage.get(key): Promise<Buffer>` — extensão necessária,
  não hipotética.** Descoberto ao implementar a integração real: o
  Worker precisa dos bytes do ficheiro em memória para os passar ao
  motor OCR, mas `getDownloadUrl()` gera um URL assinado pensado para
  um **browser** consumir — usa o endpoint **público**
  (`S3_PUBLIC_ENDPOINT`, ex. `localhost:9000` fora de Docker), que não
  é alcançável a partir de dentro da rede Docker onde o Worker corre.
  `get()` usa sempre o cliente interno (`this.client`, endpoint
  `S3_ENDPOINT`), nunca o `signingClient`. Extensão puramente aditiva —
  `put`/`getDownloadUrl`/`delete` inalterados, `apps/frontrest/api`
  continua a compilar e a passar todos os testes sem nenhuma alteração
  de código.
- **`packages/ocr` com a estrutura pedida** —
  `contracts/`/`types/`/`providers/tesseract/`/`services/`/`errors/`/
  `utils/`, mesma filosofia de `packages/storage` (contrato genérico +
  provider concreto + erros normalizados), sem repetir a
  organização `config/` de `packages/storage`/`packages/queue`: o par
  `OcrConfig`/`loadOcrConfig()` vive em `contracts/ocr-config.ts`
  (convenção `load<X>Config()` já documentada em
  `docs/CODING_STANDARDS.md`), porque esta fase não pediu uma pasta
  `config/` própria.
- **`OCRProvider` e `OCRResult` sem nenhum campo de domínio** —
  `extract()` devolve texto bruto + metadados de extração (confiança,
  páginas, tempo). Nenhum campo de fatura (fornecedor, NIF, totais),
  nenhuma classificação — isso pertence a uma fase futura de parsing,
  fora do âmbito deste package.
- **`OCRService` não é um passthrough** — aplica dois comportamentos
  que não fazem sentido duplicar em cada provider: valida
  `provider.supports(contentType)` antes de chamar `extract()`
  (lança `OCRUnsupportedFormatError` se não suportado) e aplica um
  limite de tempo configurável (`withTimeout`, lança
  `OCRTimeoutError`). O Worker só conhece `OCRService`, nunca
  `TesseractProvider`.
- **Seleção de provider dentro de `packages/ocr`, não na app** —
  `createOcrProvider(config: OcrConfig): OCRProvider` faz o `switch`
  sobre `OCR_PROVIDER`. Ao contrário do padrão já usado para
  `S3ObjectStorage`/`BullMQQueueConsumer` (onde a app decide
  diretamente qual classe instanciar, porque só existe uma
  implementação), aqui a app **não** deve saber que motores existem —
  adicionar PaddleOCR/Azure Vision/Google Vision/AWS Textract no
  futuro é só um `case` novo em `createOcrProvider()`; zero alterações
  em `apps/frontrest/workers`.
- **Provider Tesseract real, sobre `tesseract.js`** — WASM puro, sem
  dependência de binário de sistema (ao contrário do `tesseract-ocr`
  nativo), por isso não exige nada extra na imagem Docker ("sem
  otimizações" cumprido sem sacrificar ser uma implementação real, não
  mock).
- **`supports()` só declara `image/jpeg`/`image/png`, nunca
  `application/pdf`** — processar PDF exigiria renderizar a primeira
  página para imagem antes de chamar o Tesseract, explicitamente fora
  do âmbito ("PDF rendering avançado" na lista de restrições). Um job
  com um `StorageObject` de PDF hoje resulta em `OCRUnsupportedFormatError`
  — comportamento correto e documentado, não uma lacuna silenciosa.
- **`pages: 1` sempre** — `tesseract.js`, nesta implementação simples,
  processa uma imagem de cada vez; sem suporte a TIFF multi-página.
  Registado como simplificação deliberada, não escondida.
- **"Guardar resultado" = registo estruturado via `Logger`, não
  persistência em BD** — mesma decisão já tomada na Fase 6.1 para o
  estado do job ("sem modelo em Prisma até existir consumidor real"),
  aplicada de forma consistente ao resultado OCR: sem um consumidor
  real (ex. criação de fatura em rascunho) a decidir a forma exata dos
  dados a guardar, inventar um modelo Prisma agora seria adivinhar.
  `Invoice.status` continua sem estado `DRAFT` — dependência já
  identificada na Fase 6.1, ainda não resolvida, não bloqueia esta
  fase porque o Worker não escreve em `Invoice`.
- **Sem alteração a `apps/frontrest/api`** além do que já não muda
  nada em runtime (a extensão de `ObjectStorage`) — a integração real
  fica inteiramente dentro de `apps/frontrest/workers`.

## Estrutura criada

```
packages/ocr/
  src/
    contracts/{ocr-provider.ts, ocr-config.ts, index.ts}
    types/{ocr-input.ts, ocr-result.ts, index.ts}
    providers/
      tesseract/{tesseract-provider.ts, tesseract-provider.test.ts, index.ts}
      create-ocr-provider.ts, create-ocr-provider.test.ts, index.ts
    services/{ocr.service.ts, ocr.service.test.ts, index.ts}
    errors/{ocr-provider-error.ts, ocr-extraction-error.ts, ocr-timeout-error.ts, ocr-unsupported-format-error.ts, index.ts}
    utils/{with-timeout.ts, with-timeout.test.ts, index.ts}
    index.ts

apps/frontrest/workers/src/storage/object-storage.token.ts   — novo, mesmo padrão de queue-consumer.token.ts
```

## Fluxo de processamento (real, sem parsing)

```
QueueProducer.add('ocr-processing', { storageObjectId, organizationId })
  ↓ (BullMQ, Redis)
apps/frontrest/workers — OcrProcessingProcessor
  ↓ prisma.storageObject.findFirst({ id, organizationId, key: { not: null } })
  ↓   → não encontrado: log de aviso, job termina sem erro
  ↓ objectStorage.get(storageObject.key)                    — bytes reais, via @frontcore/storage
  ↓ ocrService.extract({ buffer, contentType, filename })    — via @frontcore/ocr
  ↓   → formato não suportado (ex. PDF): OCRUnsupportedFormatError, job falha (BullMQ regista/retry)
  ↓   → excede timeout: OCRTimeoutError, job falha
  ↓ Logger.log(texto extraído, confiança, tempo, provider)   — "guardar resultado" nesta fase
```

## Ficheiros criados

```
packages/ocr/package.json, tsconfig.json, tsconfig.build.json, vitest.config.ts
packages/ocr/src/index.ts
packages/ocr/src/contracts/{ocr-provider.ts,ocr-config.ts,ocr-config.test.ts,index.ts}
packages/ocr/src/types/{ocr-input.ts,ocr-result.ts,index.ts}
packages/ocr/src/providers/{index.ts,create-ocr-provider.ts,create-ocr-provider.test.ts}
packages/ocr/src/providers/tesseract/{tesseract-provider.ts,tesseract-provider.test.ts,index.ts}
packages/ocr/src/services/{ocr.service.ts,ocr.service.test.ts,index.ts}
packages/ocr/src/errors/{ocr-provider-error.ts,ocr-extraction-error.ts,ocr-timeout-error.ts,ocr-unsupported-format-error.ts,index.ts}
packages/ocr/src/utils/{with-timeout.ts,with-timeout.test.ts,index.ts}

apps/frontrest/workers/src/storage/object-storage.token.ts
docs/phases/phase-6.2-ocr-pipeline-foundation.md
```

## Ficheiros alterados

```
packages/storage/src/contracts/object-storage.ts        — + get(key): Promise<Buffer>
packages/storage/src/providers/s3/s3-object-storage.ts   — + implementação de get()
packages/storage/src/providers/s3/s3-object-storage.test.ts — + 3 testes para get()

apps/frontrest/workers/package.json                       — + @frontcore/ocr, @frontcore/storage
apps/frontrest/workers/src/queues/ocr-processing.module.ts  — + OBJECT_STORAGE, OCRService (useFactory)
apps/frontrest/workers/src/queues/ocr-processing.processor.ts — fluxo real (Prisma → ObjectStorage → OCRService)
apps/frontrest/workers/src/queues/ocr-processing.processor.spec.ts — testes do fluxo real

apps/frontrest/api/test/utils/mock-object-storage.ts       — + get: jest.fn() (mock atualizado, aditivo)

docker-compose.yml     — serviço workers ganha env de storage (S3_*) + OCR_PROVIDER + depends_on minio
.env, .env.example      — + OCR_PROVIDER, OCR_LANGUAGE, OCR_TIMEOUT_MS

docs/PHASES.md, docs/INDEX.md
```

`apps/frontrest/api/src/**` (exceto o mock de teste) **inalterado** —
nenhuma rota, serviço ou módulo tocado. Nenhuma migration Prisma
criada.

## Dependências introduzidas

```
tesseract.js   — packages/ocr, único ponto do monorepo que a importa
```

## Validações e testes

- `pnpm --filter @frontcore/storage typecheck`/`test` — limpo, 23
  testes (3 novos para `get()`: lê e devolve `Buffer`, rejeita key
  inválida sem chamar o SDK, mapeia falhas para `StorageError`).
- `pnpm --filter @frontcore/ocr typecheck`/`test` — limpo, 20 testes:
  `loadOcrConfig` (2), `withTimeout` (3, incluindo timeout real via
  fake timers), `TesseractProvider` (9 — `supports`/`version`,
  `extract` normalizado, língua customizável, erro de arranque →
  `OCRProviderError`, erro de reconhecimento → `OCRExtractionError`
  com `terminate()` sempre chamado, `health()` true/false),
  `createOcrProvider` (2), `OCRService` (4 — gate de formato, delegação,
  timeout, health).
- `pnpm --filter @frontrest/api typecheck`/`test`/`test:e2e` — limpo,
  **45 unitários + 47 e2e sem nenhuma regressão** (confirma que a
  extensão de `ObjectStorage` não quebrou nada).
- `pnpm --filter @frontrest/workers typecheck`/`test` — limpo, 3
  testes do `OcrProcessingProcessor`: regista o consumidor; fluxo
  completo (StorageObject encontrado → `get()` chamado com a key certa
  → `extract()` chamado com buffer/contentType/filename certos);
  StorageObject não encontrado → não chama storage nem OCRService.
- `pnpm typecheck`/`build`/`test` (raiz) — todos os 23 packages/apps
  do workspace, sem regressões em nenhum.
- Sem testes E2E (explicitamente fora do âmbito desta fase).

## Limitações conhecidas

- **`tesseract.js` descarrega dados de idioma/motor via rede (CDN) na
  primeira utilização**, por omissão — não configurado nesta fase para
  funcionar totalmente offline/air-gapped (exigiria empacotar
  `.traineddata` na imagem Docker, uma otimização de deployment
  explicitamente fora do âmbito "sem otimizações"). Risco real em
  ambientes sem acesso à internet a partir do container `workers`.
- **Só imagens (`image/jpeg`, `image/png`)** — `application/pdf` (já
  aceite pelo pipeline de upload desde a Fase 5.2) não é processável
  por este provider nesta fase; requer renderização de PDF, fora do
  âmbito.
- **`pages` sempre `1`** — sem suporte a documentos multi-página.
- **Sem persistência durável do resultado** — só log estruturado; ver
  "Decisões arquiteturais" para o raciocínio.
- **Sem produtor real** — herdado da Fase 6.1, continua sem resolver:
  nenhum endpoint da API publica jobs em `ocr-processing`.
- **`Invoice.status` sem `DRAFT`** — herdado da Fase 6.1.

## Trabalho fora do âmbito (fases futuras)

IA/LLM, parsing de texto para campos estruturados, extração de NIF,
campos de fatura, classificação documental, embeddings, vetores, RAG,
cache de resultados OCR, OCR multi-thread/paralelo, renderização
avançada de PDF, novos providers (PaddleOCR, Azure Vision, Google
Vision, AWS Textract), persistência durável do resultado, produtor
real a partir do fluxo de upload/fatura, estado `DRAFT` em `Invoice`.

## Resultado final

`@frontcore/ocr` existe como package genuinamente extensível — trocar
de motor é um `case` novo em `createOcrProvider()`, nunca uma alteração
ao Worker. O provider Tesseract é uma implementação real (não mock),
validada por 20 testes unitários com o SDK `tesseract.js` mockado. O
Worker da Fase 6.1 deixou de ser um consumidor mock e passou a
executar o fluxo completo contra `PrismaService`, `ObjectStorage` e
`OCRService` reais — só falta um produtor real e uma decisão de
persistência para deixar de ser foundation.

## Critérios de conclusão

- [x] Package `@frontcore/ocr` completo.
- [x] Contrato `OCRProvider`.
- [x] Provider Tesseract (real, não mock).
- [x] `OCRService`.
- [x] Integração com o Worker.
- [x] Resultado normalizado (`OCRResult`).
- [x] Arquitetura preparada para múltiplos providers (`createOcrProvider`
      + `OCR_PROVIDER`, zero alterações ao Worker para adicionar um novo).
- [x] Testes unitários (contratos, provider, `OCRService`, normalização,
      tratamento de erros) — sem E2E.
- [x] Documentação atualizada (`docs/PHASES.md`, `docs/INDEX.md`, este
      documento).
- [x] `pnpm typecheck`/`test` limpos, sem erros TypeScript.
- [x] Git limpo — sem commit efetuado, por instrução explícita.

## Próxima fase

Candidatos naturais: segundo provider OCR real (prova de que
`createOcrProvider` escala sem tocar no Worker), migration para
`Invoice.status = DRAFT`, decisão de persistência do resultado OCR,
produtor real a partir do fluxo de upload/fatura da API.
