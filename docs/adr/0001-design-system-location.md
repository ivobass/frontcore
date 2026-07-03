# ADR-0001: Localização dos componentes reutilizáveis — `packages/ui` vs `apps/*`

- **Estado:** Aceite
- **Data:** 2026-07-03
- **Fase:** 3 (Design System), antes da Fase 3.3

## Contexto

O FrontCore existe para ser reutilizado por múltiplos produtos: FrontRest,
FrontClinic, FrontHotel, FrontGym, FrontERP e produtos futuros. Durante o
planeamento da Fase 3 discutiu-se onde deveriam viver componentes de layout
como `Sidebar`, `Topbar`, `PageHeader`, `Page`, `Container`, `Section`,
`Navigation`, `Breadcrumb` e `Tabs` — se em `packages/ui` (partilhado) ou em
`apps/frontrest` (específico do primeiro produto), já que hoje só existe um
produto a consumi-los e "parecem" pertencer à app.

`docs/ARCHITECTURE.md` já estabelece a regra: *"packages/\* = FrontCore. Zero
lógica de domínio."* Faltava aplicar essa regra explicitamente aos
componentes de layout/shell, que são mais fáceis de confundir com "coisas da
app" do que um `Button`.

## Decisão

**Todos os componentes visuais reutilizáveis — incluindo os de shell de
aplicação (`Sidebar`, `Topbar`, `PageHeader`) — vivem em `packages/ui`.**
`apps/frontrest` (e futuras `apps/frontclinic`, `apps/fronthotel`, etc.)
fazem apenas **wiring**: fornecem dados (sessão, organização atual, itens de
navegação, rotas), aplicam permissões e lógica de produto, e compõem os
componentes de `packages/ui` com esses dados.

A distinção que separa "shell" (packages/ui) de "wiring" (apps/\*) não é a
aparência do componente, é se ele **sabe alguma coisa sobre o domínio de
negócio** (restaurantes, faturas, pacientes, reservas, ...). Nenhum dos
componentes de layout listados sabe — todos recebem os dados via props/slots.

## Alternativas consideradas

- **Manter Sidebar/Topbar em `apps/frontrest`, copiar por produto.**
  Rejeitada: garante divergência visual entre produtos e contraria o
  objetivo de reutilização de >90% do código que define a visão do
  FrontCore como base tecnológica partilhada por múltiplos produtos.
- **Só mover para `packages/ui` quando um segundo produto precisar (YAGNI).**
  Rejeitada: ao contrário de funcionalidades de negócio (onde esperar por um
  segundo caso de uso antes de abstrair é saudável), estes componentes têm
  acoplamento a domínio **zero desde o primeiro dia** — não há risco de
  abstração prematura a evitar.

## Consequências

**Positivas**
- Produtos futuros (FrontClinic, FrontHotel, ...) reutilizam Sidebar/Topbar/
  Page sem reescrever nada.
- Consistência visual entre produtos garantida estruturalmente, não por
  convenção ou revisão manual.

**Negativas / trade-offs aceites**
- Exige disciplina: qualquer tentação de hardcodar strings, rotas ou dados
  específicos de produto dentro de `packages/ui` tem de ser redirecionada
  para uma prop.
- Componentes de shell precisam de uma API de composição (props/slots) mais
  cuidada do que um componente de app fechado precisaria — ver ADR-0002.
