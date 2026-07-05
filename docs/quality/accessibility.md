# Accessibility Guidelines

Version: 1.0

## Objetivo

Critérios de acessibilidade para componentes de `packages/ui`.

## Semântica HTML

- Usar o elemento nativo correto antes de recorrer a `div`/`span` com
  `role` (ex.: `<button>` para ações, `<a>`/`renderLink` para navegação,
  `<label>` para rótulos de campo).
- Um único `h1` por página — `Typography` não impõe hierarquia, quem
  compõe a página é responsável por isso.

## Navegação por teclado

- Todo o elemento interativo tem de ser alcançável por `Tab` e operável
  por `Enter`/`Espaço` (nativo em `<button>`/`<a>`; verificar em
  componentes Radix que o comportamento por omissão não foi alterado).
- Overlays (`Dialog`, `Sheet`, `DropdownMenu`, `Popover`) fecham com `Esc`
  e devolvem o foco ao elemento que os abriu — comportamento nativo do
  Radix, nunca reimplementado.

## Focus management

- `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
  (ou equivalente) em todo o elemento interativo — convenção já usada em
  `Button`/`Input`/`Checkbox`/etc.
- Nunca remover o outline de foco sem fornecer uma alternativa visível.

## `aria-*`

- Preservar os atributos `aria-*` que o Radix já define nos componentes
  encapsulados — não sobrepor nem remover.
- Ícones sem texto visível (ex.: botão de fecho) levam `aria-label` ou
  `<span className="sr-only">`.

## Responsive

- Nenhum componente deve causar overflow horizontal em larguras pequenas
  (testar a partir de ~320px).
- Preferir `flex`/`grid` com `gap` a margens manuais para espaçamento
  responsivo.
