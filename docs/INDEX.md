# FrontCore — Índice da Documentação Técnica

# Source of Truth

Este índice representa a documentação técnica oficial existente em
`frontcore/docs/`.

Qualquer IA, programador ou colaborador deve iniciar aqui a navegação
documental.

Toda a documentação referenciada neste índice prevalece sobre memória,
conversas anteriores ou suposições.

Nenhuma IA é considerada fonte de verdade.

A documentação oficial do projeto é a única Source of Truth.

A filosofia completa por trás desta regra, incluindo princípios e
estrutura da equipa, está em `docs/AI_GOVERNANCE.md`.

---

## Âmbito deste índice

Índice oficial de toda a documentação técnica versionada com o código,
dentro de `frontcore/docs/`. **Não indexa** `FrontCore/docs/` (documentação
de produto, visão e negócio, fora do repositório git) — ver a separação
definida em `docs/PROJECT_STRUCTURE.md`.

Antes de criar ou alterar qualquer documento em `frontcore/docs/`,
atualizar este índice.

---

## Ordem de leitura obrigatória

Antes de qualquer tarefa técnica no FrontCore, ler nesta ordem:

1. `docs/INDEX.md` — este ficheiro, ponto de entrada.
2. `docs/AI_GOVERNANCE.md` — princípios, filosofia, Source of Truth.
3. `docs/AI_WORKFLOW.md` — fluxo operacional obrigatório.
4. `docs/AI_RESPONSE_FORMAT.md` — formato de resposta a usar.
5. `docs/ARCHITECTURE.md` — arquitetura geral do FrontCore.
6. `docs/PHASES.md` — fases do produto FrontRest.
7. ADRs relevantes em `docs/adr/` (ver tabela abaixo).
8. Documentação da fase atual em `docs/phases/`, quando existir.
9. Ficheiros de código diretamente relacionados com a tarefa.

Nunca começar pela implementação. Nunca saltar os passos 1–4.

---

## Documentação obrigatória (governação de IA)

| Documento | Localização | Objetivo | Categoria | Estado | Relação com outros documentos |
|---|---|---|---|---|---|
| AI Governance | `docs/AI_GOVERNANCE.md` | Filosofia, princípios, Source of Truth, estrutura da equipa | Workflow | Ativo | Base para `AI_WORKFLOW.md` e `AI_RESPONSE_FORMAT.md` |
| AI Workflow | `docs/AI_WORKFLOW.md` | Fluxo operacional obrigatório para qualquer IA | Workflow | Ativo | Aplica os princípios de `AI_GOVERNANCE.md` |
| AI Response Format | `docs/AI_RESPONSE_FORMAT.md` | Formato normalizado de resposta (Trabalho/Arquitetura/Revisão/Implementação) | Workflow | Ativo | Usado por `AI_WORKFLOW.md` |

---

## Índices

| Documento | Localização | Objetivo | Categoria | Estado | Relação com outros documentos |
|---|---|---|---|---|---|
| Índice da documentação | `docs/INDEX.md` | Este ficheiro — ponto de entrada único para localizar qualquer documento técnico | Índices | Ativo | Cobre todos os documentos deste ficheiro |
| Índice das ADRs | `docs/adr/README.md` | Lista e convenção de numeração das Architecture Decision Records | Índices | Ativo | `docs/adr/0001`–`0005` |
| Índice de fases | `docs/phases/README.md` | Regra de quando criar documentação detalhada por fase | Índices | Ativo | `docs/PHASES.md`, `docs/phases/*` |

## ADRs

| Documento | Localização | Objetivo | Categoria | Estado | Relação com outros documentos |
|---|---|---|---|---|---|
| ADR-0001 | `docs/adr/0001-design-system-location.md` | Componentes reutilizáveis vivem em `packages/ui`, não em `apps/*` | ADRs | Aceite | Base para ADR-0002, ADR-0003, ADR-0005 |
| ADR-0002 | `docs/adr/0002-ui-framework-agnostic.md` | `packages/ui` sem dependência direta de Next.js | ADRs | Aceite | Estende ADR-0001; irmã da ADR-0005 |
| ADR-0003 | `docs/adr/0003-ui-internal-structure.md` | Estrutura interna e categorização de `packages/ui/src` | ADRs | Aceite | Consome ADR-0001; usada por `docs/phases/*` |
| ADR-0004 | `docs/adr/0004-theme-engine-distribution.md` | Distribuição do Theme Engine (CSS vars + preset Tailwind) entre produtos | ADRs | Aceite | Depende dos tokens/theme (Fases 3.1/3.2) |
| ADR-0005 | `docs/adr/0005-ui-public-api-encapsulation.md` | `@frontcore/ui` como única API pública; Radix UI é detalhe interno | ADRs | Aceite | Estende ADR-0002; aplica-se à Fase 3.5 |

## Arquitetura

| Documento | Localização | Objetivo | Categoria | Estado | Relação com outros documentos |
|---|---|---|---|---|---|
| Arquitetura geral | `docs/ARCHITECTURE.md` | Visão e regras de arquitetura do FrontCore e do FrontRest | Arquitetura | Ativo | Base para todas as ADRs |
| Estrutura do projeto | `docs/PROJECT_STRUCTURE.md` | Organização oficial do repositório; separação `FrontCore/docs` vs `frontcore/docs` | Arquitetura | Ativo | Referenciado por `docs/AI_WORKFLOW.md` |

## Workflow (processo, não governação de IA)

| Documento | Localização | Objetivo | Categoria | Estado | Relação com outros documentos |
|---|---|---|---|---|---|
| Git Workflow | `docs/GIT_WORKFLOW.md` | Uso de Git, mensagens de commit, tags | Workflow | Ativo | Usado por `docs/RELEASE_PROCESS.md`; ver também secção "Documentação obrigatória" acima |
| Coding Standards | `docs/CODING_STANDARDS.md` | Regras base para código no FrontCore | Workflow | Ativo | Aplica-se a `packages/*` e `apps/*` |

## Guias

| Documento | Localização | Objetivo | Categoria | Estado | Relação com outros documentos |
|---|---|---|---|---|---|
| Developer Guide | `docs/DEVELOPER_GUIDE.md` | Guia rápido para começar a trabalhar no FrontCore | Guias | Ativo | Aponta para `docs/AI_WORKFLOW.md`, `docs/PROJECT_STRUCTURE.md` |
| Deploy Coolify | `docs/DEPLOY-COOLIFY.md` | Deploy do FrontCore em Coolify | Guias | Ativo | Relacionado com `docker-compose.yml` |

## Fases

| Documento | Localização | Objetivo | Categoria | Estado | Relação com outros documentos |
|---|---|---|---|---|---|
| Fases do produto FrontRest | `docs/PHASES.md` | Plano de fases do produto FrontRest (Fase 1–10) — eixo de numeração distinto do Design System | Fases | Ativo | Não confundir com subfases 3.x nem com `FrontCore Roadmap.md` (plataforma) |
| Fase 3.3 — UI Foundation | `docs/phases/phase-3.3-ui-foundation.md` | Registo de conclusão da Fase 3.3 | Fases | Concluído | ADR-0003; commit `4734e4b`, tag `v0.3.3-ui-foundation` |
| Fase 3.4 — UI Primitives | `docs/phases/phase-3.4-ui-primitives.md` | Registo de conclusão da Fase 3.4 | Fases | Concluído | ADRs 0001–0005; commit/tag por criar |

## Release

| Documento | Localização | Objetivo | Categoria | Estado | Relação com outros documentos |
|---|---|---|---|---|---|
| Release Process | `docs/RELEASE_PROCESS.md` | Como fechar fases, criar pontos estáveis (tags) e preparar continuidade | Release | Ativo | Usa `docs/GIT_WORKFLOW.md`; referencia `docs/adr/`, `docs/phases/` |

## Outros

Nenhum documento nesta categoria por agora.

---

## Notas de fronteira

- `FrontCore/docs/Architecture/Architecture Index.md` (fora deste
  repositório) tenta cumprir um papel semelhante, mas só para
  `FrontCore/docs/` — os dois índices não se sobrepõem e não devem ser
  fundidos (ver `docs/PROJECT_STRUCTURE.md`).
- Documentação desatualizada identificada fora deste repositório (tabela de
  estado em `Architecture Index.md`, e pares quase-homónimos como `Coding
  Standards.md`/`Folder Structure.md`/`Decisions Log.md` vs os equivalentes
  aqui dentro) **não foi corrigida** — está fora do âmbito deste índice, que
  cobre apenas `frontcore/docs/`.
- `docs/DEVELOPER_GUIDE.md` e `docs/RELEASE_PROCESS.md` têm as suas
  próprias listas de leitura/documentação obrigatória, escritas antes deste
  índice existir, e ainda não referenciam `docs/INDEX.md` nem
  `docs/AI_GOVERNANCE.md`/`docs/AI_RESPONSE_FORMAT.md` — risco de
  divergência, sinalizado mas não corrigido aqui (fora do âmbito desta
  tarefa).
