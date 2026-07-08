# Phase 4.2 — Frontend CRUD

## Objetivo

Fechar o módulo funcional de Gestão de Despesas do FrontRest no frontend:
CRUD completo (criar/editar/eliminar) para `Supplier`, `ExpenseCategory` e
`Invoice`, sobre a API já implementada na Fase 4.1
(`apps/frontrest/api/src/{suppliers,expense-categories,invoices}/`), sem
alterar backend, Prisma, Docker ou autenticação.

## Estado inicial

A Fase 4.1 (commit `60cbea7`) tinha entregue a API completa das 3
entidades, mas o frontend só tinha `/suppliers` em modo leitura (listagem,
sem criação/edição), sem UI de faturas nem categorias de despesa — ver
`docs/PHASES.md`. Existia já, por trabalho não commitado anterior a esta
fase, scaffolding preparado mas não ligado a nenhuma página: helpers
partilhados em `lib/api.ts` (`parseJsonOrThrow`, `authHeaders`,
`authJsonHeaders`, `buildQuery`), `lib/roles.ts` (`canManage`),
`lib/use-feedback.ts` + `components/feedback-banner.tsx` (feedback
transitório, substituto de Toast — não existe Toast no Design System), e
`lib/suppliers.ts` já com `createSupplier`/`updateSupplier`/`deleteSupplier`
implementados mas não consumidos.

## Arquitetura implementada

Reaproveitado o scaffolding acima em vez de reescrito. Adicionados
clientes API para as duas entidades em falta (`lib/expense-categories.ts`,
`lib/invoices.ts`), seguindo o mesmo padrão de `lib/suppliers.ts`
(funções `list`/`get`/`create`/`update`/`delete`, tipos `*Input` para
payloads).

Três páginas de listagem CRUD (`suppliers`, `expense-categories`,
`invoices`) com o mesmo esqueleto: `PageHeader` com ação de criar (só
visível para `canManage(me.role)`), `FeedbackBanner` para
sucesso/erro, tabela nativa (`<table>` com classes Tailwind — sem
componente `Table` no Design System, mesmo padrão já usado antes desta
fase), `EmptyState`, `ConfirmDialog` para eliminação.

Formulários de criação/edição em `Dialog` para `Supplier` e
`ExpenseCategory` (poucos campos), em `Sheet` para `Invoice`
(`InvoiceFormSheet`) — mais espaço vertical para as linhas de fatura
dinâmicas (adicionar/remover, descrição/quantidade/preço unitário), com
`SheetContent` alargado via `className="max-w-xl"` (override suportado
pelo `cn`/`twMerge` do próprio componente, não uma alteração ao Design
System).

Sem `Select` no Design System (previsto na Fase 3.4, nunca implementado)
— os três selects do formulário/filtros de fatura (fornecedor, categoria,
estado) usam `<select>` nativo estilizado para visualmente combinar com
`Input`, com a classe centralizada em
`app/(dashboard)/invoices/constants.ts` (`selectClassName` /
`fullWidthSelectClassName`) — não duplicada entre `invoices/page.tsx` e
`invoice-form-sheet.tsx`.

`components/pagination-controls.tsx` (novo) — controlo de paginação
(Anterior/Seguinte + contagem) partilhado por `suppliers/page.tsx` e
`invoices/page.tsx`, para não duplicar o mesmo bloco JSX nas duas
listagens paginadas. `components/confirm-dialog.tsx` (novo) — diálogo de
confirmação genérico, partilhado pela eliminação nas 3 entidades.

Ações de escrita (criar/editar/eliminar) escondidas na UI quando
`!canManage(me.role)` — proteção de UX; a proteção real continua a ser
`@Roles('MANAGER')` no backend (Fase 4.1, inalterada).

## Ficheiros criados

```
apps/frontrest/web/lib/expense-categories.ts
apps/frontrest/web/lib/invoices.ts
apps/frontrest/web/components/confirm-dialog.tsx
apps/frontrest/web/components/pagination-controls.tsx
apps/frontrest/web/app/(dashboard)/suppliers/supplier-form-dialog.tsx
apps/frontrest/web/app/(dashboard)/expense-categories/page.tsx
apps/frontrest/web/app/(dashboard)/expense-categories/category-form-dialog.tsx
apps/frontrest/web/app/(dashboard)/invoices/page.tsx
apps/frontrest/web/app/(dashboard)/invoices/invoice-form-sheet.tsx
apps/frontrest/web/app/(dashboard)/invoices/constants.ts
```

Reaproveitados sem alteração nesta fase (já existiam no working tree,
trabalho anterior não commitado):

```
apps/frontrest/web/components/feedback-banner.tsx
apps/frontrest/web/lib/roles.ts
apps/frontrest/web/lib/use-feedback.ts
```

## Ficheiros alterados

```
apps/frontrest/web/app/(dashboard)/suppliers/page.tsx   — de leitura para CRUD completo
apps/frontrest/web/lib/suppliers.ts                      — dedup de `Paginated<T>` (reimportado de lib/api.ts)
apps/frontrest/web/lib/api.ts                             — `buildQuery` generalizado (<T extends object>)
apps/frontrest/web/lib/auth.ts                            — reaproveita `parseJsonOrThrow`/`authHeaders` de lib/api.ts
apps/frontrest/web/lib/nav-config.ts                      — entradas "Categorias de Despesa" e "Faturas"
```

## Dependências introduzidas

Nenhuma. Só componentes já existentes de `@frontcore/ui`
(`Dialog`, `Sheet`, `FormField`, `FieldLabel`, `FieldError`, `Input`,
`Textarea`, `Badge`, `Button`, `PageHeader`, `EmptyState`, `Spinner`).

## Decisões arquiteturais

- Nenhum componente novo em `packages/ui` — inclui não implementar
  `Select` (previsto mas nunca construído na Fase 3.4); `<select>` nativo
  estilizado usado em seu lugar, âmbito desta fase é só
  `apps/frontrest`.
- Duplicação de `STATUS_LABELS`/classe de `<select>` entre listagem e
  formulário de faturas resolvida com um ficheiro `constants.ts` local ao
  módulo, não com um novo componente de Design System.
- Duplicação do bloco de paginação entre `suppliers` e `invoices`
  resolvida com `components/pagination-controls.tsx` — componente de
  aplicação (`apps/frontrest`), não de Design System, mesmo padrão já
  usado por `confirm-dialog.tsx`.
- Seletor de fornecedor/categoria carrega até 100 registos
  (`MAX_PAGE_SIZE` de `packages/shared`) — limitação conhecida, não
  corrigida por exigir alteração à API, fora do âmbito aprovado
  (frontend-only).
- Nenhuma alteração a `apps/frontrest/api`, `packages/database`,
  `docker-compose.yml`, ou autenticação.

## ADRs respeitadas

- **ADR-0001/ADR-0002** — nenhum componente de domínio adicionado a
  `packages/ui`; toda a lógica de Fornecedores/Despesas fica em
  `apps/frontrest`.
- **ADR-0005** — `Dialog`/`Sheet` consumidos só através da API pública de
  `@frontcore/ui`, sem importar Radix diretamente.

## Validações efetuadas

- `pnpm typecheck` — monorepo limpo (17/17).
- `pnpm build` — monorepo limpo (11/11); rotas `/suppliers`,
  `/expense-categories`, `/invoices` geradas.
- `tsc --noUnusedLocals --noUnusedParameters` sobre `apps/frontrest/web`
  — limpo.
- Validação Docker (regra da secção "Validação Docker para fases
  full-stack" do `AI_WORKFLOW.md` v1.4, aplicada por precaução apesar de
  a fase ser frontend-only, porque o container `api` em execução estava
  47h desatualizado, de antes da própria Fase 4.1 ter sido implantada):
  `docker compose build api web` + `docker compose up -d api web`;
  `docker ps` saudável e `curl http://localhost:3001/api/health` OK —
  confirmado pelo utilizador. Smoke test em browser (login +
  navegação a `/suppliers`) executado antes do rebuild da API, com a API
  desatualizada a devolver `404 Cannot GET /api/suppliers` — o que
  motivou o rebuild; smoke test completo das 3 páginas contra a API
  atualizada ainda não repetido.

## Resultado final

Módulo de Gestão de Despesas fechado ponta-a-ponta: as 3 entidades têm
CRUD completo tanto na API (Fase 4.1) como na UI (esta fase), pesquisa e
paginação em Fornecedores e Faturas, filtros por estado/fornecedor em
Faturas, e proteção de UX consistente com o RBAC do backend.

## Critérios de conclusão

- [x] CRUD completo (criar/editar/eliminar) para Suppliers na UI.
- [x] CRUD completo para Expense Categories na UI (rota nova).
- [x] CRUD completo para Invoices na UI, incluindo linhas dinâmicas
      (rota nova).
- [x] Nenhum componente novo em `packages/ui`.
- [x] Nenhuma alteração a API, Prisma, Docker ou autenticação.
- [x] Duplicação identificada em revisão (labels/classe de select,
      bloco de paginação) eliminada.
- [x] `nav-config.ts` atualizado com as rotas novas.
- [x] Typecheck e build do monorepo limpos.
- [x] Validação Docker (`api`+`web`) executada.

## Próxima fase

Fase 4.3 (não iniciada, fora do âmbito desta fase) — a definir; possíveis
candidatos: testes automatizados para os módulos de backend
(`suppliers`/`expense-categories`/`invoices` não têm `*.spec.ts`), ou
avanço para a Fase 5 (Upload & MinIO) do `docs/PHASES.md`.
