---
description: Executa um nó de um grafo de engenharia com o loop completo INSPECT→DONE
argument-hint: <grafo> <nó>   ex.: reconciliacao matching · nota-debito modelo
---

# Nó de grafo

Argumentos: **$ARGUMENTS**

## Despacho

1. Parte os argumentos em `<grafo>` e `<nó>`. Se vier **um só token**, o grafo é `reconciliacao`
   e o token é o nó (compatibilidade com a forma antiga `/no matching`).
2. Lê `.claude/grafos/<grafo>.md`. Se não existir, lista o conteúdo de `.claude/grafos/` e **pára**.
3. Confirma que `<nó>` está na tabela desse ficheiro. Se não estiver, lista os nós válidos com o
   estado de cada um e **pára**.
4. Lê a secção «Leitura obrigatória» do grafo, inteira, antes de qualquer outra coisa.
5. Verifica as dependências do nó na tabela. Se um nó de que este depende não estiver `FEITO` nem
   tiver handoff em `docs/handoff/`, diz isso e **pára** — não o implementes de passagem.

**O âmbito é SÓ o nó pedido.** Não abras os nós seguintes, mesmo que pareçam triviais ou necessários
para testar. O que faltar regista-se no handoff.

## Loop — uma fase de cada vez, com critério de saída explícito

| Fase | O que fazes | Critério de saída |
|---|---|---|
| **INSPECT** | Lê o ADR, o requisito nas secções do nó, e o código que já existe — incluindo o que ele faz mal | Lista escrita do que existe, do que falta e das estruturas disponíveis |
| **PLAN** | Desenho da solução. **Sem escrever código** | Plano com ficheiros a criar/alterar e a assinatura de cada função |
| **IMPLEMENT** | Código | Compila |
| **TEST** | Testes primeiro onde houver invariante declarado (skill `tdd`). Property tests para regras puras, Prisma mockado para serviços | Testes verdes |
| **REVIEW** | Skill `revisao-dois-eixos`, **em subagente novo, sem o contexto de quem implementou**. Eixo 1: convenções (`prisma-conventions`, `api-conventions`, `ui-conventions`). Eixo 2: fidelidade ao ADR e ao requisito | Lista de achados — ou «nenhum». Não inventes achados para parecer diligente |
| **FIX** | Corrige o que a revisão apanhou | Cada achado fechado ou justificado por escrito |
| **VERIFY** | `pnpm check && pnpm gates` **da raiz** | Ambos verdes |
| **DONE** | Handoff em `docs/handoff/<grafo>-<nó>.md` e actualização da coluna «Estado» na tabela do grafo | O que entregaste, o que ficou por fazer, o que o nó seguinte assume |

Não avances de fase sem o critério de saída cumprido. Se VERIFY falhar, volta a FIX; ao fim de
**3 voltas** sem verde, PÁRA e explica o que está a bloquear em vez de tentar uma quarta.

Diz-me o resultado de INSPECT antes de passar a PLAN.

## Armadilhas deste repositório

- O ERP está em `apps/erp/`. As 30 worktrees em `wt/` são **pré-monorepo**: usa `git grep`/`rg`,
  nunca `grep -r`/`find` da raiz, ou editas ficheiros fantasma que nunca chegam ao produto.
- **Não corras `prisma migrate dev`** — exige TTY e rebenta em ambiente não-interactivo. Migrações
  são do orquestrador; se precisares mesmo, usa o `migrate diff` não-interactivo do `CLAUDE.md`.
- Depois de `prisma generate`, reinicia o `pnpm dev` (`touch apps/erp/next.config.ts`).
- Toda a query filtra por `tenantId`; cross-tenant devolve `NotFoundError` (404), nunca 403.
- Dinheiro em `Prisma.Decimal`, nunca `number`. Taxas em `Decimal(9,6)` como fracção.
- Documentos transaccionais (facturas, lançamentos, movimentos) são append-only: corrigem-se com
  documento compensatório, nunca com `UPDATE` dos valores.
- Coluna lida por um predicado de decisão precisa de escritor em produção e de teste da transição
  (skill `estado-com-escritor`). Não fabriques estado por `INSERT` directo num teste.
- `pnpm check` não apanha erros de runtime RSC nem formulários que se recusam a submeter. Se o nó
  tocar em UI, faz também smoke autenticado ou `pnpm e2e`.
