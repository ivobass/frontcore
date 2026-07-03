# ADR-0003: Estrutura interna de `packages/ui/src` e categorização de componentes

- **Estado:** Aceite
- **Data:** 2026-07-03
- **Fase:** 3 (Design System), antes da Fase 3.3

## Contexto

`packages/ui` já tem os tokens (Fase 3.1, `tokens/`) e o Theme Engine (Fase
3.2, `theme/`). A camada de componentes está prestes a começar (Fase 3.3+)
e precisa de uma estrutura que aguente escalar para dezenas ou centenas de
componentes ao longo de vários anos e vários produtos, sem se tornar uma
pasta `components/` plana e ingerível.

## Decisão

Estrutura de `packages/ui/src/`:

```
packages/ui/src/
├── components/
│   ├── primitives/     # átomos: 1 elemento, sem subcomponentes
│   ├── forms/           # composição de formulário
│   ├── feedback/         # estado/informação, sem portal
│   ├── overlay/           # portal + posicionamento (Radix)
│   ├── navigation/         # navegação genérica, data-driven
│   ├── data-display/       # apresentação de conteúdo/dados
│   ├── layout/               # wrappers de conteúdo (qualquer página)
│   ├── shell/                 # chrome de app autenticada
│   └── index.ts                # agrega as 8 categorias
├── hooks/                # hooks React reutilizáveis (ex.: useMediaQuery)
├── lib/                   # cola de baixo nível (ex.: cn.ts)
├── styles/                 # CSS distribuído + preset Tailwind (ver ADR-0004)
├── theme/                   # Theme Provider (Fase 3.2, inalterado)
├── tokens/                   # Design tokens (Fase 3.1, inalterado)
├── icons/                      # reexport curado de lucide-react
├── types/                       # tipos partilhados entre categorias
├── utils/                        # funções puras, sem estado, sem React
└── index.ts                       # barrel raiz
```

### Categorias de `components/` — porquê 8 e não as 6 inicialmente sugeridas

Além de `primitives, forms, feedback, navigation, data-display, layout`,
duas categorias adicionais separam preocupações técnicas distintas:

- **`overlay`** (não misturado com `feedback`): `Dialog`, `Sheet`,
  `DropdownMenu`, `Popover`, `Tooltip` partilham uma preocupação técnica —
  portal, z-index, posicionamento, focus trap. `Alert`/`Progress` são
  passivos, sem portal. Um componente novo de overlay sabe imediatamente
  onde procurar convenções.
- **`shell`** (não `app-shell`, por concisão — mesmo significado: chrome de
  app autenticada, não conteúdo genérico de página): `Sidebar`, `Topbar`,
  `PageHeader` assumem um contexto de app autenticada. `Page`, `Container`,
  `Section` (em `layout/`) assumem-se em qualquer contexto, incluindo uma
  eventual página pública. Separar as duas evita que uma landing page
  pública de um produto futuro tenha de importar `shell/` sem precisar.

### Regra de dependência entre categorias

`primitives/` é o chão: nenhuma outra categoria importa Radix ou HTML cru
diretamente, sem passar por `primitives/`. `forms/`, `overlay/`,
`navigation/`, `data-display/` compõem a partir de `primitives/`. `layout/`
e `shell/` compõem a partir de todas as anteriores. `shell/` pode depender
de `layout/`, `navigation/`, `overlay/`, `data-display/` e `primitives/`;
`layout/` nunca depende de `shell/` (evita dependência circular de
categoria).

### Ficheiros de topo (`hooks/`, `lib/`, `types/`, `utils/`)

Separados por natureza, não agrupados num genérico `utils/`:

- **`lib/`** — cola de baixo nível específica deste package (ex.: `cn.ts`,
  hoje na raiz, muda para aqui).
- **`utils/`** — funções puras, sem React, sem estado (ex.: formatação,
  cálculos), reutilizáveis por qualquer categoria de componente.
- **`hooks/`** — hooks React reutilizáveis entre componentes (ex.: um
  futuro `useMediaQuery` para o comportamento responsivo da `Sidebar`).
- **`types/`** — tipos partilhados entre categorias (ex.: `NavItem`,
  `LinkRenderProps` do padrão `renderLink` da ADR-0002), evitando que cada
  categoria redefina os mesmos tipos.

### Nomenclatura de componentes individuais

- Um ficheiro `kebab-case.tsx` por componente, `named export` (não
  `default export`) — preparação de baixo custo para o Storybook, mesmo sem
  o instalar ainda.
- `Header` (conforme listado inicialmente) passa a chamar-se **`PageHeader`**
  para não colidir conceptualmente com `Topbar` — "Header" era ambíguo
  entre "cabeçalho persistente da app" (isso é o `Topbar`) e "cabeçalho de
  conteúdo de página" (título + descrição + ações).

## Alternativas consideradas

- **Pasta `components/` plana.** Rejeitada à escala projetada (dezenas a
  centenas de componentes) — impossível de navegar, sem fronteira clara de
  responsabilidade.
- **Uma subpasta por componente** (`components/button/{button.tsx,
  button.stories.tsx, button.test.tsx}`). Adiada: ficheiros `kebab-case.tsx`
  planos por categoria escolhidos agora pela simplicidade; a co-localização
  por componente pode ser introduzida mais tarde (quando o Storybook ou
  testes por componente forem de facto adicionados) sem quebrar imports,
  porque os consumidores importam sempre através do `index.ts` da
  categoria, nunca do caminho do ficheiro.

## Consequências

**Positivas**
- Fronteira de responsabilidade clara por categoria — qualquer developer
  sabe onde procurar e onde adicionar.
- `lib/`, `utils/`, `hooks/`, `types/` evitam que cola de baixo nível,
  funções puras, hooks e tipos se acumulem misturados num único ficheiro
  ou pasta genérica.

**Negativas / trade-offs aceites**
- Mais cerimónia nos primeiros componentes (vários `index.ts` de barrel a
  manter) — aceite dado o crescimento projetado.
