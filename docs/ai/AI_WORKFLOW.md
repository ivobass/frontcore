# FrontCore AI Workflow

Version: 1.7

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

Esperar aprovação explícita antes de implementar.

### 3. Implementação

Implementar apenas o que foi aprovado.

Não adicionar funcionalidades extra.
Não alterar código fora do âmbito.
Não fazer refactors oportunistas.

### 4. Validação

Executar apenas validações necessárias. Checklist canónico — `docs/GIT_WORKFLOW.md`
e `docs/RELEASE_PROCESS.md` apontam para aqui em vez de manterem cópias
próprias, para as três versões não divergirem:

```bash
git status
pnpm install
pnpm typecheck
pnpm build
pnpm test
```

Notas:

- `pnpm test` só corre onde existirem testes (hoje, `packages/ui` — ver
  `docs/quality/quality-gates.md` — e os testes unitários de
  `apps/frontrest/api`, Fase 4.4); não falhar a validação por ausência de
  testes onde nunca existiram. Os testes e2e de `apps/frontrest/api`
  (`pnpm --filter @frontrest/api test:e2e`) não fazem parte do `pnpm test`
  por omissão — ver `docs/phases/phase-4.4-backend-tests.md`.
- `lint` **não é** um gate ativo hoje em nenhuma parte do monorepo (ver
  `docs/quality/quality-gates.md`, "Gates planeados, ainda não ativos") —
  não o correr nem reportar como validação real; quando for ativado,
  atualizar este checklist primeiro.
- Confirmar sempre, independentemente de comandos: comportamento
  inalterado fora do âmbito da tarefa.

#### Validação Docker para fases full-stack

Quando uma fase altera **backend e frontend**, ou quando há dúvida se as
imagens Docker em execução refletem o código atual, a validação manual deve
reconstruir e reiniciar pelo menos os serviços de aplicação afetados:

```bash
docker compose build api web
docker compose up -d api web
docker ps
```

Depois da reconstrução, validar explicitamente:

```bash
curl http://localhost:3001/api/health
```

E testar no browser:

```text
http://localhost:3000
```

Regra operacional:

- se a fase alterou apenas frontend, reconstruir `web` pode ser suficiente;
- se a fase alterou apenas backend, reconstruir `api` pode ser suficiente;
- se a fase alterou backend e frontend, reconstruir sempre `api` e `web`;
- nunca validar uma fase full-stack com `web` novo contra `api` antigo, ou
  com `api` novo contra `web` antigo;
- se aparecerem erros como `Cannot GET /api/...` ou rotas novas não
  existirem em Docker, confirmar primeiro se a imagem do serviço relevante
  foi reconstruída.

Para validação completa de release ou encerramento de fase, preferir:

```bash
docker compose build
docker compose up -d
docker ps
```

Esta regra evita falsos bugs causados por containers desatualizados.

### 5. Encerramento

Apresentar:

- resumo do que mudou
- ficheiros alterados
- validações executadas
- riscos restantes
- próximo passo recomendado

## Definition of Done (DoD)

Uma fase apenas pode ser considerada concluída quando cumprir todos os
critérios seguintes:

- implementação concluída
- arquitetura aprovada
- ADRs respeitadas
- documentação da fase criada
- documentação geral atualizada (`INDEX.md`, `PHASES.md` e restantes
  documentos relevantes)
- roadmap atualizado (quando aplicável)
- typecheck limpo
- build limpa
- testes executados (quando existirem)
- validação Docker executada para os serviços afetados, especialmente
  `api` e `web` em fases full-stack
- revisão arquitetural concluída
- Git limpo após commit
- commit realizado
- tag criada
- push efetuado

Nenhuma fase deverá ser considerada concluída se algum destes pontos
estiver em falta.

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

- **Não** → não aumentar o âmbito da fase atual. Registar a ideia (ex.
  em "Trabalho fora do âmbito" ou "Limitações conhecidas" do documento
  da fase) e continuar a implementação.
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
