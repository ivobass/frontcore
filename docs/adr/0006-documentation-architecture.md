# ADR-0006: Arquitetura da documentação do FrontCore

- **Estado:** Aceite
- **Data:** 2026-07-05
- **Fase:** transversal — preparação antes do fecho da Fase 3.8

## Contexto

A documentação técnica do FrontCore (`frontcore/docs/`) cresceu de forma
orgânica ao longo das Fases 3.1–3.7: documentos de governação de IA,
ADRs, documentação de fase, guias e processo foram todos adicionados à
raiz de `docs/` à medida que surgiam. Isto produziu duplicações e
responsabilidades sobrepostas — regras de Git repetidas entre
`AI_WORKFLOW.md` e `GIT_WORKFLOW.md`, uma segunda lista de "ordem de
leitura" em `DEVELOPER_GUIDE.md` a divergir da de `INDEX.md`, uma segunda
divisão de papéis de IA a divergir da tabela de `AI_GOVERNANCE.md` — sem
uma regra explícita sobre quando criar uma subpasta nova.

Ao mesmo tempo, cresceu a necessidade de dois blocos de documentação
novos e coesos: governação/processo de IA (vários documentos, cada vez
mais) e standards de qualidade do Design System (Fase 3.8) — nenhum dos
dois cabe bem como ficheiros soltos na raiz de `docs/`.

## Decisão

**Source of Truth única.** Toda a documentação necessária para analisar,
planear, implementar, testar, rever ou manter código deve existir
obrigatoriamente dentro de `frontcore/docs/` e fazer parte do
repositório Git. Não existe uma segunda fonte técnica válida.

**`FrontCore/docs/` passa a ser exclusivamente documentação estratégica**
— visão, negócio, ideias, estudos, pesquisas, brainstorming, roadmap
estratégico. Não deve conter documentação necessária para implementar ou
manter código; quando isso acontecer (ver "Auditoria", abaixo), o
conteúdo técnico nasce em `frontcore/docs/`, nunca do outro lado.

**Estrutura de `frontcore/docs/`:**

```
docs/
├── INDEX.md                — ponto de entrada único (mantém-se; não se cria docs/README.md)
├── ARCHITECTURE.md, PROJECT_STRUCTURE.md, PHASES.md, CODING_STANDARDS.md,
│   GIT_WORKFLOW.md, RELEASE_PROCESS.md, DEVELOPER_GUIDE.md, DEPLOY-COOLIFY.md
│   — mantêm-se na raiz: cada um é único, sem família de documentos relacionados
├── adr/                    — mantém-se
├── phases/                 — mantém-se
├── ai/                     — nova: governação, workflow, formato de resposta e
│                              formato de prompt de IA, + templates/
└── quality/                — nova: standards de qualidade do Design System
```

**Critério para criar uma subpasta nova em `docs/`:** só quando existirem
3+ documentos genuinamente relacionados (o padrão já provado por `adr/` e
`phases/`) — nunca por antecipação. `docs/architecture/` (para
documentação técnica futura de backend, frontend, database, security,
infrastructure) **não é criada nesta ADR** — só nasce quando a primeira
dessas áreas tiver conteúdo real para documentar.

**`docs/ai/` vs `docs/quality/`:** `docs/ai/` cobre o processo de trabalho
das IAs (workflow, formato de resposta, formato de prompt, revisão de
qualidade específica de IA antes de implementar). `docs/quality/` cobre
standards de qualidade do Design System em si — audiência-agnóstica,
aplica-se a qualquer contribuidor, humano ou IA. `AI_QUALITY_REVIEW.md`
fica em `docs/ai/` porque é um processo de IA, não um standard de
qualidade do produto.

**Regra anti-duplicação:** antes de criar um documento novo, confirmar via
`docs/INDEX.md` que não existe já um equivalente. Sempre que uma
responsabilidade puder viver em mais do que um documento, consolidar num
único, com os outros a apontar para ele — nunca duplicar o conteúdo.

**Princípios permanentes:**

> A documentação deve servir o desenvolvimento, nunca atrasar o
> desenvolvimento.

> Uma IA nunca deve depender da memória do chat para compreender o
> estado do projeto.

Depois desta ADR, a arquitetura documental considera-se estável; só se
reabre perante uma necessidade real e justificada, não por reorganização
especulativa.

## Auditoria `frontcore/docs/` vs `FrontCore/docs/`

Antes de aceitar esta ADR, todos os ~22 ficheiros de
`FrontCore/docs/Architecture/` e o `FrontCore Roadmap.md` foram lidos
integralmente. Conclusão:

- **`FrontCore Roadmap.md`, `FrontCore Vision.md`, `Architecture
  Overview.md`, `Architecture Index.md`** são genuinamente estratégicos
  (missão, portefólio de produtos, roadmap de alto nível) — cumprem a
  definição de documentação estratégica e ficam onde estão.
- **16 ficheiros com nomes de aparência técnica** (`Database.md`,
  `Security.md`, `Infrastructure.md`, `Docker.md`, `Authentication.md`,
  `Storage.md`, `Workers.md`, `Monitoring.md`, `Scaling.md`,
  `Performance.md`, `Backup Strategy.md`, `Disaster Recovery.md`,
  `MultiTenant.md`, `API Design.md`, `AI.md`, `Deploy.md`) **não contêm
  documentação técnica real** — são esboços de tópicos (poucas linhas de
  palavras-chave cada, ex. "JWT. Refresh. Cookies. Roles."), sem decisões,
  diagramas ou conteúdo utilizável para implementar ou manter código. Não
  violam a regra de Source of Truth porque não há nada de técnico para
  migrar; ficam como placeholders de brainstorming até serem
  substituídos por documentação real, que nascerá em `frontcore/docs/`
  quando existir.
- **`Coding Standards.md` e `Folder Structure.md`** (dentro de
  `Architecture/`) são esboços igualmente vazios, com nomes quase-
  homónimos aos reais `docs/CODING_STANDARDS.md` e
  `docs/PROJECT_STRUCTURE.md` — não há conteúdo a migrar (os reais já são
  completos), mas o nome duplicado convida a confusão. Fica como
  possível limpeza futura (apagar ou anotar como obsoletos), não
  executada nesta ADR por não ter conteúdo de código versionado.
- **`Decisions Log.md`** é a única exceção com conteúdo real: regista a
  escolha do Prisma como ORM (2026-07-01, antes de existirem ADRs).
  Candidata a tornar-se uma ADR formal (`docs/adr/0007-...`) — não criada
  nesta ADR por ser um tema novo (base de dados), fora do âmbito desta
  decisão sobre arquitetura documental.
- **`Roadmap Technical.md`** é um esboço vazio, redundante com
  `docs/PHASES.md` e superado por `FrontCore Roadmap.md` — sem conteúdo a
  migrar.

Nenhuma migração de ficheiro foi necessária: não existe hoje documentação
técnica real presa do lado errado da fronteira.

## Alternativas consideradas

- **Manter tudo na raiz de `docs/`.** Rejeitada: já produziu duplicações
  reais (Git, ordem de leitura, papéis de IA) e agrava-se com o volume
  crescente de documentação de IA e de qualidade.
- **Criar `docs/architecture/`, `docs/backend/`, `docs/frontend/` já
  agora, vazias, para "estarem prontas".** Rejeitada — contraria a regra
  anti-caos já estabelecida em `PROJECT_STRUCTURE.md` ("não criar
  estrutura só porque parece elegante"); estas pastas nascem quando
  tiverem conteúdo real, não antes.
- **Migrar `FrontCore/docs/Architecture/` para dentro do repositório
  agora.** Adiada — é um trabalho de limpeza maior, à parte, sem urgência
  para desbloquear a Fase 3.8; a regra fica fixada para documentação
  *nova*, a retroativa fica para uma tarefa futura e explícita.
- **Criar `docs/README.md`.** Rejeitada por decisão explícita do Product
  Owner — `INDEX.md` continua a ser o único ponto de entrada oficial.

## Consequências

**Positivas**
- Duas famílias de documentos (IA, qualidade) ganham um lar coeso, sem
  sobrecarregar a raiz de `docs/`.
- Duplicações reais identificadas há várias fases (Git, ordem de leitura,
  papéis de IA) ficam resolvidas nesta mesma alteração.
- Critério explícito para decidir quando criar uma subpasta nova evita
  decisões ad-hoc no futuro.

**Negativas / trade-offs aceites**
- `FrontCore/docs/Architecture/` continua a divergir de `frontcore/docs/`
  para os temas que já cobre — aceite como trabalho futuro, não bloqueia
  esta decisão.
- Mover os documentos `AI_*` exige atualizar todas as referências
  existentes (`INDEX.md`, `DEVELOPER_GUIDE.md`, `PROJECT_STRUCTURE.md`,
  `README.md`) — custo único, pago nesta ADR.
