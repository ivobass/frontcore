# FrontCore AI Governance

Version: 1.5

## Objetivo

Definir a filosofia de funcionamento de qualquer IA (ou pessoa) que
trabalhe no FrontCore — os princípios e a estrutura de decisão. Este
documento define o **porquê**. O **como** operacional vive em
`docs/ai/AI_WORKFLOW.md`; o formato das respostas vive em
`docs/ai/AI_RESPONSE_FORMAT.md`; como escrever prompts e documentação
vivem em `docs/ai/AI_PROMPT_STANDARD.md` e `docs/ai/AI_DOCUMENTATION.md`
— ver `docs/ai/README.md` para o mapa completo desta pasta.

## Princípios

- A documentação é a Source of Truth do projeto — não a memória de
  nenhuma IA, não o histórico de conversas.
- Nenhuma IA é considerada fonte de verdade. Nenhum modelo específico tem
  autoridade sobre a documentação — a autoridade está no documento, não em
  quem o escreveu ou interpretou.
- A arquitetura tem prioridade sobre velocidade de entrega.
- Trocar de ferramenta de IA não deve exigir reaprender o projeto do
  zero — a documentação garante continuidade.
- Cada decisão estrutural fica registada, não só implementada.

## Source of Truth

A documentação oficial em `frontcore/docs/` prevalece sempre sobre:

- memória ou suposições de qualquer IA;
- histórico de conversas anteriores;
- convenções aprendidas noutros projetos.

`docs/INDEX.md` é o ponto de entrada único e obrigatório para navegar essa
documentação.

## Documentação prevalece sobre memória

Sempre que exista conflito entre o que uma IA "acha que sabe" (de
conversas anteriores, de outros projetos, ou de suposições) e o que a
documentação oficial diz, a documentação vence. Se a documentação parecer
estar errada ou desatualizada, a IA não a corrige silenciosamente —
assinala o conflito e pede validação. O procedimento concreto para isto
está em `docs/ai/AI_WORKFLOW.md`.

## Utilização obrigatória do INDEX.md

Todo o trabalho técnico no FrontCore começa por `docs/INDEX.md`. É a
partir dele que se localiza: ADRs, arquitetura, workflow, guias, fases e
processo de release. Nenhum documento novo deve ser criado sem primeiro
confirmar, através do INDEX, que não existe já um equivalente.

## Documentação

As regras de governação documental (o que é ADR, o que é fase, onde vive
cada tipo de documento, como evitar duplicação entre `frontcore/docs/` e
`FrontCore/docs/`) estão consolidadas em `docs/ai/AI_DOCUMENTATION.md`,
para não se repetirem em mais do que um sítio.

## Camadas da documentação de IA

A documentação em `docs/ai/` organiza-se em quatro camadas conceptuais:

- **Filosofia** — explica *porquê* as regras existem.
- **Processo** — explica *como* trabalhar dentro dessa filosofia.
- **Especificações** — definem regras técnicas concretas e formatos
  (de resposta, de pedido, de documentação, de qualidade).
- **Prompt Kit** — condensa Filosofia/Processo/Especificações em
  documentos feitos para citar ou copiar diretamente para dentro de um
  prompt (regras permanentes, formulário de fase, checklists de revisão
  e de encerramento), em vez de só serem lidos e internalizados.

Esta separação existe para que cada camada evolua de forma independente
— alterar como um pedido é formulado não deve exigir alterar a filosofia
nem o formato de resposta, e vice-versa — e para preparar o FrontCore
para um ecossistema com múltiplos agentes especializados (Backend,
Frontend, DevOps, QA, Documentation, Security, ...), onde é esperado que
todos partilhem a mesma Filosofia e o mesmo Processo, mas cada um possa
vir a ter Especificações (e um Prompt Kit) próprias.

A classificação de qual documento pertence a qual camada vive em
`docs/ai/README.md` — não repetida aqui, para não haver duas fontes da
mesma taxonomia.

## Processo de tomada de decisão

1. Identificar se a decisão é **estrutural** (arquitetura, fronteiras
   entre packages/apps, dependências externas) ou **operacional** (como
   executar uma tarefa dentro de uma arquitetura já decidida).
2. Decisões estruturais exigem: análise, proposta explícita, aprovação do
   Product Owner / Tech Lead, e registo em ADR.
3. Decisões operacionais seguem o fluxo de `docs/ai/AI_WORKFLOW.md`.
4. Em caso de dúvida sobre se algo é estrutural ou operacional, tratar
   como estrutural — parar e perguntar.

## Execution Mode

A fase de arquitetura, governação, documentação, workflows, ADRs e
foundation do FrontCore atingiu maturidade suficiente. O objetivo do
projeto deixou de ser desenhar a plataforma — passou a ser construí-la.
A partir de agora, qualquer IA, programador ou equipa que trabalhe no
FrontCore opera em **Execution Mode**: entrega contínua de
funcionalidades tem prioridade sobre exploração arquitetural adicional.

Distribuição de esforço esperada:

- **90%** — implementação, funcionalidades, integração, testes,
  correção de bloqueios, fecho de fases.
- **10%** — documentação, refactoring, arquitetura, melhorias futuras.

Princípio de fundo: não continuar a planear funcionalidades enquanto a
base ainda não estiver concluída — primeiro terminar o produto, depois
melhorá-lo.

Execution Mode não suspende nenhum princípio já definido neste
documento — a documentação continua Source of Truth, e decisões
genuinamente estruturais continuam a exigir análise, proposta explícita
e aprovação (secção anterior). O que muda é o **filtro anterior a essa
classificação**: uma ideia arquitetural só chega a ser avaliada como
estrutural/operacional se passar primeiro pelo teste de necessidade
imediata. Aplicação operacional concreta — incluindo a pergunta
obrigatória a fazer antes de propor qualquer alteração fora do âmbito
já aprovado, e os únicos motivos válidos para interromper uma
implementação em curso — vive em `docs/ai/AI_WORKFLOW.md`, secção
"Execution Mode — quando interromper".

### Preservar evolução futura sem aumentar o âmbito atual

Distinto de YAGNI (`docs/ai/AI_BASE_PROMPT.md`, secção 5 — não
**construir** o que ainda não é preciso): durante a implementação de
uma fase, evitar decisões que dificultem desnecessariamente uma
evolução futura conhecida da plataforma — permissões e RBAC mais
finos, gestão de utilizadores, alteração/recuperação de password,
auditoria, deploy, infraestrutura, escalabilidade, multi-produto,
multi-tenant. Isto nunca significa construir estas capacidades
antecipadamente, nem desenhar para elas em detalhe — significa só não
fechar portas que uma decisão diferente, igualmente simples, teria
deixado abertas (ex. nomes de campos, forma de um contrato, isolamento
por organização). Continua a aplicar-se o teste de Execution Mode: se
evitar uma decisão fechada exigisse esforço ou âmbito adicional
palpável agora, a fase atual não paga esse custo — regista-se em
"Observações para fases futuras" (`docs/ai/AI_BASE_PROMPT.md`, secção
16) em vez de a resolver.

## Estrutura da equipa

Os papéis abaixo são permanentes; as ferramentas/pessoas que os
desempenham hoje não são — a coluna "Atualmente" identifica quem ocupa
cada papel neste momento, substituível a qualquer momento sem alterar
o papel em si nem exigir reescrever esta documentação.

| Função | Atualmente | Responsabilidade | Não faz |
|---|---|---|---|
| Product Owner / Tech Lead / Lead Software Architect | Ivo Baptista | Visão do produto, decisão técnica final, prioridades, resolução de conflitos — aprovação final sobre as áreas listadas abaixo | — é sempre a autoridade final; nenhuma decisão estrutural fica válida sem esta aprovação, registada num documento oficial (ver "Continuidade entre fases", `docs/ai/AI_WORKFLOW.md`) |
| Architecture & Governance Assistant | ChatGPT | Análise arquitetural, governação, revisão crítica, preparação de prompts, análise de riscos, validação da coerência entre fases | Não substitui decisões do Product Owner; não implementa código no repositório |
| Repository Engineering & Implementation Assistant | Claude | Implementação, testes, refactoring, documentação da fase, execução do âmbito aprovado | Não altera autonomamente arquitetura, plataformas, fornecedores ou decisões já aprovadas |
| Independent Review / QA Assistant (opcional) | Codex ou equivalente | Revisão independente, análise de regressões, testes, revisão de diffs, validação complementar | Não altera arquitetura nem decisões do Product Owner |

O Product Owner é responsável pela aprovação final de:

- arquitetura;
- roadmap;
- stack tecnológica;
- plataformas;
- fornecedores;
- integrações externas;
- estratégia de infraestrutura;
- estratégia de segurança;
- âmbito funcional;
- prioridades do projeto.

As IAs (qualquer uma das três funções de IA acima) analisam,
aconselham e executam dentro das decisões já aprovadas — a decisão
final pertence sempre ao Product Owner. Nenhuma das três funções de IA
substitui outra: governação/revisão, implementação, e revisão
independente são responsabilidades distintas, mesmo quando várias são
desempenhadas na mesma conversa ou pela mesma ferramenta.

**Nota:** esta documentação não deve depender de nenhuma pessoa nem de
nenhum modelo de IA específico para continuar válida — qualquer pessoa
ou assistente que siga `docs/ai/AI_GOVERNANCE.md`, `docs/ai/AI_WORKFLOW.md`
e `docs/ai/AI_RESPONSE_FORMAT.md` pode ocupar qualquer um destes papéis
no futuro, incluindo substituir Ivo Baptista, ChatGPT, Claude ou Codex
sem alterar os papéis definidos acima.

## Boas práticas

- Preferir alterações pequenas, explicáveis numa frase.
- Nunca misturar fases ou áreas não relacionadas na mesma alteração.
- Documentar o "porquê", não só o "o quê".
- Validar sempre antes de considerar uma tarefa concluída.

## Escalabilidade futura

Esta governação foi desenhada para escalar para múltiplos produtos
(FrontRest, FrontClinic, FrontHotel, FrontGym, FrontERP, ...) e para
qualquer número de colaboradores humanos ou assistentes de IA, presentes
ou futuros. À medida que a equipa crescer, novas funções podem ser
adicionadas à tabela acima sem alterar os princípios definidos neste
documento.
