# Quality Gates

Version: 1.0

## Objetivo

Processo de validação obrigatório para alterações em `packages/ui`,
usado hoje manualmente e preparado para ser automatizado em CI.

## Gates ativos

- **Typecheck** — `pnpm typecheck` (monorepo) sem erros. Real, enforced.
- **Build** — `pnpm build` (monorepo) sem erros. Real, enforced.
- **Test** — `pnpm --filter @frontcore/ui test` sem falhas, desde a Fase
  3.8. Real, enforced a partir desta fase.

## Gates planeados, ainda não ativos

- **Lint** — não existe nenhum ESLint configurado em nenhuma parte do
  monorepo hoje. O script `lint`/task `turbo run lint` existem mas não
  têm nenhum linter real por trás. Introduzir ESLint é uma decisão ao
  nível do repositório inteiro, não só de `packages/ui` — fica planeada,
  não fingida como ativa.
- **Auditoria de acessibilidade automatizada** (ex. `axe-core`) — hoje a
  verificação é o checklist manual de `docs/quality/accessibility.md`.

## Quando correr

- Antes de qualquer commit que toque `packages/ui`.
- Antes de fechar qualquer fase (ver a Definition of Done de fase em
  `docs/ai/AI_WORKFLOW.md`).

## Comandos

```bash
pnpm typecheck
pnpm build
pnpm --filter @frontcore/ui test
```
