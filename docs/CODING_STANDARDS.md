# FrontCore Coding Standards

Version: 1.0

## Objetivo

Este documento define regras base para código no FrontCore.

Deve ser atualizado à medida que o projeto amadurece.

## Princípios

- Código simples antes de código esperto.
- Tipos explícitos quando ajudam a leitura.
- Reutilização sem criar abstrações prematuras.
- Separação clara entre core e produto.
- Zero lógica de domínio dentro de `packages/*`.

## TypeScript

Preferir:

- tipos claros
- funções pequenas
- nomes descritivos
- exports explícitos

Evitar:

- `any` sem justificação
- lógica escondida em helpers genéricos demais
- dependências circulares
- efeitos colaterais inesperados

## Imports

Regra de dependência:

```text
apps/* podem importar packages/*
packages/* não podem importar apps/*
```

Imports devem refletir a arquitetura, não apenas funcionar.

## Packages

Packages devem ser genéricos.

Exemplo correto:

```text
@frontcore/ui
@frontcore/auth
@frontcore/database
```

Exemplo errado dentro de package core:

```text
restaurantInvoice
frontrestSupplier
menuCategory
```

Lógica específica de restaurante pertence a `apps/frontrest`.

## UI

`packages/ui` deve conter componentes, utilitários, estilos e tipos reutilizáveis.

Não deve conter regras de negócio.

Durante a Fase 3.3, o foco é foundation técnica, não criação de componentes visuais finais.

## Documentação no código

Comentários devem explicar intenção, não repetir o código.

Bom comentário:

```ts
// Keeps package exports stable for app consumers.
```

Mau comentário:

```ts
// incrementa i por 1
```

## Dependências

Antes de adicionar uma dependência, justificar:

1. Que problema resolve.
2. Porque não é resolvido com código existente.
3. Impacto no bundle, build ou manutenção.
4. Se é compatível com a arquitetura.

## Refactors

Refactors devem ser pequenos e explícitos.

Não misturar refactor com feature, excepto quando for indispensável e aprovado.

## Regra final

Código que funciona mas quebra arquitetura não é bom código para o FrontCore.
