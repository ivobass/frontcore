# FrontCore AI Workflow

Version: 1.10

## Objetivo

Este documento define o fluxo **operacional** obrigatório para qualquer
agente de IA que trabalhe no FrontCore.

Aplica-se a ChatGPT, Claude, Codex, Gemini ou qualquer outro assistente
usado para analisar, planear, implementar ou rever código.

## Âmbito deste documento

Este documento é exclusivamente operacional — define o **como** do fluxo
de trabalho com código. Os princípios, a filosofia e a estrutura de
decisão vivem em `docs/ai/AI_GOVERNANCE.md`. O formato das respostas vive
em `docs/ai/AI_RESPONSE_FORMAT.md`. Como escrever prompts vive em
`docs/ai/AI_PROMPT_STANDARD.md`. Como escrever documentação vive em
`docs/ai/AI_DOCUMENTATION.md`. A revisão de qualidade específica de
`packages/ui` vive em `docs/ai/AI_QUALITY_REVIEW.md`.

## Ordem obrigatória de leitura

Antes de propor ou escrever código, a IA deve:

1. Consultar `docs/INDEX.md` — ponto de entrada obrigatório.
2. Identificar, a partir do índice, toda a documentação relevante para a
   tarefa.
3. Ler essa documentação na íntegra, não apenas por título.
4. Confirmar que não existe documentação duplicada ou conflituosa sobre o
   mesmo tema.
5. Só depois, ler os ficheiros de código diretamente relacionados com a
   tarefa.

A lista concreta de leitura mínima vive em `docs/INDEX.md`, secção "Ordem
de leitura obrigatória" — não duplicada aqui, para as duas não
divergirem.

Nunca começar pela implementação.

## Início de fase ou de conversa — Protocolo de Transição de Fase

**Gatilho oficial.** A sequência abaixo, executada pelo utilizador (a IA
nunca a executa sozinha por sua iniciativa — ver "Git", mais abaixo), é
o sinal oficial de que uma fase terminou:

```bash
git commit
git tag <tag-da-fase>
git push origin main
git push origin <tag-da-fase>
```

Assim que esta sequência é confirmada — reportada pelo utilizador, ou
observada diretamente pela IA — esta deve assumir automaticamente que:

- a fase anterior terminou;
- o estado publicado em `origin/main` no GitHub passa a ser a
  referência a sincronizar — qualquer ficheiro já lido nesta conversa
  antes do push pode estar desatualizado, mesmo que pareça inalterado;
- é obrigatório sincronizar com o repositório antes de responder a
  qualquer pedido novo, mesmo dentro da mesma conversa.

Isto não substitui nem compete com o Source of Truth definido em
`docs/ai/AI_GOVERNANCE.md` ("a documentação em `frontcore/docs/`
prevalece sempre") — é o mesmo princípio aplicado no momento exato em
que essa documentação muda de versão: depois do push, a versão
publicada em `origin/main` é a única garantidamente atual.

O mesmo se aplica ao início de uma conversa nova depois de uma fase ter
fechado — não assumir que o estado descrito numa conversa anterior, ou
a memória de qualquer IA, continua válido sem esta sincronização.

**Sincronização obrigatória**, antes de qualquer análise, plano ou
implementação:

1. Confirmar o estado do repositório — `git status`; `git pull origin main`
   (ou equivalente) se a cópia local estiver desatualizada face ao
   remoto. Usar o conector/integração GitHub da ferramenta, quando
   disponível, para o mesmo efeito.
2. Consultar `docs/INDEX.md` — ponto de entrada obrigatório (ver
   "Ordem de leitura obrigatória", acima).
3. Reler a documentação relevante para o pedido atual — nunca reutilizar
   uma versão lida antes do gatilho.
4. Rever a arquitetura e o código diretamente afetados pelo pedido.
5. Só depois responder, propor um plano, ou implementar.

Protocolo agnóstico de ferramenta — aplica-se a qualquer IA (ChatGPT,
Claude, Codex, Gemini, Cursor, ou outra), com ou sem acesso direto a
git/GitHub a partir da própria conversa (ver `docs/ai/AI_GOVERNANCE.md`,
"Boas práticas" e "Escalabilidade futura").

## Continuidade entre fases

O protocolo acima define **quando** sincronizar. Esta secção define o
que permanece verdadeiro entre uma sincronização e a seguinte — para
nenhuma IA voltar a questionar, numa fase nova, algo já decidido numa
fase anterior.

**O que conta como "aprovada".** Uma fase ou decisão só é oficialmente
aprovada quando a aprovação do Product Owner estiver registada num
documento oficial versionado no repositório — por exemplo:
`docs/PHASES.md`; o documento oficial da fase (`docs/phases/phase-X.Y-*.md`);
a secção de encerramento/handoff de uma fase; uma ADR (`docs/adr/`),
quando aplicável; ou outro documento oficial referenciado por
`docs/INDEX.md`. **Uma conversa com ChatGPT, Claude, Codex ou qualquer
outra IA não é, por si só, documentação oficial** — por mais explícita
ou detalhada que tenha sido, nunca se torna Source of Truth só por ter
acontecido; só o registo escrito num destes documentos conta. Uma nota
marcada como "candidata", "proposta", "recomendação" ou "não aprovada"
— onde quer que apareça — nunca constitui, por si só, uma decisão
aprovada.

Regras que decorrem disto:

- Uma fase aprovada e documentada não volta a ser discutida nas fases
  seguintes.
- Uma decisão aprovada e documentada permanece válida até ser
  explicitamente alterada pelo próprio Product Owner — nunca revista
  por iniciativa de uma IA, mesmo que pareça desatualizada (ver
  `docs/ai/AI_GOVERNANCE.md`, "Documentação prevalece sobre memória",
  para o procedimento quando isso acontece).
- Quando uma fase já aprovada pelo Product Owner e já registada num dos
  documentos oficiais acima (ex. numa ADR, ou na secção de encerramento
  de outra fase) ainda não estiver consolidada em `docs/PHASES.md`, essa
  consolidação deve acontecer na primeira atualização documental
  apropriada — a ausência temporária em `docs/PHASES.md` não invalida
  uma aprovação já registada noutro documento oficial, mas também não a
  substitui indefinidamente.
- As IAs não devem reabrir discussões já encerradas.

Uma nota de "candidata, não iniciada, não aprovada" deixada no
documento de fecho de uma fase (secção "Próxima fase",
`docs/ai/templates/phase-closure.md`) **não é** uma decisão fechada —
é só uma sugestão de quem fechou essa fase. Analisar criticamente essa
sugestão, incluindo rejeitá-la ou substituí-la por uma alternativa
diferente, não é "reabrir uma discussão encerrada": é a primeira
aprovação real, que ainda não aconteceu.

## Documentação utilizada (formato obrigatório)

Toda a resposta de análise, plano ou implementação deve declarar
explicitamente quais documentos foram consultados, neste formato:

```
Documentação utilizada

- docs/INDEX.md
- docs/ai/AI_WORKFLOW.md
- docs/ARCHITECTURE.md
- docs/...
- docs/adr/...
- docs/phases/...
```

Este bloco é o conteúdo da secção "Documentação utilizada" do Modo
Trabalho definido em `docs/ai/AI_RESPONSE_FORMAT.md`.

## Fonte da verdade (aplicação operacional)

A filosofia de "documentação como Source of Truth" está definida em
`docs/ai/AI_GOVERNANCE.md`. Operacionalmente, a ordem de prioridade entre
fontes é:

1. ADRs em `docs/adr/`
2. Documentação oficial em `docs/`
3. Código existente no repositório
4. Pedido atual do utilizador
5. Contexto da conversa

Regras adicionais:

- Nunca assumir informação baseada em memória quando existir documentação
  oficial.
- Se existir documentação relevante, esta prevalece sempre sobre memória.

Caso exista conflito entre documentação e código:

1. identificar o conflito;
2. não assumir qual está correta;
3. pedir validação antes de alterar qualquer um dos dois.

Caso exista conflito entre fontes de documentação, a IA deve parar,
explicar o conflito e esperar aprovação.

## Fluxo obrigatório

### 1. Análise

Identificar:

- estado atual
- arquitetura existente
- ficheiros relevantes
- dependências
- riscos
- limites da fase atual

### 2. Planeamento

Apresentar:

- objetivo
- ficheiros a criar, mover ou alterar
- alterações propostas
- impacto esperado
- comandos de validação

Esperar aprovação explícita antes de implementar. Esta exigência é
sobre o **plano/âmbito** da fase — depois de aprovado, as operações não
destrutivas dentro desse âmbito não voltam a precisar de confirmação
individual (lista completa em `docs/ai/AI_BASE_PROMPT.md`, secção 4).

### 3. Implementação

Implementar apenas o que foi aprovado.

Não adicionar funcionalidades extra.
Não alterar código fora do âmbito.
Não fazer refactors oportunistas.

### 4. Validação

Checklist canónico: `docs/ai/AI_RELEASE_CHECKLIST.md` — comandos,
validação Docker e critérios de conclusão, num único documento. Antes
desta versão, esse conteúdo vivia aqui, com `docs/GIT_WORKFLOW.md` e
`docs/RELEASE_PROCESS.md` a apontar para esta secção; os três agora
apontam para `AI_RELEASE_CHECKLIST.md` diretamente, para não haver
quatro versões potencialmente divergentes.

Executar sempre apenas as validações necessárias ao âmbito da tarefa —
confirmar, independentemente de quais comandos correram, que o
comportamento fora do âmbito da tarefa ficou inalterado.

### 5. Encerramento

Apresentar:

- resumo do que mudou
- ficheiros alterados
- validações executadas
- riscos restantes
- próximo passo recomendado

Uma fase só termina quando: implementação concluída; validação
concluída; documentação atualizada; comandos Git preparados (nunca
executados pela IA — ver "Git", abaixo); e o Product Owner encerra a
fase (a sequência `commit`/`tag`/`push`, ver "Protocolo de Transição de
Fase", acima). Critérios completos: secção seguinte. Depois do
encerramento, a fase seguinte começa sempre por `docs/INDEX.md` — nunca
a partir do estado ou da memória desta conversa (ver "Protocolo de
Transição de Fase", acima).

## Definition of Done (DoD)

Critérios completos: `docs/ai/AI_RELEASE_CHECKLIST.md`, secção
"Definition of Done — critérios finais". Nenhuma fase deve ser
considerada concluída se algum desses critérios estiver em falta.

Distinta da Definition of Done por **componente** individual, específica
de `packages/ui` — essa vive em
`docs/quality/component-definition-of-done.md`.

## Âmbito da tarefa

Cada tarefa deve estar limitada ao seu âmbito.

Exemplo para Fase 3.3:

Permitido:

- `packages/ui`
- documentação técnica diretamente relacionada

Não permitido:

- backend
- deploy
- `apps/frontrest`
- alterações de comportamento da aplicação

Caso seja necessária uma alteração fora do âmbito, a IA deve parar e pedir
aprovação.

## Git

A IA não deve executar automaticamente:

- `git add`
- `git commit`
- `git push`
- `git tag`
- merge de pull request

A IA pode sugerir comandos.
O utilizador decide quando executar.

Exceção: só pode alterar diretamente o GitHub quando o utilizador pedir
explicitamente.

## ADRs

Toda decisão arquitetural relevante deve:

- consultar ADRs existentes
- evitar duplicação
- sugerir nova ADR quando a decisão for estrutural
- não contrariar ADRs aprovadas sem autorização

## Documentação

As regras de como escrever e atualizar documentação (incluindo o que
fazer quando uma alteração modifica arquitetura, workflow ou estrutura do
projeto) estão em `docs/ai/AI_DOCUMENTATION.md`, para não se repetirem em
mais do que um sítio.

## Regras proibidas

Nunca:

- alterar arquitetura sem aprovação
- misturar fases
- alterar código não relacionado
- adicionar dependências sem justificar
- esconder riscos
- avançar quando o âmbito não está claro

## Execution Mode — quando interromper

Filosofia completa em `docs/ai/AI_GOVERNANCE.md`, secção "Execution
Mode". Esta secção é a aplicação operacional.

Antes de propor qualquer alteração arquitetural **fora do âmbito já
aprovado da fase atual**, perguntar:

> "Esta alteração é realmente necessária para concluir as próximas 2 ou
> 3 fases?"

- **Não** → não aumentar o âmbito da fase atual. Registar a ideia em
  "Observações para fases futuras" (`docs/ai/AI_BASE_PROMPT.md`,
  secção 16) e continuar a implementação.
- **Sim** → discutir antes de implementar, seguindo o "Fluxo
  obrigatório" normal (Análise → Planeamento → esperar aprovação
  explícita).

Não propor alterações arquiteturais que:

- resolvem problemas hipotéticos, sem consumidor real;
- não serão usadas nas próximas 2-3 fases;
- aumentam o âmbito da fase atual;
- atrasam a entrega do produto.

Só interromper uma implementação já aprovada e em curso quando existir:

- bloqueio técnico imediato;
- necessidade real (não hipotética) de evitar retrabalho nas próximas
  2-3 fases — uma duplicação já identificável, não uma possibilidade;
- duplicação significativa;
- violação da arquitetura já aprovada.

Fora destes casos: implementar e continuar.

Esta secção não altera o "Fluxo obrigatório" nem a exigência de
"esperar aprovação explícita antes de implementar" para o âmbito já
aprovado de uma fase (secção "2. Planeamento", acima) — muda apenas o
que chega a ser levantado como decisão arquitetural nova antes desse
âmbito estar entregue.

## Regra principal

Em caso de dúvida sobre uma decisão dentro do âmbito já aprovado:

1. Identificar a dúvida.
2. Explicar o impacto.
3. Apresentar alternativas.
4. Esperar aprovação.

Nunca assumir uma decisão arquitetural. Para decidir se vale a pena
levantar uma ideia arquitetural **fora** desse âmbito, ver "Execution
Mode — quando interromper", acima.
