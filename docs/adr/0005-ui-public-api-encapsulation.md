# ADR-0005: `@frontcore/ui` como única API pública — encapsulamento do Radix UI

- **Estado:** Aceite
- **Data:** 2026-07-03
- **Fase:** 3 (Design System), antes da Fase 3.4

## Contexto

A partir da Fase 3.5, `packages/ui` vai precisar de Radix UI para
implementar componentes interativos com portal, posicionamento e focus-trap
(`Dialog`, `Popover`, `Tooltip`, `DropdownMenu`, `ContextMenu`, `Select`,
`Toast`, `HoverCard`, `NavigationMenu`). Sem uma regra explícita, é fácil
uma app importar `@radix-ui/react-dialog` diretamente para resolver um caso
de borda ainda não coberto pelo wrapper do FrontCore — o que quebraria a
fronteira já estabelecida na ADR-0001 (`packages/ui` como única camada de UI
reutilizável) e tornaria impossível trocar ou atualizar o Radix no futuro
sem migrar todas as apps que o importaram diretamente.

Esta decisão estende a mesma lógica da ADR-0002 (isolar Next.js) a uma
dependência diferente: Radix UI.

## Decisão

`@frontcore/ui` é a **única API pública** de componentes de UI do
FrontCore. Radix UI (e qualquer biblioteca de comportamento equivalente que
venha a substituí-lo) é um **detalhe de implementação interno** de
`packages/ui`, nunca reexportado nem exposto diretamente.

Sempre:
```ts
import { Dialog } from '@frontcore/ui';
```

Nunca:
```ts
import * as Dialog from '@radix-ui/react-dialog';
```

O grafo de dependências é unidirecional:

```
Apps
 ↓
@frontcore/ui
 ↓
Design Tokens
Theme Engine
Tailwind
CVA
Radix UI (quando aplicável)
```

`packages/ui` nunca depende de `apps/*`. Nenhuma app deve declarar
`@radix-ui/*` como dependência direta no seu `package.json` — essas
dependências vivem exclusivamente em `packages/ui/package.json`.

## Alternativas consideradas

- **Permitir que apps importem Radix diretamente para casos não cobertos
  pelo wrapper do FrontCore.** Rejeitada: quebra a fronteira da ADR-0001,
  obriga cada app a conhecer a versão de Radix em uso, e impede trocar de
  biblioteca de comportamento no futuro sem migrar cada produto
  individualmente.
- **Reexportar `@radix-ui/*` na íntegra a partir de `@frontcore/ui`** (ex.
  `export * as RadixDialog from '@radix-ui/react-dialog'`). Rejeitada:
  muda só o caminho do import, não o acoplamento — a app continuaria a
  depender da API e dos tipos do Radix diretamente, em vez de só da API do
  FrontCore.

## Consequências

**Positivas**
- O FrontCore pode trocar Radix por outra biblioteca de comportamento (ou
  remover Radix nalgum componente específico) sem quebrar nenhuma app — só
  a implementação interna muda, a API pública mantém-se.
- Apps só precisam de conhecer a API de `@frontcore/ui`, reduzindo a
  superfície de conhecimento necessária para construir um novo produto.
- Consistente com a fronteira já estabelecida na ADR-0001 e com o
  princípio de isolamento de dependências de terceiros da ADR-0002.

**Negativas / trade-offs aceites**
- Cada padrão de composição do Radix (ex. `asChild`, slots específicos) tem
  de ser modelado explicitamente na API do FrontCore antes de poder ser
  usado — não há atalho de "reexportar tudo" para casos de borda não
  previstos.
- Uma necessidade muito específica de um único produto, que dependa de uma
  funcionalidade do Radix ainda não coberta por `@frontcore/ui`, exige
  primeiro estender o wrapper do FrontCore — não pode contornar importando
  Radix diretamente.
