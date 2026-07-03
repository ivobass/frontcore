# ADR-0002: `packages/ui` agnóstico de framework — sem dependência direta de Next.js

- **Estado:** Aceite
- **Data:** 2026-07-03
- **Fase:** 3 (Design System), antes da Fase 3.3

## Contexto

Todos os produtos atuais e planeados do FrontCore usam Next.js. Isso torna
tentador importar `next/link`, `next/image`, `next/navigation` (`useRouter`,
`usePathname`) diretamente dentro de componentes partilhados que
naturalmente lidam com navegação — `Sidebar`, `Navigation`, `Breadcrumb`,
`Tabs` (quando usados como links).

Decidido em ADR-0001 que estes componentes vivem em `packages/ui`. Se
importassem `next/link` diretamente, `packages/ui` passaria a depender de
Next.js — o que contraria a mesma lógica de "zero acoplamento desnecessário"
usada para justificar a fronteira de domínio, agora estendida a fronteira de
**framework**.

## Decisão

`packages/ui` **não tem `next` como dependência** (nem `dependency` nem
`peerDependency`) e **não importa** `next/link`, `next/image`,
`next/navigation` ou `useRouter` em nenhum componente.

Componentes que precisam de renderizar links (ex.: itens de `Sidebar`,
`Breadcrumb`, `Tabs`-como-links) usam um destes dois padrões de composição:

1. **Prop `renderLink`** — uma função fornecida pela app consumidora,
   `(props: { href: string; children: ReactNode }) => ReactNode`, que a app
   implementa uma única vez (envolvendo `next/link`) e passa para baixo via
   contexto ou prop direta.
2. **`asChild`** (padrão Radix) — o componente renderiza como `Slot` e a app
   consumidora fornece o seu próprio elemento `<Link>` como filho.

Sem `renderLink`/`asChild` fornecido, o componente usa `<a href>` simples
como fallback — continua a funcionar isoladamente (testes, Storybook futuro,
qualquer outro framework) sem depender de um router específico.

## Alternativas consideradas

- **Adicionar `next` como `peerDependency` e importar `next/link`
  diretamente.** Rejeitada: acopla todos os consumidores especificamente ao
  Next.js App Router, impede testar/renderizar componentes isoladamente sem
  mockar um router, e obriga a manter a versão do Next.js sincronizada em
  todos os produtos.
- **API só com `href`, sem possibilidade de customizar o link.** Rejeitada:
  obrigaria a navegação a fazer sempre reload completo da página, perdendo
  prefetch e navegação client-side do Next.js.

## Consequências

**Positivas**
- Componentes de `packages/ui` renderizam corretamente fora de um contexto
  Next.js (testes, Storybook futuro).
- Um eventual produto futuro fora de Next.js continuaria a poder reutilizar
  o design system.
- A fronteira "zero lógica de domínio" (ADR-0001) estende-se a "zero lógica
  de framework", mantendo `packages/ui` genuinamente reutilizável.

**Negativas / trade-offs aceites**
- Custo de configuração único por app: cada produto implementa uma vez um
  wrapper de link (ex.: `apps/frontrest/web/components/link.tsx` que
  envolve `next/link`) e fornece-o aos componentes de navegação — pequeno
  custo, pago uma vez por produto, não por componente.
