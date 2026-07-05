# FrontCore Project Structure

Version: 1.1

## Objetivo

Este documento explica a organização oficial do repositório FrontCore.

Deve ser usado por humanos e agentes de IA antes de criar, mover ou alterar ficheiros estruturais.

## Separação importante

Existem dois níveis de documentação no projeto completo:

```text
FrontCore/docs/        documentação de produto, visão, negócio e planeamento geral
frontcore/docs/        documentação técnica versionada com o código
```

Este repositório `ivobass/frontcore` contém a pasta técnica:

```text
docs/
```

## Regra principal

A documentação técnica que afeta código, arquitetura, ADRs, fases, standards ou workflow deve viver dentro deste repositório em `docs/`.

A documentação de visão de produto, ideias comerciais, roadmap externo ou planeamento de negócio pode viver fora do repositório técnico.

## Estrutura técnica esperada

```text
frontcore/
├── apps/
│   └── frontrest/
├── packages/
│   ├── config/
│   ├── shared/
│   ├── database/
│   ├── auth/
│   ├── storage/
│   ├── ai/
│   ├── notifications/
│   ├── monitoring/
│   └── ui/
├── docs/
│   ├── adr/
│   ├── phases/
│   ├── ai/
│   ├── quality/
│   ├── INDEX.md
│   ├── ARCHITECTURE.md
│   ├── PROJECT_STRUCTURE.md
│   ├── DEVELOPER_GUIDE.md
│   ├── GIT_WORKFLOW.md
│   ├── CODING_STANDARDS.md
│   └── RELEASE_PROCESS.md
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

Nem todas as pastas precisam existir desde o primeiro dia. Devem ser criadas quando forem úteis — ver ADR-0006 para o critério exato de quando uma subpasta nova de `docs/` se justifica (documentado abaixo, em "Antes de criar uma pasta nova").

## Regras por zona

### `apps/`

Contém produtos concretos.

Exemplo:

```text
apps/frontrest
```

Aqui pode existir lógica de restaurante, páginas específicas, fluxos de produto e experiência final do cliente.

### `packages/`

Contém FrontCore reutilizável.

Regra de ouro:

```text
packages/* não pode depender de apps/*
```

Packages devem ser genéricos e reutilizáveis para vários produtos SaaS.

### `packages/ui`

Contém a base visual reutilizável.

Deve evitar lógica de domínio.

Fase 3.3 foca-se na foundation técnica deste package.

### `docs/adr/`

Contém Architecture Decision Records.

Usar para decisões estruturais, irreversíveis ou difíceis de mudar depois.

### `docs/phases/`

Contém documentação detalhada por fase, quando necessário.

Exemplo:

```text
docs/phases/phase-3-ui.md
```

### `docs/ai/`

Contém toda a governação, workflow, formato de resposta e de prompt de
IA. Ver `docs/ai/README.md`.

### `docs/quality/`

Contém os standards de qualidade do Design System (`packages/ui`) —
audiência-agnóstica, aplica-se a qualquer contribuidor. Ver
`docs/quality/README.md`.

### `docs/architecture/` (ainda não existe)

Reservado para documentação técnica por área (ex. `database.md`,
`security.md`, `infrastructure.md`, `backend.md`, `frontend.md`), a
nascer só quando a primeira dessas áreas tiver conteúdo real para
documentar — nunca especulativamente. Ver ADR-0006.

## Antes de criar uma pasta nova

Confirmar:

1. A pasta já não existe com outro nome.
2. A responsabilidade não pertence a outra zona.
3. A criação respeita `docs/ARCHITECTURE.md`.
4. A alteração está dentro da fase atual.
5. Existem 3+ documentos genuinamente relacionados que a justifiquem —
   ver ADR-0006 para o critério completo.

## Regra anti-caos

Não criar estrutura só porque parece elegante.

Criar estrutura apenas quando ela reduz confusão, melhora manutenção ou desbloqueia uma fase real.
