---
name: tdd
description: Ciclo vermelho-verde-refactor disciplinado no GestPro. Usar ao implementar qualquer servico, funcao pura ou regra de negocio nova, e sempre que existir um invariante declarado num ADR.
---

# TDD — GestPro

> Adaptado dos padrões de [mattpocock/skills](https://github.com/mattpocock/skills) às convenções
> desta casa.

## O ciclo

**Vermelho.** Escreve o teste e corre-o. Tem de falhar, e tem de falhar **pela razão certa** — um
teste que falha com `TypeError: x is not a function` ainda não provou nada sobre a regra que
pretende trancar. Lê a mensagem de falha antes de avançar.

**Verde.** A implementação mais pequena que faz passar. Não antecipes o teste seguinte.

**Refactor.** Com o teste verde a segurar-te. Estrutura, nomes, extracção. Zero alteração de
comportamento.

Uma propriedade de cada vez. `npx vitest run <ficheiro>` entre passos, não no fim.

## Quando é property test e não exemplo

Exemplo (`it('devolve 3 buckets para 21 dias semanais')`) documenta um caso. Property test
(`∀ horizonte, ∀ granularidade: saldoFinal(n) == saldoFinal(n−1) + entradas − saidas`) tranca uma
regra. Regra geral desta casa:

- **Property test** para: máquinas de estado, aritmética de dinheiro, invariantes declarados em ADR,
  idempotência, ordenação, partida dobrada, numeração sem lacunas.
- **Exemplo** para: o caso concreto que o utilizador descreveu, e as fronteiras que o gerador não
  cobriria por si.
- **Integração (Testcontainers)** para: isolamento multi-tenant, transacções, tudo o que envolva
  Postgres real.
- **E2E** para: o fluxo que o utilizador percorre, com asserções sobre **valores**, não sobre
  presença de elementos.

`numRuns ≥ 1000` nos property tests que trancam invariantes. Geradores cobrem zero, fronteira de
mês, fim de ano, 29 de Fevereiro.

## Regras que não se dobram

**Não se altera o teste para o código passar.** Se o teste parecer errado, páras e escreves porquê.
Neste repositório, num nó agêntico, isto é BLOCKER automático e verificável por
`git diff -- '*__tests__/*'`.

**Dinheiro compara-se com `Decimal.equals()`.** Nunca `number`, nunca `toBeCloseTo`. Uma asserção
monetária com tolerância é uma asserção que não asserta.

**Datas constroem-se explicitamente.** `new Date('2026-01-01')` lê como UTC e a leste de Greenwich
cai no dia anterior — muda o período fiscal e o teste passa a testar outro mês.

**Todo o invariante tem um caso que tem de lançar.** Um teste que só percorre o caminho feliz não
prova que a guarda existe.

## Antes de entregar

`pnpm check` verde. Cobertura ≥ 80 % no serviço novo (≥ 90 % em payroll, ≥ 95 % em núcleo puro de
cálculo financeiro). Se a cobertura subiu e nenhum comportamento novo ficou trancado, escreveste
testes a mais e asserções a menos.
