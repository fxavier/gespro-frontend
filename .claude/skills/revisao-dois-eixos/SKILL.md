---
name: revisao-dois-eixos
description: Rever codigo em dois eixos independentes - conformidade com as convencoes e fidelidade ao spec. Usar antes de qualquer merge, ao rever o diff de um agente, ou quando o pedido e "revê isto antes de eu fazer merge".
---

# Revisão em dois eixos — GestPro

> Adaptado dos padrões de [mattpocock/skills](https://github.com/mattpocock/skills).

Toda a revisão responde a **duas perguntas independentes**. Código impecável que resolve o problema
errado passa no primeiro eixo e reprova no segundo, e é o modo de falha mais caro — porque parece
bom.

## Eixo 1 — Conformidade

O código cumpre as regras desta casa? Fonte de verdade: `CLAUDE.md` §Regras invioláveis e as skills
`prisma-conventions`, `api-conventions`, `ui-conventions` e a do domínio.

Ordem de leitura eficiente:

1. `pnpm check` vermelho ⇒ BLOCKER imediato, revisão suspensa. Não se revê o que não compila.
2. `pnpm gates` vermelho ⇒ BLOCKER.
3. Segurança: `createSafeAction`/`withApi`, `requirePermission`, `tenantId` do `Ctx` e nunca do
   input, `findUnique`/`update`/`delete` com filtro explícito, cross-tenant ⇒ 404.
4. Dinheiro em `Decimal`; serialização na fronteira SC→CC.
5. Fronteira RSC: `page.tsx` de listagem/detalhe como Server Component, colunas com funções em
   `'use client'`, nenhum value-import de `server-only` num Client Component.
6. Modo de Leitura: consultas com `permiteEmLeitura: true`; `revalidate` declarado nas mutações.

## Eixo 2 — Fidelidade ao spec

O código faz o que o spec pediu? Lê o `requirements.md` e o ADR **antes** do diff, não depois — ler
o diff primeiro ancora-te na solução apresentada e deixas de ver o requisito em falta.

- Cada requisito numerado tem correspondência verificável no diff, ou está declarado como pendente.
- Os invariantes do ADR têm teste. Um invariante sem teste é um comentário.
- O que o spec **proíbe** está mesmo ausente (ex.: nenhuma leitura de `ContaBancaria.saldoAtual`;
  nenhuma escrita em `Lancamento` fora do serviço).
- Nenhum âmbito a mais. Trabalho não pedido é trabalho não revisto e não testado.

## Eixo 3, só em revisão de trabalho agêntico

- `git diff --stat -- '*__tests__/*' '*fixtures/*'`: alteração por um agente autor é BLOCKER — é o
  oráculo a ser adaptado à solução.
- Golden fixture alterada sem justificação escrita no PR: BLOCKER.
- Teste enfraquecido (tolerância introduzida, `numRuns` reduzido, caso removido): BLOCKER.

## Formato do parecer

Cada apontamento com ficheiro, linha, problema e **correcção proposta**. Severidade `BLOCKER` /
`MAJOR` / `NIT`. Veredicto: `APROVAR` / `APROVAR COM NITS` / `REJEITAR`. Merge só sem BLOCKERs.

«Parece-me bem» não é um parecer. Se não encontraste nada, diz o que verificaste e como.
