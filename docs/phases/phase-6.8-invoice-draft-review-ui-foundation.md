# Fase 6.8 — Invoice Draft Review UI Foundation

## Objetivo

Primeiro consumidor frontend completo de `InvoiceDraft`: upload →
criação do rascunho → acompanhamento do OCR → consulta do parsing
fiscal → revisão/correção humana → gravação explícita → promoção
explícita a `Invoice`. Sem persistência automática do parsing fiscal,
sem alterar o modelo de `Invoice`, sem abstrações especulativas.

## Âmbito

Rota `/invoice-drafts` (listagem, criação por upload, revisão),
correção do contrato `PATCH` do rascunho para distinguir campo ausente
de campo `null`. Fora do âmbito: preview de PDF/imagem, upload direto
para MinIO, retry manual de OCR, promoção automática, alterações ao
Worker/filas/schema/`Invoice`, `DocumentDraft` genérico, novo package.

## Estado anterior

`InvoiceDraft` (Fase 6.3), integração OCR (Fase 6.4/6.5) e parsing
fiscal (Fase 6.6/6.7) existiam só no backend — `apps/frontrest/web` não
tinha nenhum código relacionado com rascunhos. `UpdateInvoiceDraftDto`
tinha campos opcionais (`T | undefined`) sem forma de distinguir "não
enviar" de "limpar".

## Correção do contrato `PATCH` — descoberta real preservada

Verificado empiricamente (não assumido) contra `class-validator`/
`class-transformer` reais: `@IsOptional()` já aceitava `null` em todos
os 7 campos, sem erro de validação — a fronteira do DTO nunca rejeitou
`null`. O bug real estava só em `InvoiceDraftsService.update()`, em
`issueDate`/`dueDate`: `dto.issueDate ? new Date(dto.issueDate) :
undefined` usa truthiness — `null` (falsy) colapsava para `undefined`
("não alterar"), impedindo limpar a data. Os outros 5 campos
(`supplierId`, `categoryId`, `number`, `totalAmount`, `notes`) já eram
passados diretamente ao Prisma (`data: { supplierId: dto.supplierId,
... }`), que já distingue `undefined` (não altera) de `null` (limpa) —
comportamento correto, mas implícito e nunca testado.

**Correção aplicada, mínima**: só `issueDate`/`dueDate` mudaram de
código (comparação explícita `=== undefined` / `=== null` / valor, em
vez do ternário por truthiness). Os outros 5 campos não mudaram de
lógica — só o tipo declarado do DTO passou a `T | null` para refletir o
comportamento real, e ganharam testes que prAsseguram (não corrigem) o
que já funcionava. Nenhum refactor cosmético dos campos já corretos.

## Payload do `PATCH` — só campos alterados

`apps/frontrest/web` nunca envia os 7 campos de uma vez. O formulário
de revisão mantém dois snapshots (`savedValues`, espelhando o último
estado persistido; `formValues`, o que o utilizador está a editar) e
constrói o payload comparando os dois campo a campo:

- valor igual ao guardado → chave ausente do payload ("não alterar");
- valor diferente e vazio → `null` ("limpar");
- valor diferente e não vazio → o novo valor ("atualizar").

Isto significa que "Aplicar sugestões" (que só toca em `formValues`)
nunca por si só dispara um `PATCH` — só "Guardar alterações" o faz, e
só com as chaves que realmente mudaram.

## Criação por upload — limpeza não-cega do `StorageObject`

A Fase 6.4 estabeleceu que `POST /invoices/drafts` pode falhar de duas
formas distintas: (a) a validação do `StorageObject` falha antes de
qualquer `prisma.invoiceDraft.create()` — o rascunho nunca chegou a
existir (`400`/`404`/`409`); (b) o rascunho é criado com sucesso mas a
publicação do job OCR falha depois (`503`) — o rascunho existe, só
falta o processamento OCR.

`CreateInvoiceDraftDialog` distingue os dois casos pelo status HTTP
(`ApiError.status`, novo em `lib/api.ts`, anexado por `parseJsonOrThrow`
a qualquer falha):

- `400`/`404`/`409` → inequivocamente seguro eliminar o `StorageObject`
  criado (`DELETE /uploads/:id`); se essa limpeza falhar também, os
  dois erros são reportados juntos, nunca um a esconder o outro.
- `503`, erro de rede, ou qualquer status não reconhecido → estado
  ambíguo: **nunca** elimina o `StorageObject` (podia já pertencer a um
  rascunho real — eliminar seria destrutivo ou falharia por
  `onDelete: Restrict`), **nunca** repete automaticamente. Mostra um
  erro claro e recarrega a listagem, para o utilizador ver o estado
  real em vez de uma suposição.

## Parsing fiscal — automático, mas nunca aplicado nem persistido

`GET /invoices/drafts/:id/fiscal-parsing` (Fase 6.7) é puro e sem
persistência — por isso `InvoiceDraftReviewSheet` pede-o
automaticamente assim que `ocrStatus` chega a `COMPLETED`, sem ação
explícita do utilizador. A partir daí, três garantias mantidas
separadas:

- pedir sugestões nunca aplica nada ao formulário (`suggestions` e
  `formValues` são estados independentes);
- aplicar sugestões (`"Aplicar sugestões"`) nunca executa `PATCH`
  (só copia valores para `formValues`);
- erro do parsing (`parsingError`) nunca se mistura com o estado/erro
  do OCR (`ocrStatus`/`ocrError`) — duas fontes de erro, dois estados.

Repetir o parsing (reabrir a revisão, ou uma fase futura com botão
dedicado) nunca apaga correções manuais — só `formValues` alimenta o
`PATCH`, e `formValues` só muda por edição direta ou por um clique
explícito em "Aplicar sugestões".

## Polling do estado OCR

`useEffect` local ao `InvoiceDraftReviewSheet` (sem hook genérico, sem
biblioteca nova) — corre só enquanto `ocrStatus` é `PENDING` ou
`PROCESSING`, intervalo de 3s, cancelado ao fechar a `Sheet`, desmontar,
ou assim que o estado deixa de ser `PENDING`/`PROCESSING`. Cada tick
atualiza o snapshot do draft e de `savedValues` — nunca toca em
`formValues`, para uma atualização de polling nunca sobrepor uma edição
em curso do utilizador.

## Permissões — leitura vs. edição, não só esconder botões

`MEMBER` vê a revisão em modo de leitura genuíno: texto simples (sem
`<input>`/`<select>`), sem "Guardar alterações", "Aplicar sugestões",
"Eliminar rascunho" ou "Promover a fatura" — não um formulário editável
com botões desativados. `MANAGER+` vê o formulário completo e todas as
ações. A proteção real continua exclusivamente no backend
(`@Roles('MANAGER')`, inalterado) — esta distinção na UI é só
apresentação; contornar o frontend nunca dá acesso de escrita real.

## Tipos frontend — só a forma HTTP consumida

`InvoiceDraft` (`lib/invoice-drafts.ts`) declara só os campos que a UI
lê — `supplier`/`category` reutilizam `InvoiceSupplierRef`/
`InvoiceCategoryRef` já exportados por `lib/invoices.ts` (`{ id, name
}`), não o objeto `Supplier`/`ExpenseCategory` completo que a API
devolve incidentalmente (`include: { supplier: true, category: true }`
no Prisma). `DraftFiscalSuggestions` tipa só o subconjunto de
`FiscalExtractionResult` (Fase 6.6) usado nesta fase — `supplier`,
`supplierTaxId`, `invoice.{number,issueDate,dueDate}`, `totals`,
`confidence` — sem `customer`/`vat`/`currency`/`metadata`, sem campo de
formulário correspondente. Datas de `ExtractionMatch<Date>` chegam como
`string` ISO em JSON — o tipo frontend usa `string`, nunca `Date`.

## Reutilização confirmada (sem duplicar)

- `InvoiceSupplierRef`/`InvoiceCategoryRef`/`Invoice` (tipo de retorno
  da promoção) importados de `lib/invoices.ts`, não redeclarados.
- `fullWidthSelectClassName` (`invoices/constants.ts`) importado
  diretamente pela revisão do rascunho — sem duplicar a mesma classe
  Tailwind.
- `formatCurrency`/`formatDate` — eram funções locais não exportadas de
  `invoices/page.tsx`; extraídas para `lib/format.ts` (novo) nesta fase
  e reutilizadas pelas duas páginas, eliminando a duplicação que existir
  criando a página de rascunhos exporia.
- `ConfirmDialog`, `useFeedback`/`FeedbackBanner`, `canManage`,
  `PaginationControls`, componentes de `forms/upload/`
  (`UploadDropzone`/`UploadError`) — todos reutilizados sem alteração.
- Nenhum componente novo em `@frontcore/ui` — `Dialog`/`Sheet` já
  cobrem os dois níveis de complexidade necessários (criação simples vs.
  revisão multi-campo), mesmo critério já estabelecido nas Fases 4.2/5.4.

## Infraestrutura de testes — nova em `apps/frontrest/web`, não nova no monorepo

`apps/frontrest/web` não tinha nenhuma infraestrutura de testes.
Introduzido Vitest + Testing Library, espelhando exatamente a
configuração já usada por `packages/ui` (`environment: 'jsdom'`,
`setupFiles`, `@testing-library/jest-dom`) — não é uma ferramenta nova
no monorepo, só a extensão do padrão já estabelecido a um segundo
consumidor. `esbuild.jsx: 'automatic'` foi necessário só no
`vitest.config.ts` (o `tsconfig.json` do Next.js usa `jsx: "preserve"`,
que o esbuild do Vitest não interpreta da mesma forma) — não altera o
build de produção do Next, só a execução de testes.

Suite deliberadamente pequena — só os comportamentos de maior risco/
mais específicos desta fase, não uma suite exaustiva por componente:
limpeza (não-)cega do upload (2 testes), modo de leitura do `MEMBER` (1),
"Aplicar sugestões" não persiste (1), `PATCH` só com campos alterados
(1), promoção exige confirmação (1).

## Ficheiros criados

```
apps/frontrest/web/lib/uploads.ts
apps/frontrest/web/lib/invoice-drafts.ts
apps/frontrest/web/lib/format.ts
apps/frontrest/web/app/(dashboard)/invoice-drafts/page.tsx
apps/frontrest/web/app/(dashboard)/invoice-drafts/create-invoice-draft-dialog.tsx
apps/frontrest/web/app/(dashboard)/invoice-drafts/invoice-draft-review-sheet.tsx
apps/frontrest/web/app/(dashboard)/invoice-drafts/constants.ts
apps/frontrest/web/app/(dashboard)/invoice-drafts/create-invoice-draft-dialog.test.tsx
apps/frontrest/web/app/(dashboard)/invoice-drafts/invoice-draft-review-sheet.test.tsx
apps/frontrest/web/vitest.config.ts
apps/frontrest/web/src/test/setup.ts
docs/phases/phase-6.8-invoice-draft-review-ui-foundation.md
```

## Ficheiros alterados

```
apps/frontrest/api/src/invoices/drafts/dto/update-invoice-draft.dto.ts — tipos T | null (7 campos)
apps/frontrest/api/src/invoices/drafts/invoice-drafts.service.ts       — issueDate/dueDate: null explícito
apps/frontrest/api/src/invoices/drafts/invoice-drafts.service.spec.ts  — testes da distinção ausente/null/valor
apps/frontrest/api/test/invoice-drafts.e2e-spec.ts                     — idem, e2e

apps/frontrest/web/lib/api.ts                     — + ApiError (status HTTP anexado)
apps/frontrest/web/lib/nav-config.ts              — + "Rascunhos de Fatura"
apps/frontrest/web/app/(dashboard)/invoices/page.tsx         — formatCurrency/formatDate movidos para lib/format.ts
apps/frontrest/web/app/(dashboard)/invoices/constants.ts     — fullWidthSelectClassName passa a reutilizado por invoice-drafts/
apps/frontrest/web/package.json                   — + script test, devDependencies (vitest, testing-library, jsdom)
pnpm-lock.yaml

docs/PHASES.md, docs/INDEX.md, docs/ARCHITECTURE.md
```

Nenhuma migration Prisma. `Invoice`/`InvoicesService`/`InvoicesController`,
promoção, Worker, filas, schema Prisma **inalterados** para além da
correção de tipos do DTO (sem alteração ao schema em si).

## Validações (comandos)

- `pnpm typecheck` — 23/23 (raiz e isolado por app: `@frontrest/api`, `@frontrest/web`).
- `pnpm build` — 14/14; rota `/invoice-drafts` gerada.
- `pnpm test` — 16/16 tarefas (`@frontrest/api`: 206 testes, +10 desta
  fase; `@frontrest/web`: 6 testes, novos nesta fase).
- `pnpm --filter @frontrest/api test:e2e` — 74/74 (+2 desta fase).

Repetidas integralmente numa segunda sessão de revisão, sem alterações
de código entre as duas execuções — mesmos resultados, confirmando que
não há flakiness nem dependência de ordem.

## Validação real (Docker)

`docker compose build api web workers` + `up -d` — as três imagens
reconstruídas a partir do working tree atual (as anteriores tinham ~31h,
anteriores até ao commit da Fase 6.7); `docker compose ps` confirmou os
6 serviços saudáveis; `curl http://localhost:3001/api/health` e
`curl -I http://localhost:3000/invoice-drafts` — `200`. Logs de arranque
sem erros; `InvoiceDraftsController` regista corretamente as 7 rotas
(incluindo `GET/PATCH/DELETE :id`, `GET :id/fiscal-parsing`,
`POST :id/promote`).

Validação ponta-a-ponta contra a infraestrutura real (Postgres/Redis/
MinIO/Tesseract reais, organização própria registada para esta
validação):

1. **Upload real** (`POST /uploads`, imagem PNG gerada com texto de
   fatura real) → `StorageObject` real; `POST /invoices/drafts` → draft
   criado com `ocrStatus: PENDING`, job publicado.
2. **Ciclo OCR real**: `PENDING` → `COMPLETED` em ~2s, `ocrConfidence: 88`,
   `ocrText` com o texto genuinamente reconhecido pelo Tesseract
   (incluindo os erros de reconhecimento esperados em acentuação — "ç"/
   "ã" mal interpretados — comportamento normal de OCR, não um bug).
3. **Parsing fiscal real** (`GET .../fiscal-parsing`): resultado
   estruturado com `value`/`confidence`/`source` por campo; fornecedor,
   NIF, número e total corretamente extraídos do texto OCR real;
   `issueDate` corretamente `null` porque o OCR leu "Emissão" como
   "Emissdo" (o extractor exige o rótulo reconhecível — comportamento
   correto perante ruído real, não uma falha); duas chamadas
   consecutivas devolveram valores idênticos (só `processingTimeMs`
   variou); o `InvoiceDraft` permaneceu com todos os campos `null`
   depois das duas chamadas — confirma ausência de persistência
   automática contra a base de dados real, não só contra mocks.
4. **`PATCH` nullable, campo a campo, contra Postgres real**: `notes`
   isolado (restantes campos confirmados intocados); todos os campos
   atualizados de uma vez com valores reais (incluindo `supplierId` de
   um fornecedor real); `totalAmount` atualizado sozinho sem tocar nos
   restantes; `categoryId`/`number`/`issueDate`/`dueDate`/`notes`
   limpos individualmente via `null`; `supplierId: null` limpou o
   fornecedor. Os 7 campos confirmados — incluindo `issueDate`/
   `dueDate`, a correção real desta fase.
5. **Promoção**: bloqueada com `400` e a lista exata dos campos em
   falta (`supplierId, issueDate`, no momento em que só esses dois
   faltavam — confirma que a mensagem reflete o estado real, não uma
   lista fixa); depois de preencher, `201` com a `Invoice` criada;
   `InvoiceAttachment` confirmado via `GET /invoices/:id/attachments`
   (mesmo `storageObjectId` do upload original); `Invoice` visível em
   `GET /invoices`; `GET /invoices/drafts/:id` do draft promovido → `404`
   (eliminado); nova tentativa de `POST /invoices/drafts` com o mesmo
   `storageObjectId` → `409` ("já está associado a uma fatura") —
   confirma contra a API real que os estados que
   `CreateInvoiceDraftDialog` trata como "seguro eliminar o upload"
   (`400`/`404`/`409`) correspondem exatamente a respostas reais da API.
6. **Isolamento entre organizações**: segunda organização real
   registada; tentativa de ler o fornecedor da primeira organização →
   `404`; tentativa de ler a `Invoice` promovida da primeira
   organização → `404`; listagem de drafts da segunda organização →
   vazia.
7. **Cenário `FAILED` controlado** — tentado com uma imagem
   deliberadamente corrompida (assinatura PNG válida, corpo aleatório).
   Achado real, **fora do âmbito da Fase 6.8** (ver "Problema encontrado
   fora do âmbito", abaixo): em vez de terminar em `FAILED` com
   `ocrError` sanitizado, o processamento da imagem corrompida gerou uma
   exceção não apanhada dentro do worker thread do `tesseract.js`, que
   derrubou todo o processo `frontcore-workers` (`Node.js v20.20.2`
   termina após o stack trace). O container reiniciou automaticamente
   (`restart: unless-stopped`), mas o job ficou preso em `PROCESSING`
   sem nunca transitar — não foi possível observar `FAILED` real através
   do worker Tesseract genuíno nesta validação. O draft de teste foi
   eliminado manualmente (`DELETE /invoices/drafts/:id`) para não deixar
   a organização de validação num estado inconsistente. O caminho
   `FAILED` continua validado ao nível de código pelos testes existentes
   de `ocr-processing.processor.spec.ts` (Fase 6.5, "Retry & Recovery"),
   que simulam o erro em vez de o produzirem através do provider real.
8. **`MEMBER` via API real — não executado**: a aplicação não tem
   nenhum endpoint de convite/atribuição de role a um segundo utilizador
   da mesma organização (`AuthController` só tem
   `register`/`login`/`refresh`/`logout`/`me`; `register` cria sempre
   uma organização nova com o registante como `OWNER`). Não existe hoje
   forma de obter um utilizador `MEMBER` real na mesma organização só
   através da API. As restrições de `MEMBER` (`403` em escrita, leitura
   permitida) continuam validadas pelos 74 testes e2e reais (que
   exercitam o `RolesGuard` genuíno via `supertest`), não pela validação
   Docker desta sessão.

## Problema encontrado fora do âmbito — não corrigido

**Exceção não tratada no worker thread do `tesseract.js` derruba o
processo `frontcore-workers`** quando a imagem processada está
corrompida (assinatura de ficheiro válida, conteúdo interno inválido).
`process.nextTick(() => { throw err; })`, disparado a partir do
`MessagePort` interno do worker thread — não é apanhado por nenhum
`try/catch` de `OcrProcessingProcessor` nem por `OCRService`/
`TesseractProvider` (`packages/ocr`), porque a exceção não passa pelo
caminho normal de rejeição de uma `Promise`. O container recupera
sozinho (`restart: unless-stopped`), mas o job em curso fica preso em
`PROCESSING` — nem `PENDING` (retry) nem `FAILED`.

Não corrigido nesta fase — é um problema de `packages/ocr`/
`apps/frontrest/workers` (Fases 6.1/6.2/6.5), não de
`apps/frontrest/web` nem do contrato `PATCH` (Fase 6.8). Corrigi-lo
exigiria capturar exceções ao nível do processo ou isolar a chamada ao
`tesseract.js` (ex. `Promise` própria em torno do evento de erro do
worker thread), uma alteração arquitetural a `@frontcore/ocr`, fora do
âmbito aprovado desta fase.

## Revalidação real pós-Fase 6.9 (2026-07-13)

Auditoria dedicada ao estado real da Fase 6.8, depois de `main` já ter
`v0.6.9-pdf-rasterization-foundation` integrada. Documentação completa
relida (`docs/INDEX.md` → `docs/ai/README.md` → `AI_BASE_PROMPT.md`/
`AI_WORKFLOW.md`/`AI_GOVERNANCE.md`/`AI_RELEASE_CHECKLIST.md` →
`ARCHITECTURE.md`/`PHASES.md` → fases 5.4 e 6.3–6.9), código frontend e
backend revisto por inteiro (página, diálogo de criação, sheet de
revisão, `lib/`, controller, service, DTOs). **Nenhuma divergência entre
documentação e código encontrada; nenhum bug reproduzível encontrado;
nenhuma alteração de código foi necessária.**

Validações repetidas do zero: `pnpm typecheck` (23/23), `pnpm build`
(14/14, rota `/invoice-drafts` presente), `pnpm test` (16/16 tarefas,
incluindo os 6 testes de `apps/frontrest/web`), `pnpm --filter
@frontrest/api test:e2e` (74/74). Imagens `api`/`web`/`workers`
reconstruídas a partir do working tree atual (`docker compose build` —
confirmado por cache-hit de contexto idêntico no caso do `workers`,
cujo código não mudou desde a última reconstrução); os 6 serviços
saudáveis.

Fluxo real repetido ponta-a-ponta contra Postgres/Redis/MinIO/Tesseract/
Poppler reais, organização própria registada: upload de imagem real →
OCR `COMPLETED` (confiança 88%, texto genuíno); parsing fiscal (2
chamadas idênticas, sem persistência automática confirmada por reload);
`PATCH` isolado, `PATCH` de todos os campos, `PATCH` a limpar `notes`
via `null`, persistência confirmada por reload; promoção → `201`,
draft eliminado (`404` a seguir), `Invoice` visível em `GET /invoices`,
`InvoiceAttachment` associado ao `storageObjectId` original; segunda
organização real confirma isolamento (`404` cruzado, listagem vazia,
`storageObjectId` de outra organização rejeitado). Adicionalmente,
fluxo PDF (Fase 6.9) repetido através dos mesmos endpoints desta fase —
`ocrText`/`supplier.value.name` corretos, sem o marcador de página
(confirma que a correção de regressão da Fase 6.9 se mantém válida
também pelo caminho de consumo da Fase 6.8).

Continua por fazer apenas o já registado em "Limitações conhecidas" —
validação manual interativa no browser (sem acesso a browser neste
ambiente de execução) e `MEMBER` real via Docker (sem endpoint de
convite). Nada nesta revalidação altera essas limitações nem os
critérios de conclusão já assinalados.

## Validação manual

Fluxo completo confirmado interativamente no browser, contra a
infraestrutura real (Docker/Postgres/Redis/MinIO/Tesseract) — cobre
exatamente o que a "Validação real (Docker)" e a "Revalidação real
pós-Fase 6.9" já tinham confirmado ao nível dos contratos HTTP,
desta vez por interação direta na interface:

- fluxo completo Upload → `InvoiceDraft` → OCR → Fiscal Parsing →
  Review → Promote, ponta a ponta, por clique real;
- upload de documentos (drag-and-drop/seleção de ficheiro);
- criação do `InvoiceDraft` a partir do upload;
- processamento OCR e atualização do respetivo estado (badge) na
  interface, sem intervenção manual;
- carregamento automático das sugestões do parsing fiscal assim que o
  OCR fica `COMPLETED`;
- abertura da interface de revisão (`InvoiceDraftReviewSheet`);
- edição manual dos campos do formulário;
- gravação das alterações (`PATCH` diff-only);
- promoção explícita a `Invoice`, com o diálogo de confirmação;
- funcionamento geral da interface — navegação, estados de
  carregamento, mensagens de erro/sucesso, botões.

Com esta confirmação, o único critério de conclusão que permanecia por
validar (ver "Critérios de conclusão") fica satisfeito. **A Fase 6.8 é
considerada concluída.**

Esta validação confirma que o objetivo definido para a Fase 6.8 foi
integralmente cumprido. A interface de revisão encontra-se funcional e
considera-se esta fase concluída. As melhorias futuras deverão incidir
exclusivamente na qualidade do OCR e do parsing fiscal, não na
arquitetura nem no fluxo de revisão implementado nesta fase.

## Hardening pós-validação manual — OCR Fiscal Parsing & Invoice Promotion (documentos reais)

Nova ronda de validação manual com documentos reais ("Coca-Cola",
"Farmácia Esperança") encontrou dois problemas de reconhecimento de
número de fatura e levantou três dúvidas sobre elegibilidade de
promoção/gestão de sessão — analisadas e, quando confirmadas como
regressões reais, corrigidas; quando não reproduzidas, documentadas
como tal em vez de "corrigidas" por precaução.

- **Números de fatura sem sub-rótulo "N.º"** — `InvoiceNumberExtractor`
  (`invoice-number.extractor.ts`) exigia sempre um sub-rótulo explícito
  ("N.º"/"Number"/"#") ou um candidato a começar por dígito logo a
  seguir à palavra-chave. Dois formatos reais não satisfaziam nenhuma
  das duas condições: `"Fatura/Recibo : ZFRC B036/9823519819"`
  ("Coca-Cola") e `"Número: FR U006/46931"` ("Farmácia Esperança", sem a
  palavra "fatura" em lado nenhum próximo — limitação conhecida e aceite
  até esta correção). Corrigido com um terceiro padrão,
  `WITH_COLON_SEPARATOR_PATTERN` (confiança 75, entre o sub-rótulo
  explícito e o fallback "dígito nu"): um `":"`/`";"` imediatamente a
  seguir a um vocabulário próprio e fixo (`COLON_ANCHORED_KEYWORD` —
  `fatura`/`factura`/`invoice`/`recibo`/`documento`/`numero`/`número`),
  guardado por `CANDIDATE_HAS_DIGIT` (o candidato tem de conter pelo
  menos um dígito, para nunca aceitar ruído de OCR sem dígitos — achado
  real, "Ilha Pan": `"Total Documento: ooo"` nunca pode virar candidato).
  **Vocabulário isolado do `KEYWORD` original, nunca fundido nele** —
  uma primeira tentativa de acrescentar `recibo` ao `KEYWORD` partilhado
  por `WITH_SUBLABEL_PATTERN` introduziu uma regressão real (fixture
  "Leroy": `"Válido como RECIBO no REGIME IVA..."` passava a devolver
  `"REGIME"`, por `"no"` já ser aceite como sub-rótulo minimalista
  nesse padrão) — corrigida isolando o vocabulário novo num padrão
  próprio, nunca reutilizando o `KEYWORD` de `WITH_SUBLABEL_PATTERN`/
  `BARE_DIGIT_FIRST_PATTERN`.
- **Biblioteca de regressão (Fase 6.13)** — fixture "Coca-Cola"
  atualizada (`invoiceNumber` deixa de ser `null`, passa a
  `"ZFRC B036/9823519819"`); os dois testes que documentavam a
  limitação anterior em `fiscal-parsing.service.spec.ts` reescritos para
  confirmar o valor correto, em vez da ausência.
- **Data de vencimento nunca foi obrigatória** — confirmado por leitura
  direta do schema Prisma (`Invoice.dueDate DateTime?`), do
  `CreateInvoiceDto`/`UpdateInvoiceDraftDto` (`@IsOptional()`), de
  `InvoiceDraftsService.promote()` (só exige `supplierId`/`issueDate`/
  `totalAmount`) e de `canPromote` no frontend (mesmos três campos, nunca
  `dueDate`) — e por um teste e2e já existente que promove com sucesso
  com `dueDate: null` (`invoice-drafts.service.spec.ts`, `completeDraft()`).
  **Não é uma regressão de código, nunca foi corrigida uma regra que não
  existia.** A perceção de obrigatoriedade reportada na validação manual
  é só de UX — o campo "Data de vencimento" não distinguia visualmente
  de um campo obrigatório. Corrigido só a etiqueta
  (`FieldLabel`: "Data de vencimento" → "Data de vencimento
  (opcional)"), sem qualquer alteração de validação. Reforçado com um
  novo teste e2e explícito para documentos `FATURA-RECIBO` sem
  vencimento (`invoice-drafts.e2e-spec.ts`).
- **Elegibilidade de promoção já consistente entre frontend e
  backend** — confirmado, não alterado: `canPromote`
  (`invoice-draft-review-sheet.tsx`) e `InvoiceDraftsService.promote()`
  exigem exatamente os mesmos três campos (`supplierId`/`issueDate`/
  `totalAmount`); nenhuma inconsistência encontrada.
- **"Token de acesso inválido ou expirado." sem qualquer tentativa de
  renovação** — `POST /auth/refresh` já existia no backend
  (`AuthService.refresh()`) mas não tinha nenhum consumidor no
  frontend; qualquer pedido depois do `accessToken` de curta duração
  expirar falhava de imediato com o 401 cru, nunca tentando renovar a
  sessão. Corrigido com `refreshSession()`/`withAuthRetry()`
  (`lib/auth.ts`) — uma única tentativa de renovação por pedido falhado,
  nunca um ciclo; falha da própria renovação propaga
  `SessionExpiredError` (mensagem clara e distinta, "A sua sessão
  expirou. Inicie sessão novamente.", nunca o 401 cru). Ligado apenas a
  `InvoiceDraftReviewSheet` (`Guardar`/`Eliminar`/`Promover`) — âmbito
  desta correção é só Invoice Draft Review/Promotion, nunca uma
  alteração global ao cliente HTTP do resto da aplicação.
  `refreshToken`/`onTokensRefreshed` são props opcionais no componente,
  para preservar compatibilidade com quem já o usa sem sessão renovável
  (testes existentes); `useSession()` ganhou `updateTokens()` para
  persistir o par de tokens novo (aditivo, nenhum outro consumidor do
  contexto precisa de o usar).
- **Estado inicial `PENDING` da `Invoice` promovida** — reconfirmado
  como decisão documentada da Fase 6.3 (`status: 'PENDING'` sempre,
  independentemente do tipo de documento), não uma regressão. Para
  documentos `FATURA-RECIBO` (fatura+recibo combinados, tipicamente já
  pagos no ato) isto pode ser semanticamente impreciso — registada como
  observação para decisão do Product Owner (ver "Observações para fases
  futuras"), **nenhuma alteração de comportamento estrutural feita**.

**Ficheiros alterados**: `invoice-number.extractor.ts` (+ spec),
`fiscal-parsing.service.spec.ts`, `fixtures.ts` (Fase 6.13),
`invoice-drafts.e2e-spec.ts`, `invoice-draft-review-sheet.tsx` (+ spec),
`invoice-drafts/page.tsx`, `lib/auth.ts`, `lib/session-context.tsx`.
Nenhuma alteração ao OCR Pipeline, Workers, Dashboard, Reports, AI Chat,
Financial Insights/Analysis Engine, Prisma/migrations, ou frontend fora
de Invoice Draft Review/Promotion.

## Limitações conhecidas

- **A interface está concluída e funcional** — validada tanto contra a
  API real (secções acima) como manualmente no browser (ver "Validação
  manual"). As limitações abaixo são do domínio OCR/parsing, não da
  interface desta fase.
- **O OCR pode continuar a produzir resultados imperfeitos**,
  dependendo da qualidade e do formato do documento — identificados,
  entre outros: confusão entre `0` e `O`; reconhecimento imperfeito de
  alguns números de fatura; necessidade ocasional de correção manual
  pelo utilizador.
- Estas limitações **não comprometem o fluxo**: toda a sugestão do
  parsing fiscal passa obrigatoriamente por revisão humana antes de
  qualquer valor chegar a `Invoice` — nada é persistido a partir do OCR/
  parsing sem confirmação explícita (ver "Parsing fiscal — automático,
  mas nunca aplicado nem persistido", acima).
- Melhorias futuras de precisão de OCR e de parsing fiscal devem ser
  tratadas numa fase própria de evolução — não nesta foundation —
  suportadas por documentos reais e pela suite de regressão já existente
  (`fiscal-parsing.regression.spec.ts`, Fase 6.13), que protege
  precisamente contra este tipo de regressão.
- Estas limitações foram observadas durante testes reais e representam
  limitações naturais do OCR determinístico utilizado nesta fase, não
  falhas da interface de revisão implementada.
- **`MEMBER` real não testado via Docker** — ver ponto 8 da "Validação
  real", acima; sem endpoint de convite/gestão de membros na aplicação
  (limitação pré-existente, não desta fase), a validação de `MEMBER`
  contra infraestrutura real não foi possível nesta sessão. Coberto
  pelos 74 testes e2e reais.
- **Cenário `FAILED` real não observado** — ver "Problema encontrado
  fora do âmbito", acima; o caminho de código continua validado por
  teste, não por execução real do provider Tesseract.
- **Suite de frontend deliberadamente pequena** — cobre os
  comportamentos de maior risco desta fase, não todos os 11 cenários
  listados no pedido original; os restantes (estados OCR renderizados
  corretamente, polling inicia/pára/limpa, parsing só pedido com OCR
  utilizável, erros via `FeedbackBanner`) dependem mais de inspeção
  visual/comportamento assíncrono do que de asserções unitárias de
  alto valor — cobertos pela validação manual, não duplicados em teste
  automatizado de baixo valor.
- **`totalAmount` como `string`** — o formulário guarda-o como string
  controlada (mesmo padrão de `InvoiceFormSheet`), convertido para
  `number` só no momento do `PATCH`; sem validação de casas decimais
  além da nativa do `<input type="number" step="0.01">`.

## Riscos aceites

- O crash do worker Tesseract perante uma imagem corrompida (ver acima)
  é aceite como risco conhecido, não bloqueador desta fase — o
  `restart: unless-stopped` do Docker já garante recuperação automática
  do processo; o pior caso observado é um job individual preso em
  `PROCESSING` até intervenção manual (eliminar o draft), nunca perda de
  dados nem corrupção de outros drafts.
- Sem mecanismo de convite de membros, `MEMBER` real só pode ser testado
  manualmente através de uma conta já existente com essa role (se o
  utilizador tiver uma), ou aceite como coberto só pelos testes
  automatizados.

## Trabalho futuro

Corrigir o crash do worker Tesseract perante imagens corrompidas
(`packages/ocr`/`apps/frontrest/workers`, fora do âmbito desta fase); endpoint de
convite/gestão de membros (necessário para testar `MEMBER` real contra
infraestrutura real em qualquer fase futura); "Aplicar sugestões" por
campo em vez de tudo-ou-nada; preview de PDF/imagem no painel de
revisão; persistência do parsing fiscal no draft (se um segundo
consumidor real justificar); endpoint de reagendamento de OCR (já
preparado desde a Fase 6.5) com botão de retry manual na UI.

## Observações para fases futuras

- **Problema encontrado**: documentos `FATURA-RECIBO` (fatura+recibo
  combinados, tipicamente já pagos no ato da emissão) são promovidos
  sempre com `status: 'PENDING'` — a mesma decisão para qualquer
  documento, independentemente de já estarem pagos ou não, decisão
  documentada na Fase 6.3 e reconfirmada nesta ronda de hardening.
  **Impacto**: um `FATURA-RECIBO` promovido aparece como "por pagar" em
  relatórios/dashboards de outstanding até ser corrigido manualmente
  para `PAID` — potencial fonte de erro humano recorrente para este tipo
  de documento especificamente. **Sugestão**: avaliar, numa fase própria
  e com decisão explícita do Product Owner, se `InvoiceDraft`/
  `promote()` deveria distinguir este tipo de documento (ex. um sinal
  detetado no parsing fiscal, ou uma escolha explícita do utilizador no
  formulário de revisão) para pré-selecionar `PAID` em vez de `PENDING`
  — nunca inferir isto automaticamente sem confirmação humana.
  **Prioridade**: Média.

## Critérios de conclusão

- [x] Rota `/invoice-drafts` funcional (confirmado real via Docker).
- [x] Criação por upload através dos endpoints existentes (confirmado real).
- [x] Componentes de upload existentes reutilizados (`forms/upload/`).
- [x] Listagem com paginação.
- [x] Estado OCR apresentado corretamente (badge + confiança + erro sanitizado).
- [x] Polling limitado, cancelável, termina em `COMPLETED`/`FAILED`.
- [x] Parsing fiscal consumido sem persistência automática (confirmado real).
- [x] Sugestões com valor, confiança e origem (confirmado real).
- [x] Sugestões não substituem silenciosamente dados manuais (`formValues`/`suggestions` desacoplados).
- [x] Fornecedor exige escolha humana (nunca `supplierId` automático).
- [x] Correções guardáveis no draft (`PATCH` diff-only).
- [x] Campos nullable limpáveis via `null`; campo ausente não altera (confirmado real, Postgres, 7/7 campos).
- [x] `MEMBER` em modo de leitura genuíno (sem formulário, sem ações de escrita) — testado (unitário + e2e); não confirmado via Docker real (ver limitações).
- [x] `MANAGER+` pode criar, editar, eliminar, promover (confirmado real).
- [x] Promoção exige confirmação (testado).
- [x] Promoção usa a transação já existente — confirmado real (`Invoice` + `InvoiceAttachment` criados, draft eliminado).
- [x] Nenhuma migration Prisma.
- [x] Nenhuma alteração a Worker, filas ou providers.
- [x] Nenhuma alteração ao contrato de `Invoice`.
- [x] Nenhum novo package.
- [x] Testes relevantes limpos (backend + frontend, novos e existentes).
- [x] Typecheck e build limpos (raiz e isolado por app).
- [x] Validação Docker executada (imagens reconstruídas, 6 serviços saudáveis).
- [x] Validação real da API executada (upload, OCR, parsing, PATCH nullable ×7, promoção, isolamento).
- [x] Fluxo completo validado manualmente no browser (confirmado pelo utilizador — ver "Validação manual").
- [x] Documentação da fase atualizada com o estado real (`PHASES.md`/`INDEX.md`/`ARCHITECTURE.md`).
- [x] Git permanece sem commit/tag/push executados pela IA.

## Próxima fase

Fase concluída — sem bloqueio pendente. Candidatos naturais para fases
futuras: corrigir o crash do worker Tesseract com imagens corrompidas,
endpoint de convite/gestão de membros, persistência opcional do parsing
fiscal no draft, UI de retry manual de OCR, preview de documento.
