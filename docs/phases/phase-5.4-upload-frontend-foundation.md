# Phase 5.4 — Upload Frontend Foundation

## Objetivo

Fundação frontend para uploads/anexos no FrontRest: componentes
genéricos de upload em `@frontcore/ui` e a integração de domínio que
permite anexar, listar, descarregar e remover ficheiros de uma fatura a
partir do browser, consumindo os endpoints já existentes da Fase 5.3
(`invoices/attachments/`). Sem `getUploadUrl()`, sem OCR, sem preview
avançado, sem gestão documental global.

## Estado inicial

`apps/frontrest/api` já tinha o fluxo completo de anexos de fatura
implementado e validado (Fase 5.3), mas sem nenhum consumidor no
frontend — `apps/frontrest/web` não tinha nenhum código relacionado
com upload, `@frontcore/ui` não tinha nenhum componente de upload.

## Decisão arquitetural revista antes da implementação

Antes de implementar, foi pedida uma revisão dedicada sobre a
localização dos novos componentes: `packages/ui/src/components/forms/upload/`
(subpasta de uma categoria existente) vs. `packages/ui/src/components/upload/`
(uma 9ª categoria de topo), motivada pela lista de consumidores futuros
esperados (Reports, Avatars, Contracts, OCR, Media Library).

**Decisão: manter em `forms/upload/`.** O critério que a ADR-0003 usa
para separar as suas 8 categorias é **responsabilidade técnica de
composição** (ex.: `overlay` existe por partilhar portal/z-index/focus
trap; `shell` por assumir chrome de app autenticada), nunca o número de
consumidores de domínio que um componente vai ter — pelo mesmo
critério, `Button` continua em `primitives/` apesar de ser o componente
mais reutilizado de todo o sistema. Tecnicamente, `UploadDropzone`/
`UploadButton` são controlos de formulário mais ricos (o mesmo papel de
`Input`/`Textarea`); `UploadFileList` é composição de listagem simples.
Nenhum introduz um concern técnico novo que justifique, pelo critério
já em uso, uma fronteira nova. Promover para uma categoria de topo
antes de existir mais do que um consumidor de domínio real (hoje: só
Invoice Attachments) seria decidir por reuso especulativo — o mesmo
tipo de abstração prematura já recusada noutras fases de `packages/*`
(ex. Fase 5.1/5.2: sem wrapper NestJS/`StorageService` até haver
consumidor real). Uma categoria própria só deve ser reconsiderada no
futuro se aparecer um **concern técnico novo** que a justifique — não
pela contagem de consumidores — e nesse momento exigiria a sua própria
ADR, não uma decisão dentro de uma fase de produto. O custo de mover
mais tarde é baixo: consumidores importam sempre via `@frontcore/ui`,
nunca do caminho do ficheiro.

## Arquitetura implementada

```
@frontcore/ui (forms/upload/)      — captura e apresentação de ficheiro, sem domínio, sem fetch
        ↓ consumido por
apps/frontrest/web/lib/invoice-attachments.ts   — chamadas HTTP, tipos da resposta da API
        ↓ consumido por
apps/frontrest/web/.../invoice-attachments-panel.tsx   — orquestração de domínio (Invoice + Anexos)
        ↓ montado a partir de
apps/frontrest/web/.../invoices/page.tsx   — botão "Anexos" por linha
```

### `packages/ui/src/components/forms/upload/`

- **`UploadDropzone`** — área de clique/drag & drop nativo (sem
  biblioteca externa). O `<input type="file">` fica `sr-only` (nunca
  `display:none`) dentro de um `<label>` — mantém-se focável por
  teclado, `Enter`/`Espaço` abrem o seletor nativo, `focus-within` dá o
  anel de foco visível na área visual em vez de no input escondido.
  Emite só `onFileSelected(file)`; não sabe nada sobre rede ou domínio.
- **`UploadButton`** — mesma aparência de `Button` (reutiliza
  `buttonVariants` de `primitives/button.tsx` diretamente, sem duplicar
  classes), mas o elemento interativo real é o `<input type="file">`
  `sr-only` dentro de um `<label>` — evita aninhar um `<button>` dentro
  de um `<label>` (dois elementos interativos sobrepostos). Estado
  `loading` reutiliza o `Spinner` já existente em `feedback/`.
- **`UploadFileList`** — lista genérica de `{ id, name, meta?, actions? }`;
  `meta` e `actions` são fornecidos pelo consumidor via slot (o mesmo
  padrão de composição já usado em `EmptyState`) — não conhece
  `InvoiceAttachment` nem qualquer outro tipo de domínio.
- **`UploadError`** — compõe `Alert`/`AlertDescription` (`feedback/`)
  existentes com `variant="destructive"`, sem recriar a semântica de
  erro do zero.
- **Sem `UploadProgress`** — decisão deliberada. O upload atual é um
  único `fetch` com `FormData`, sem evento de progresso real
  disponível sem trocar a implementação de rede (fora do âmbito: "não
  fazer refactors oportunistas"). Simular uma percentagem falsa
  contrariaria o pedido explícito ("sem simular progresso falso") — o
  `Spinner` já existente cobre o estado "a enviar…".
- Nenhuma dependência nova adicionada a `packages/ui/package.json`.

### `apps/frontrest/web/lib/invoice-attachments.ts`

Cliente HTTP para os 4 endpoints da Fase 5.3, seguindo exatamente o
padrão de `lib/invoices.ts` (`API_URL`, `authHeaders`,
`parseJsonOrThrow`). O `POST` usa `FormData` com só `authHeaders()` —
**sem** `Content-Type` manual, para o browser gerar o boundary
`multipart/form-data` automaticamente (exigido explicitamente).

### `apps/frontrest/web/app/(dashboard)/invoices/invoice-attachments-panel.tsx`

Painel de anexos por fatura, em `Sheet` (`@frontcore/ui`) — o mesmo
padrão já em uso em `invoice-form-sheet.tsx`. Reutiliza `ConfirmDialog`
(eliminação), `useFeedback`/`FeedbackBanner` (sucesso/erro transitório)
e `canManage` (`lib/roles.ts`) para decidir visibilidade de
upload/eliminação — a proteção real continua no backend
(`@Roles('MANAGER')`, inalterado). Download não gera um link direto:
chama `getInvoiceAttachment()` para obter um `downloadUrl` assinado
fresco (TTL 300s, Fase 5.2) e abre-o numa nova aba.

### `apps/frontrest/web/app/(dashboard)/invoices/page.tsx`

Alteração mínima: nova coluna de ação "Anexos" (visível a qualquer
utilizador autenticado — só upload/eliminação continuam restritos a
`MANAGER+`, dentro do painel), novo estado `attachmentsFor`, e
montagem do `InvoiceAttachmentsPanel`. A coluna "Ações" deixou de estar
condicionada a `manage` (antes só existia para quem podia
editar/eliminar) — passou a existir sempre, com "Anexos" disponível a
todos e "Editar"/"Eliminar" continuam condicionados a `manage`, tal
como antes. Nenhuma alteração à tabela, paginação, filtros ou a
`InvoiceFormSheet`.

## Ficheiros criados

```
packages/ui/src/components/forms/upload/upload-dropzone.tsx
packages/ui/src/components/forms/upload/upload-dropzone.test.tsx
packages/ui/src/components/forms/upload/upload-button.tsx
packages/ui/src/components/forms/upload/upload-button.test.tsx
packages/ui/src/components/forms/upload/upload-file-list.tsx
packages/ui/src/components/forms/upload/upload-file-list.test.tsx
packages/ui/src/components/forms/upload/upload-error.tsx
packages/ui/src/components/forms/upload/index.ts
apps/frontrest/web/lib/invoice-attachments.ts
apps/frontrest/web/app/(dashboard)/invoices/invoice-attachments-panel.tsx
docs/phases/phase-5.4-upload-frontend-foundation.md
```

## Ficheiros alterados

```
packages/ui/src/components/forms/index.ts   — + export * from './upload'
apps/frontrest/web/app/(dashboard)/invoices/page.tsx   — botão "Anexos", InvoiceAttachmentsPanel
docs/PHASES.md, docs/INDEX.md
```

`apps/frontrest/api` **inalterado** — nenhum ficheiro de backend,
Prisma ou migration tocado nesta fase. `invoice-form-sheet.tsx`,
`confirm-dialog.tsx`, `use-feedback.ts`, `roles.ts` **inalterados** —
reutilizados tal como já existiam.

## Validações e testes

**Automatizados**:
- `pnpm --filter @frontcore/ui typecheck` — limpo.
- `pnpm --filter @frontcore/ui test` — 11 suites, 26 testes (9 novos:
  4 `UploadDropzone` — seleção via input, drop, disabled bloqueia
  seleção, hint; 3 `UploadButton` — label visível, seleção via input,
  estado loading desativa o input; 2 `UploadFileList` — lista vazia,
  item com `meta`/`actions`).
- `pnpm --filter @frontrest/web typecheck` — limpo (exigiu rebuild
  prévio de `@frontcore/ui`, ver "Limitações conhecidas").
- `pnpm --filter @frontrest/web build` — limpo, rota `/invoices`
  compilada sem erros.
- `pnpm typecheck` (raiz) — 18/18 limpo.
- `pnpm build` (raiz) — 11/11 limpo.
- `pnpm test` (raiz) — 10/10 limpo; suites já existentes (Suppliers/
  Expense Categories/Invoices/Invoice Attachments/Uploads, backend)
  sem alteração de resultado.

**Docker** (fase só de frontend — `web` reconstruído, `api` inalterado
e já saudável, conforme a regra de `docs/ai/AI_WORKFLOW.md` para fases
só-frontend):
- `docker compose build web` — limpo; o build estrito do Docker
  (pnpm com isolamento de dependências) não voltou a apanhar nenhuma
  "phantom dependency" como na Fase 5.2.
- `docker compose up -d web` — `frontcore-web` a correr, `api`/
  `postgres`/`redis`/`minio` já saudáveis e inalterados.
- `curl http://localhost:3001/api/health` — `{"status":"ok", ...}`.
- `curl http://localhost:3000/invoices` — `200`, sem erros nos logs do
  container `frontcore-web`.

**Manual, no browser — não realizada nesta sessão.** Ver "Limitações
conhecidas".

**Correção `S3_PUBLIC_ENDPOINT` — validação automatizada e manual real
(2026-07-09):**
- `pnpm --filter @frontcore/storage typecheck`/`test` — limpo; 20
  testes (5 novos: 2 de `loadStorageConfig` para o *fallback*/override
  de `publicEndpoint`, 3 de `S3ObjectStorage` para a construção de um
  ou dois `S3Client` e o uso do `signingClient` correto em
  `getDownloadUrl`).
- `pnpm typecheck`/`build`/`test` (raiz) — 18/11/10, limpos, sem
  regressão nas suites existentes.
- `docker compose build api` + `docker compose up -d api` — limpo;
  `docker exec frontcore-api printenv` confirmou `S3_ENDPOINT=http://minio:9000`
  (inalterado) e `S3_PUBLIC_ENDPOINT=http://localhost:9000` (novo) a
  chegar corretamente ao container.
- **Fluxo real completo, via `curl` a partir do host** (fora da rede
  Docker — o mesmo caminho de rede que o browser usa): registo real,
  fornecedor e fatura reais criados via API, PDF real, `POST` de anexo
  → 201; `GET` do anexo → `downloadUrl` com host `localhost:9000`
  (confirmado por inspeção da string); descarregado o `downloadUrl`
  diretamente a partir do host → `200`, conteúdo binário idêntico ao
  ficheiro original (`diff` sem diferenças) — confirma que a
  assinatura SigV4 gerada pelo `signingClient` é válida contra o
  MinIO real; `DELETE` do anexo → `200`; `GET` seguinte → `404`,
  confirmando eliminação real (BD + MinIO).
- Dados de teste desta validação eliminados via a própria API
  (`DELETE`); a organização de registo usada fica na BD, mesmo
  critério de risco já aceite nas validações reais das Fases 5.2/5.3.

## Correção pós-validação (2026-07-09) — `S3_PUBLIC_ENDPOINT`

Durante a validação manual desta fase, o único problema funcional
encontrado: upload, listagem e eliminação de anexos funcionavam, mas o
`downloadUrl` devolvia `http://minio:9000/...` — hostname interno da
rede Docker, não resolúvel pelo browser do host
(`ERR_NAME_NOT_RESOLVED`).

**Causa raiz.** `S3ObjectStorage` (Fase 5.1) usava o mesmo `S3Client`,
construído com o `endpoint` **operacional** (`S3_ENDPOINT`, usado para
`put`/`delete` reais servidor→storage), também para assinar URLs em
`getDownloadUrl()`. A assinatura SigV4 embute o endpoint do cliente que
a gera — dentro de Docker Compose isso é sempre `http://minio:9000`,
correto para a API falar com o MinIO, mas nunca resolúvel fora da rede
Docker.

**Solução implementada.** `StorageConfig` (`@frontcore/storage`) ganhou
um segundo campo, `publicEndpoint`, lido de uma variável de ambiente
própria (`S3_PUBLIC_ENDPOINT`, com *fallback* para `S3_ENDPOINT`
quando não definida — preserva o comportamento anterior em qualquer
ambiente que ainda não a configure). `S3ObjectStorage` passou a manter
dois `S3Client`: `client` (endpoint interno, para `put`/`delete`) e
`signingClient` (endpoint público, só para `getDownloadUrl`) — os dois
coincidem, e reutilizam a mesma instância, sempre que
`publicEndpoint === endpoint`. Construir um `S3Client` não estabelece
nenhuma ligação de rede por si só (a assinatura SigV4 é computada
localmente), por isso não há custo real na segunda instância.

**Porque não `replace()` de string.** Substituir `minio:9000` por
`localhost:9000` no URL já assinado invalidaria a assinatura — o host
faz parte do que é assinado (`X-Amz-SignedHeaders=host`). A única forma
correta de mudar o host de um URL pré-assinado é assiná-lo desde o
início com o cliente configurado para esse host, daí os dois `S3Client`
em vez de uma manipulação de string sobre o resultado.

**Configuração** (`docker-compose.yml`, `.env`, `.env.example`):
`S3_ENDPOINT` mantém-se `http://minio:9000` (hardcoded no serviço
`api`, inalterado); `S3_PUBLIC_ENDPOINT` é nova, lida de `.env`, hoje
`http://localhost:9000` — a porta do MinIO já publicada no host desde
a Fase 1 (`docker-compose.yml`, serviço `minio`). Em produção, aponta
para o domínio público real do storage (ver `docs/DEPLOY-COOLIFY.md`
quando essa configuração existir) — nenhum valor hardcoded no código,
só o *fallback* já descrito.

**Ficheiros alterados por esta correção:**

```
packages/storage/src/contracts/object-storage.ts       — + publicEndpoint em StorageConfig
packages/storage/src/config/storage-config.ts           — lê S3_PUBLIC_ENDPOINT com fallback para S3_ENDPOINT
packages/storage/src/providers/s3/build-s3-client-config.ts   — endpoint agora parametrizável
packages/storage/src/providers/s3/s3-object-storage.ts  — segundo S3Client (signingClient) só para getDownloadUrl
packages/storage/src/config/storage-config.test.ts       — 2 testes novos (fallback e override de publicEndpoint)
packages/storage/src/providers/s3/s3-object-storage.test.ts   — 3 testes novos (1 ou 2 S3Client construídos, signingClient usado na assinatura)
docker-compose.yml   — + S3_PUBLIC_ENDPOINT no serviço api
.env, .env.example    — + S3_PUBLIC_ENDPOINT=http://localhost:9000
docs/phases/phase-5.1-upload-storage-foundation.md   — nota de atualização (não reescreve conteúdo histórico)
```

Nenhuma alteração a `apps/frontrest/api` nem a `apps/frontrest/web` —
a correção ficou inteiramente contida em `@frontcore/storage` e
configuração de ambiente, exatamente onde o problema tinha origem.

## Limitações conhecidas

- **Validação manual interativa no browser continua sem ser
  executada** — este ambiente de execução não tem acesso a um browser
  interativo/automatizado. A correção do `S3_PUBLIC_ENDPOINT` foi
  validada de forma real, mas via `curl` a partir do host (fora da
  rede Docker, o mesmo caminho de rede que um browser usaria) — não
  via clique numa interface real. Fluxos puramente de interação (abrir
  o painel, arrastar um ficheiro, gate visual de `MANAGER+`)
  continuam por verificar visualmente.
- **`@frontcore/ui` precisa de `pnpm build` antes de `@frontrest/web`
  resolver os novos exports isoladamente** — comportamento pré-existente
  do monorepo (ver secção de validações), não uma regressão desta fase.
- **Um ficheiro por upload** — `UploadDropzone` aceita um ficheiro de
  cada vez, espelhando a API (`POST` aceita um `file`). Upload múltiplo
  simultâneo fica para uma fase futura, se pedido.

## Trabalho fora do âmbito (fases futuras)

`getUploadUrl()`, upload direto do browser, OCR, preview avançado de
PDF/imagem, galeria, crop/compressão, gestão documental global,
drag-and-drop com biblioteca externa, `components/upload/` como
categoria própria (só reconsiderar perante um concern técnico novo).

## Resultado final

`apps/frontrest/web` consegue anexar, listar, descarregar e eliminar
documentos de uma fatura através da Upload API já existente (Fase
5.3), com componentes de captura/apresentação de ficheiro genéricos e
reutilizáveis em `@frontcore/ui` — zero conhecimento de domínio ou de
Next.js nesses componentes — e zero alteração a `apps/frontrest/api`
ou ao schema Prisma.

## Critérios de conclusão

- [x] Componentes genéricos de upload existem em `@frontcore/ui`.
- [x] Frontend FrontRest consegue anexar ficheiros a faturas.
- [x] Listagem/download/delete de anexos implementados.
- [x] CRUD atual de faturas não foi quebrado (tabela/paginação/filtros/
      `InvoiceFormSheet` inalterados; validado por `build` + tipos).
- [x] Documentação atualizada (`docs/phases/`, `docs/PHASES.md`,
      `docs/INDEX.md`).
- [x] `pnpm typecheck`/`build`/`test` limpos (raiz e por package).
- [x] `downloadUrl` resolúvel fora da rede Docker — corrigido via
      `S3_PUBLIC_ENDPOINT`, validado com download real a partir do
      host (ver "Correção pós-validação").
- [ ] Validação manual **interativa no browser** — **não realizada**
      (ver "Limitações conhecidas"); a correção do endpoint público foi
      validada de forma real (via `curl`), mas não por clique numa
      interface; pendente antes do fecho definitivo.
- [x] Git limpo — aguarda commit/tag/push pelo utilizador.

## Próxima fase

Validação manual interativa no browser (login real, upload/listagem/
download/eliminação por clique, gate visual de `MANAGER+`, isolamento
por organização) antes de considerar Fase 5.4 definitivamente fechada
— o download já foi validado de forma real via `curl`, falta só a
confirmação por interação direta na interface. Depois disso,
candidatos naturais: limpeza de `StorageObject` órfãos (Fase 5.3), ou
avançar para a Fase 6 (Worker OCR).
