# Quality Checklist

Version: 1.0

## Objetivo

Checklist condensado a percorrer antes de considerar um componente de
`packages/ui` pronto. Referencia, não repete,
`docs/quality/component-guidelines.md` e `docs/quality/accessibility.md`.

## Checklist

- [ ] Segue `docs/quality/component-guidelines.md` (API, categoria,
      encapsulamento Radix quando aplicável).
- [ ] Segue `docs/quality/accessibility.md` (semântica, teclado, foco,
      `aria-*`, responsive).
- [ ] Usa Design Tokens semânticos, não valores Tailwind crus.
- [ ] Barrel exports atualizados em todos os níveis.
- [ ] Nenhuma duplicação desnecessária face a componentes já existentes.
- [ ] Testes aplicáveis (quando o componente tem lógica/estado
      relevante).
- [ ] `pnpm typecheck` e `pnpm build` sem erros.
- [ ] Documentação relevante atualizada.

Ver `docs/quality/component-definition-of-done.md` para a versão
completa, com contexto de cada critério.
