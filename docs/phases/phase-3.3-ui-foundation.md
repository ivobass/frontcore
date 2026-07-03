# Phase 3.3 — UI Foundation

## Objetivo

Preparar a estrutura interna definitiva de `packages/ui` antes de existir
qualquer componente visual, conforme decidido nas ADRs 0001–0004
(`docs/adr/`): categorias de pastas, utilitário `cn()` movido para `lib/`,
barrels de cada categoria, e `class-variance-authority` disponível como
dependência para as variantes de componente das fases seguintes. Sem
criar nenhum componente visual.

## Estado inicial

`packages/ui/src/` continha apenas:

```
packages/ui/src/
├── cn.ts
├── index.ts
├── theme/
├── tokens/
└── tokens.ts
```

Sem `components/`, `hooks/`, `lib/`, `styles/`, `types/` ou `utils/`.
`src/index.ts` exportava `'./cn'`, `'./tokens'` e `'./theme'`.
`class-variance-authority` não era uma dependência do package.

## Alterações realizadas

- **Estrutura criada:** `components/`, `hooks/`, `lib/`, `styles/`,
  `types/`, `utils/` dentro de `packages/ui/src/`.
- **Organização de pastas:** cada categoria fica pronta para receber
  conteúdo nas subfases seguintes (3.4 em diante), sem antecipar nenhum
  componente.
- **Movimentação de `cn()` para `lib/`:** `src/cn.ts` → `src/lib/cn.ts`,
  sem alteração ao código do utilitário.
- **Barrel exports:** um `index.ts` criado em cada pasta nova
  (`components`, `hooks`, `styles`, `types`, `utils` exportam `{}` — vazios
  de propósito; `lib` reexporta `cn`).
- **Atualização de `src/index.ts`:** `export * from './cn'` substituído por
  `export * from './lib'`; `tokens` e `theme` mantidos sem alteração.
- **Introdução de `class-variance-authority`:** adicionada às
  `dependencies` de `packages/ui/package.json` (`^0.7.1`), instalada via
  `pnpm install`.

## Estrutura final

```
packages/ui/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── components/
    │   └── index.ts
    ├── hooks/
    │   └── index.ts
    ├── lib/
    │   ├── cn.ts
    │   └── index.ts
    ├── styles/
    │   └── index.ts
    ├── theme/
    │   ├── index.ts
    │   └── theme-provider.tsx
    ├── tokens/
    │   ├── breakpoints.ts
    │   ├── index.ts
    │   ├── palette.ts
    │   ├── radius.ts
    │   ├── semantic.ts
    │   ├── shadows.ts
    │   ├── spacing.ts
    │   ├── typography.ts
    │   └── z-index.ts
    ├── tokens.ts
    ├── types/
    │   └── index.ts
    └── utils/
        └── index.ts
```

## Dependências

`packages/ui/package.json` — `dependencies`:

| Pacote | Versão | Desde |
|---|---|---|
| `class-variance-authority` | `^0.7.1` | Fase 3.3 (novo) |
| `clsx` | `^2.1.1` | Fase 3.1 |
| `next-themes` | `^0.4.4` | Fase 3.2 |
| `tailwind-merge` | `^2.5.4` | Fase 3.1 |

`peerDependencies`: `react >=18`, `react-dom >=18` (inalterado).

## Validações executadas

- `pnpm install` (raiz do monorepo) — instala `class-variance-authority` e
  atualiza `pnpm-lock.yaml`.
- Typecheck isolado de `packages/ui` (`tsc -p tsconfig.json --noEmit`).
- Typecheck completo do monorepo (`pnpm typecheck`, via Turborepo).
- Confirmação de que `apps/frontrest` não foi alterado
  (`git status --porcelain -- apps/frontrest`).

## Resultado

- Instalação concluída sem erros (1 pacote adicionado).
- Typecheck isolado de `packages/ui`: sem erros.
- Typecheck completo do monorepo: `17 successful, 17 total` — todos os
  packages e apps (incluindo `@frontrest/api` e `@frontrest/web`) continuam
  a compilar.
- `apps/frontrest`: zero alterações confirmadas.

## Critérios de conclusão

- [x] Estrutura de pastas (`components`, `hooks`, `lib`, `styles`, `types`,
      `utils`) criada dentro de `packages/ui/src/`.
- [x] `cn()` movido para `lib/`, sem alteração de comportamento.
- [x] Barrel `index.ts` presente em cada pasta nova.
- [x] `src/index.ts` atualizado para exportar `lib`, `tokens` e `theme`.
- [x] `class-variance-authority` adicionada e instalada.
- [x] Nenhum componente visual criado.
- [x] `apps/frontrest` sem alterações.
- [x] Typecheck do monorepo completo sem erros.

## Próxima fase

**Phase 3.4 — UI Primitives**
