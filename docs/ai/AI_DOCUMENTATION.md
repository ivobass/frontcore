# FrontCore AI Documentation Rules

Version: 1.0

## Objetivo

Consolidar num único documento as regras de **como escrever e manter
documentação** no FrontCore — antes espalhadas entre `AI_GOVERNANCE.md`
("Governação documental") e `AI_WORKFLOW.md` ("Documentação"). Este
documento não define filosofia (`docs/ai/AI_GOVERNANCE.md`) nem o fluxo de
código (`docs/ai/AI_WORKFLOW.md`) — define só as regras de escrita e
localização de documentos.

## Localização por tipo de documento

- **ADRs** (`docs/adr/`) — decisões estruturais. Nunca editadas depois de
  `Aceite`; uma mudança de decisão gera uma nova ADR que referencia a
  anterior.
- **Documentação de processo** (`AI_WORKFLOW.md`, `AI_RESPONSE_FORMAT.md`,
  `CODING_STANDARDS.md`, `GIT_WORKFLOW.md`, `RELEASE_PROCESS.md`, e os
  restantes documentos em `docs/ai/`) — pode ser atualizada diretamente,
  incrementando a versão no topo do ficheiro.
- **Documentação de fase** (`docs/phases/`) — registo histórico do que foi
  feito; não é alterada depois de a fase fechar.
- **Documentação de qualidade** (`docs/quality/`) — guidelines e critérios
  de validação, atualizável diretamente como documentação de processo.
- **Documentação técnica versionada com o código** vive em
  `frontcore/docs/`. Documentação de produto, negócio ou visão de longo
  prazo vive fora do repositório, em `FrontCore/docs/` (ver
  `docs/PROJECT_STRUCTURE.md`) — os dois níveis não se duplicam.

## Regra de escrita para documentos de fase

Documentação de fase (`docs/phases/phase-3.X-*.md`) descreve **o estado
final da arquitetura**, não o processo de desenvolvimento que levou lá.

Evitar:
- referências a "etapas", aprovações intermédias ou revisões de conversa;
- contagens frágeis de ficheiros/componentes que ficam desatualizadas;
- narrativa do tipo "a revisão encontrou X, corrigimos Y".

Preferir:
- factos arquiteturais diretos ("`Sidebar` fica em `shell/` porque...");
- decisões e o porquê, não o histórico de como se chegou lá.

## Regra ao atualizar documentação existente

Sempre que uma alteração modificar arquitetura, workflow, estrutura do
projeto ou processo de release, a IA deve indicar quais documentos
precisam de ser atualizados. Nunca assumir que a documentação continua
correta depois de uma alteração estrutural.

## Regra anti-duplicação

Antes de criar um documento novo, confirmar via `docs/INDEX.md` que não
existe já um equivalente. Sempre que uma responsabilidade poderia viver em
mais do que um documento, preferir consolidar num único (com os outros a
apontar para ele) em vez de duplicar o conteúdo.

## Princípio geral

A documentação existe para servir o desenvolvimento — para dar
continuidade e reduzir ambiguidade — não para o bloquear. Não criar
estrutura ou documentos novos sem necessidade real (ver
`docs/PROJECT_STRUCTURE.md`, "regra anti-caos").
