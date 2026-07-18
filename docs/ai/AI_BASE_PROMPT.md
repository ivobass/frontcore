# FrontCore AI Base Prompt

Version: 1.2

## Objetivo

Consolidar num único documento as regras **permanentes** que hoje se
repetem, quase palavra por palavra, em todos os prompts de fase do
FrontCore. Este documento não substitui `docs/ai/AI_GOVERNANCE.md` nem
`docs/ai/AI_WORKFLOW.md` — é a síntese acionável dos dois (mais
`docs/CODING_STANDARDS.md`, `docs/GIT_WORKFLOW.md` e
`docs/ai/AI_DOCUMENTATION.md`), escrita para ser citada ou colada no
início de qualquer prompt de fase, para o prompt em si não ter de
repetir estas regras. Cada secção aponta para o documento que detém a
explicação completa — este documento nunca é a fonte mais profunda de
nenhuma regra, só o ponto de partida rápido.

## Como usar este documento

Um prompt de fase deixa de precisar de explicar workflow, aprovações,
regras de Git ou formato de resposta — basta assumir que o destinatário
(humano ou IA) já segue `docs/ai/AI_BASE_PROMPT.md`. O prompt em si fica
reduzido ao que **muda** de fase para fase: objetivo, contexto,
requisitos, âmbito, critérios de conclusão — exatamente a forma de
`docs/ai/AI_PHASE_TEMPLATE.md`.

Este documento é a leitura rápida obrigatória em qualquer tarefa. Não
substitui a leitura completa de `AI_GOVERNANCE.md` e `AI_WORKFLOW.md` —
essa continua obrigatória da primeira vez que se trabalha no projeto, e
sempre que uma regra aqui pareça insuficiente para decidir o caso em
mãos (nesse caso, o documento completo prevalece sempre sobre este
resumo — ver "Fonte de verdade", abaixo).

## 1. Filosofia

- A documentação em `frontcore/docs/` é a Source of Truth do projeto —
  nunca a memória de uma IA, nunca o histórico de conversas.
- Nenhuma IA (nem nenhum modelo) é fonte de verdade. A autoridade está
  no documento, não em quem o escreveu.
- A arquitetura tem prioridade sobre velocidade de entrega — mas o
  projeto está em **Execution Mode**: 90% do esforço é implementação,
  10% é documentação/arquitetura/refactoring. Não voltar a planear a
  plataforma enquanto o produto ainda não está construído.
- Cada decisão estrutural fica registada, não só implementada.

Fundamentação completa: `docs/ai/AI_GOVERNANCE.md`.

## 2. Fonte de verdade e ordem de leitura

Em caso de conflito entre fontes, esta é a ordem de prioridade:

1. ADRs em `docs/adr/`
2. Documentação oficial em `docs/`
3. Código existente no repositório
4. Pedido atual do utilizador
5. Contexto da conversa

Se existir conflito entre documentação e código, ou entre duas fontes
de documentação: **não assumir qual está correto** — identificar o
conflito, explicá-lo, esperar validação.

Uma fase ou decisão já aprovada pelo Product Owner permanece válida
entre fases — não voltar a questioná-la só porque uma fase nova
começou. Uma nota de "candidata, não aprovada" deixada no fecho de uma
fase não é, por si só, uma aprovação. Fundamentação completa:
`docs/ai/AI_WORKFLOW.md`, secção "Continuidade entre fases".

Ponto de entrada único para localizar qualquer documento:
`docs/INDEX.md`. Ordem de leitura completa: `docs/ai/README.md`.

## 3. Fluxo obrigatório

```text
Análise → Planeamento → (aprovação explícita) → Implementação → Validação → Encerramento
```

- **Análise**: estado atual, arquitetura existente, ficheiros
  relevantes, dependências, riscos, limites da fase.
- **Planeamento**: objetivo, ficheiros a tocar, impacto esperado,
  comandos de validação — esperar aprovação explícita antes de
  implementar, salvo o disposto na secção 4.
- **Implementação**: só o que foi aprovado. Sem funcionalidades extra,
  sem código fora do âmbito, sem refactors oportunistas.
- **Validação**: checklist canónico em `docs/ai/AI_RELEASE_CHECKLIST.md`.
- **Encerramento**: resumo, ficheiros alterados, validações, riscos
  restantes, próximo passo.

Fundamentação completa: `docs/ai/AI_WORKFLOW.md`, secção "Fluxo
obrigatório".

## 4. Aprovação automática para operações não destrutivas

Dentro do âmbito já aprovado de uma fase (ver `docs/ai/AI_PHASE_TEMPLATE.md`
para como esse âmbito é definido), não interromper o trabalho para
pedir confirmação de:

- leitura de ficheiros, pesquisa no projeto, análise de código;
- criação e edição de ficheiros dentro do âmbito aprovado (código,
  testes, documentação);
- reorganização de documentação, criação de templates;
- atualização de documentação, validação de links internos;
- execução de comandos de validação (typecheck, build, test).

Só interromper e esperar aprovação explícita quando existir:

- risco de perda de dados;
- alteração arquitetural fora do âmbito já aprovado da fase;
- remoção de documentação ou código já existente;
- necessidade de alterar uma decisão já aprovada anteriormente;
- `git commit`, `git tag` ou `git push` (ver secção 10 — nunca
  automático, sob nenhuma circunstância).

Esta secção não substitui a exigência de aprovação explícita do
**plano** de uma fase antes de a implementar (secção 3) — regula só o
que acontece **depois** de um plano/âmbito já estar aprovado, para não
se voltar a pedir permissão passo a passo dentro desse âmbito.

## 5. YAGNI e âmbito

Antes de propor qualquer alteração fora do âmbito já aprovado da fase
atual, perguntar: **"Esta alteração é realmente necessária para
concluir as próximas 2 ou 3 fases?"**

- Não → não aumentar o âmbito. Registar a ideia em "Observações para
  fases futuras" (secções 15 e 16) e continuar.
- Sim → discutir antes de implementar, seguindo o fluxo normal
  (Análise → Planeamento → aprovação explícita).

Não propor arquitetura para problemas hipotéticos sem consumidor real,
funcionalidades que não serão usadas nas próximas 2-3 fases, ou
alterações que aumentam o âmbito sem necessidade imediata.

Distinto de "preservar evolução futura" (`docs/ai/AI_GOVERNANCE.md`,
Execution Mode): YAGNI é sobre não **construir** antes da hora;
preservar evolução futura é sobre não fechar, sem necessidade, portas
para permissões/RBAC, utilizadores, auditoria, deploy, escalabilidade,
multi-produto ou multi-tenant — sem aumentar o âmbito da fase atual
para isso.

Fundamentação completa: `docs/ai/AI_WORKFLOW.md`, secção "Execution
Mode — quando interromper".

## 6. Reutilização antes de criar

Antes de criar qualquer documento, package, componente ou abstração
nova: confirmar via `docs/INDEX.md` (documentação) ou pesquisa no
código (implementação) que não existe já um equivalente. Sempre que uma
responsabilidade poderia viver em mais do que um sítio, consolidar num
único local (com os outros a apontar para ele) em vez de duplicar.

Uma pasta nova só se justifica com 3+ documentos genuinamente
relacionados que a justifiquem (ver `docs/adr/0006-documentation-architecture.md`).
Um package novo só se justifica com um segundo consumidor real (ver
secção 7).

Fundamentação completa: `docs/ai/AI_DOCUMENTATION.md`,
`docs/PROJECT_STRUCTURE.md`.

## 7. Regras de arquitetura e packages

- `packages/*` = FrontCore. **Zero lógica de domínio.** Deve ser
  genérico o suficiente para qualquer produto futuro (FrontClinic,
  FrontHotel, FrontGym, ...), não só FrontRest.
- `apps/frontrest/*` = produto. Toda a lógica de restaurante vive aqui
  — mesmo quando o código em si não é "sobre restaurantes" (ex.
  parsing fiscal), se não há um segundo consumidor real fora de
  FrontRest hoje, o código fica em `apps/`, não em `packages/` (YAGNI,
  secção 5).
- Regra de dependência: `apps/*` podem importar `packages/*`;
  `packages/*` nunca importa `apps/*`.
- Um package novo só nasce com necessidade real e concreta — nunca
  especulativamente.
- Exceções à separação domínio/genérico exigem justificação explícita
  por escrito no documento da fase (ver, como precedente,
  `docs/phases/phase-6.4-ocr-draft-integration-foundation.md`, secção
  sobre o contrato `OcrProcessingJob`).

Fundamentação completa: `docs/ARCHITECTURE.md`, `docs/CODING_STANDARDS.md`.

## 8. Regras de testes

- Testes unitários acompanham qualquer lógica nova com valor a
  proteger — um teste por comportamento relevante, não um teste por
  linha de código.
- `apps/frontrest/api` e `apps/frontrest/workers` usam Jest; `packages/*`
  usam Vitest quando têm testes — seguir a convenção já estabelecida
  no package/app em causa, nunca introduzir uma ferramenta de testes
  nova sem justificação.
- `pnpm test` só corre onde já existirem testes — não falhar a
  validação por ausência de testes onde nunca existiram.
- Testes e2e (`test:e2e`) não fazem parte do `pnpm test` por omissão —
  correm-se explicitamente quando a fase os justificar.
- Nunca alterar um teste para esconder uma regressão. Nunca usar
  `--force`/`--no-verify` ou equivalentes para contornar uma validação
  que falha.
- Mocks de infraestrutura (Prisma, storage, filas) seguem os
  utilitários já existentes em `test/utils/` de cada app — reutilizar,
  não recriar.

## 9. Convenções de código

- Tipos explícitos quando ajudam a leitura; funções pequenas; nomes
  descritivos; exports explícitos.
- Evitar `any` sem justificação, lógica escondida em helpers genéricos
  demais, dependências circulares, efeitos colaterais inesperados.
- Configuração lida do ambiente segue sempre `load<X>Config(): <X>Config`
  — uma função só, `requireEnv`/`optionalEnv`/`parseCsvEnv` de
  `@frontcore/config`, sem `ConfigService` do NestJS, sem validação de
  schema externa.
- Antes de adicionar uma dependência: que problema resolve, porque não
  é resolvido com código existente, impacto no bundle/build/manutenção,
  compatibilidade arquitetural.
- Refactors pequenos e explícitos; nunca misturados com uma feature no
  mesmo commit, exceto quando indispensável e aprovado.

Fundamentação completa: `docs/CODING_STANDARDS.md`.

## 10. Git — nunca commit, tag ou push

**A IA nunca executa `git add`, `git commit`, `git push`, `git tag` ou
merge de pull request.** Pode sugerir os comandos exatos, mas quem
decide quando executar é sempre o utilizador. Esta regra não tem
exceções implícitas — só quando o utilizador pedir explicitamente essa
ação, nomeada por extenso, nesse pedido específico.

Convenções de commit/tag (quando o utilizador as executar):
Conventional Commits (`feat(x): ...`, `fix(x): ...`, `docs(x): ...`,
`refactor(x): ...`, `chore(x): ...`); tags só para pontos recuperáveis
(`vX.Y.Z-nome-da-fase`), não para cada alteração pequena.

Fundamentação completa: `docs/GIT_WORKFLOW.md`, `docs/ai/AI_WORKFLOW.md`
secção "Git".

## 11. Como apresentar resultados

Quatro modos de resposta, conforme o tipo de tarefa
(`docs/ai/AI_RESPONSE_FORMAT.md`; esqueletos em `docs/ai/templates/`):

- **Modo Trabalho** — análise ou implementação do dia a dia: Estado do
  Git, Documentação utilizada, Análise, Decisão, Ficheiros, Próximo
  passo.
- **Modo Arquitetura** — decisão estrutural: Contexto, Análise,
  Alternativas, Decisão, Impacto, Próximo passo.
- **Modo Revisão** — avaliação crítica de algo já existente: Resultado,
  Problemas encontrados, Riscos, Recomendações. Checklist a percorrer:
  `docs/ai/AI_REVIEW_CHECKLIST.md`.
- **Modo Implementação** — resultado de trabalho já aprovado: Objetivo,
  Ficheiros alterados, Resumo, Validação, Próximo passo.

Sem modo óbvio, usar Modo Trabalho por omissão.

## 12. Como documentar decisões

Documentar sempre o **porquê**, não só o quê — um comentário bom
explica intenção ou uma restrição não óbvia; um comentário mau repete o
que o código já diz. Documentação de fase (`docs/phases/`) descreve o
estado final da arquitetura, não o processo — evitar narrativa de
"etapas"/aprovações/"a revisão encontrou X" e contagens frágeis de
ficheiros que ficam desatualizadas.

Sempre que uma alteração modificar arquitetura, workflow ou estrutura
do projeto, indicar explicitamente quais documentos precisam de ser
atualizados — nunca assumir que a documentação continua correta depois
de uma alteração estrutural.

Fundamentação completa: `docs/ai/AI_DOCUMENTATION.md`.

## 13. Como tratar problemas encontrados durante uma tarefa

Um problema encontrado a meio de uma tarefa (bug real, inconsistência,
risco) segue sempre este percurso, nunca é escondido:

1. Confirmar que é real — reproduzir ou verificar empiricamente antes
   de reportar como facto (nunca assumir que uma regex/lógica funciona
   sem a testar contra um caso concreto).
2. Se está claramente dentro do âmbito já aprovado e é de baixo risco:
   corrigir, com teste de regressão, e explicar a correção no relatório
   final.
3. Se está fora do âmbito, ou é uma mudança arquitetural maior: não
   corrigir por iniciativa própria — registar em "Limitações
   conhecidas" ou "Riscos conhecidos" com a razão técnica, e seguir a
   secção 14 se justificar uma alternativa arquitetural.
4. Nunca reportar como validado algo que não foi executado. Nunca
   reportar como corrigido algo que não foi testado depois da correção.

## 14. Como propor alternativas arquiteturais

1. Identificar a dúvida.
2. Explicar o impacto de cada alternativa.
3. Apresentar as alternativas, com trade-offs explícitos.
4. Esperar aprovação — nunca assumir uma decisão arquitetural por
   conta própria.

Alterações que resolvem problemas hipotéticos sem consumidor real, que
não serão usadas nas próximas 2-3 fases, ou que aumentam o âmbito sem
necessidade imediata: não propor (ver secção 5).

Fundamentação completa: `docs/ai/AI_GOVERNANCE.md` secção "Processo de
tomada de decisão"; `docs/ai/AI_WORKFLOW.md` secção "Regra principal".

## 15. Como lidar com dívida técnica

Dívida técnica identificada (não corrigida por estar fora do âmbito,
ser de baixo risco atual, ou exigir uma decisão maior) fica sempre
registada por escrito, nunca só na cabeça de quem a encontrou:

- **"Limitações conhecidas"** — no documento da fase, para o que é uma
  característica aceite do desenho atual (ex. um extractor que nunca
  devolve `null`, uma convenção regional assumida).
- **"Trabalho futuro"** — no documento da fase, para o que já era
  sabido, à partida, que ficava fora do âmbito e pertence a uma fase
  posterior (decidido no planeamento, não descoberto a meio da
  implementação).
- **"Observações para fases futuras"** — secção final da resposta
  (e, quando existir documento de fase, também nele), para melhorias
  encontradas *durante* a implementação que não pertencem ao âmbito da
  fase atual — ver secção 16 para a regra completa e o formato exato.
- **"Riscos conhecidos"** — no relatório de uma revisão, para o que
  podia falhar mas não é considerado um bloqueador.

Nunca resolver dívida técnica "de passagem" dentro de uma fase não
relacionada — mesmo uma correção pequena e óbvia, se está fora do
âmbito aprovado, regista-se em vez de se implementar (secção 5).

## 16. Como lidar com melhorias fora do âmbito

Uma ideia de melhoria que surge a meio de uma implementação segue o
teste da secção 5. Se não passa nesse teste:

- não a implementar;
- não aumentar o âmbito da fase atual para a discutir em profundidade;
- documentá-la numa secção final chamada **"Observações para fases
  futuras"**, uma entrada por melhoria encontrada, com estes quatro
  campos:
  - **Problema encontrado** — o que foi observado, especificamente,
    não uma impressão vaga.
  - **Impacto** — o que custa não resolver isto agora, ou o que se
    ganharia ao resolver.
  - **Sugestão** — a direção de solução, sem a implementar nem a
    desenhar em detalhe.
  - **Prioridade** — Alta / Média / Baixa, do ponto de vista de quem
    vai decidir a próxima fase, não de quem encontrou o problema.

Esta secção existe para a observação sobreviver para lá da conversa em
que foi encontrada — a documentação, não o histórico de chat, é a
Source of Truth (secção 2). Quando a tarefa também produzir um
documento de fase (`docs/phases/phase-X.Y-*.md`), transportar estas
observações para lá antes de fechar a fase, para ficarem localizáveis
por quem só ler esse documento. Servem de base para fases futuras ou
para uma ADR — nunca se resolvem por conta própria dentro da fase onde
foram encontradas.

Continuar a implementação aprovada depois de registar. Interromper o
trabalho em curso só quando existir bloqueio técnico imediato,
necessidade real (não hipotética) de evitar retrabalho identificável
nas próximas 2-3 fases, duplicação significativa, ou violação de
arquitetura já aprovada.

## 17. Como responder durante uma implementação

Implementar apenas o que foi aprovado. Não adicionar funcionalidades
extra, não alterar código fora do âmbito, não fazer refactors
oportunistas. No final, usar o Modo Implementação (secção 11): o que
mudou, ficheiros afetados, validação executada (nunca alegada sem ter
corrido), riscos restantes, próximo passo recomendado.

## Documentos relacionados

| Situação | Documento |
|---|---|
| Filosofia completa | `docs/ai/AI_GOVERNANCE.md` |
| Workflow operacional completo | `docs/ai/AI_WORKFLOW.md` |
| Continuidade entre fases (decisões aprovadas, o que conta como "encerrada") | `docs/ai/AI_WORKFLOW.md`, secção "Continuidade entre fases" |
| Começar uma fase nova | `docs/ai/AI_PHASE_TEMPLATE.md` |
| Rever algo já existente | `docs/ai/AI_REVIEW_CHECKLIST.md` |
| Fechar uma fase | `docs/ai/AI_RELEASE_CHECKLIST.md` |
| Como usar este framework, com exemplos | `docs/ai/AI_PROMPT_GUIDE.md` |
| Formato de resposta detalhado | `docs/ai/AI_RESPONSE_FORMAT.md` |
| Formato de pedido detalhado | `docs/ai/AI_PROMPT_STANDARD.md` |
| Regras de escrita de documentação | `docs/ai/AI_DOCUMENTATION.md` |
| Revisão específica de `packages/ui` | `docs/ai/AI_QUALITY_REVIEW.md` |
