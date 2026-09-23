# Grafo de execução — Spec 22 (Fluxo de Caixa)

> Doutrina: [`00-doutrina-loop-e-grafo.md`](./00-doutrina-loop-e-grafo.md).
> Prompts literais: [`prompts-22-fluxo-de-caixa.md`](./prompts-22-fluxo-de-caixa.md).
> Specs: [`.kiro/specs/22-fluxo-de-caixa/`](../../.kiro/specs/22-fluxo-de-caixa/).

## 1. Topologia

```
                    ┌─────────────────┐
                    │  orchestrator   │  (único a gerar migrações e a fazer merge)
                    └───┬─────────┬───┘
                        │         │
        ┌───────────────▼──┐   ┌──▼───────────────┐
        │   ÉPICO WS-1     │   │   ÉPICO WS-2     │  bloqueado até WS-1 integrado
        │  feat-tesouraria │   │     feat-dfc     │
        └───────┬──────────┘   └────────┬─────────┘
                │                       │
   ┌────────────▼────────────┐   ┌──────▼──────────────────┐
   │ L1 contratos            │   │ L9  contratos           │
   │ L2 núcleo puro   ◄──┐   │   │ L10 seed rubricas       │
   │ L3 saldo abertura   │   │   │ L11 núcleo puro   ◄──┐  │
   │ L4 agregações       │   │   │ L12 gerarDFC         │  │
   │ L5 CRUD/isolamento  │   │   │ L13 actions/export   │  │
   │ L6 actions          │   │   │ L14 UI               │  │
   │ L7 UI               │   │   │ L15 saída + HUMANO   │  │
   │ L8 saída            │   │   └──────┬───────────────┘  │
   └────────────┬────────┘   │          │                  │
                │            │          │                  │
        ┌───────▼────────────▼──┐  ┌────▼──────────────────▼┐
        │ verificador-fluxo-caixa│  │     code-reviewer      │
        │  (escreve o oráculo)   │  │  (veto por BLOCKER)    │
        └────────────────────────┘  └────────────────────────┘
```

Cada `Ln` é **um loop**: autor → verificador externo → devolução → paragem em 3 iterações.
As setas `◄──┐` marcam os loops onde o oráculo é um property test escrito por outro agente.

## 2. Os nós, um a um

| Nó | Agente | Objectivo (o que fica feito) | Verificador (o comando que decide) | Veto |
|---|---|---|---|---|
| **L1** | `feat-tesouraria` | Schema, Zod e interface do WS-1 (tasks 1.x) | `pnpm check` + `code-reviewer` | BLOCKER |
| **L2** | `feat-tesouraria` | Funções puras `montarBuckets`, `expandirRecorrencia`, `distribuirCompromissos`, `acumularSaldos` | `npx vitest run projecao.property.test.ts` (oráculo escrito por `verificador-fluxo-caixa` **antes**) | `I2`,`I3`,`I5` falhados |
| **L3** | `feat-tesouraria` | `saldoTesourariaAte`, `perfilAtraso` | `I1` contra balancete + `grep -c saldoAtual projecao.service.ts` == 0 | qualquer leitura de `saldoAtual` |
| **L4** | `feat-tesouraria` | Quatro agregações + `projetarTesouraria` | golden fixture `projecao-seed-demo.json` | desvio ao cêntimo |
| **L5** | `feat-tesouraria` | CRUD + isolamento multi-tenant | `pnpm test:integration` (`I4`) | cross-tenant ≠ 404 |
| **L6** | `feat-tesouraria` | RBAC + actions | `pnpm gates` (`gate-leitura`) | gate vermelho |
| **L7** | `feat-tesouraria` | UI `/tesouraria` | `pnpm build` + `pnpm e2e:a11y` | AA falhado, modal, `page.tsx` cliente |
| **L8** | `feat-tesouraria` | E2E, k6, doc corrigida | `pnpm e2e` + p95 < 400 ms | orçamento estourado |
| **L9–L15** | `feat-dfc` | Idem para a DFC (tasks 9.x–15.x) | ver tasks.md | `I6`…`I10`, `[HUMANO]` 15.3 |

## 3. Ordem obrigatória dentro de cada loop de núcleo puro (L2, L11)

Esta é a inversão que faz o grafo funcionar:

```
1. verificador-fluxo-caixa  escreve o property test do invariante   ─┐
2. orchestrator             confirma que o teste FALHA (vermelho)    │  o oráculo
3. feat-*                   implementa até passar                    │  existe antes
4. verificador-fluxo-caixa  confirma que git diff __tests__/ = ∅     ─┘  da solução
```

O passo 2 não é cerimónia: um property test que passa contra código inexistente está mal escrito, e
descobri-lo depois da implementação é descobri-lo tarde demais para servir de prova. O passo 4 fecha
a porta ao modo de falha mais comum — o autor a relaxar o teste para o código passar.

## 4. Condições de paragem

| Situação | Acção |
|---|---|
| 3 iterações falhadas no mesmo nó | O nó pára, escreve `docs/handoff/feat-22-fluxo-de-caixa.md` §Bloqueios com o que tentou e porque falhou, devolve ao orquestrador |
| `git diff` mostra alteração em `__tests__/` por um agente `feat-*` | BLOCKER imediato, revertido pelo orquestrador |
| Golden fixture alterada sem justificação escrita no PR | BLOCKER imediato |
| Invariante falha de forma **intermitente** | BLOCKER e escalada: é não-determinismo, provavelmente fuso horário ou `Decimal` vs `number` |
| `pnpm check` vermelho | O nó não entrega; não há revisão de código que não compile |
| Conflito de schema entre épicos | Não pode acontecer — são sequenciais. Se acontecer, o grafo foi violado |

## 5. Onde o grafo pode mentir, e o que o impede

| Risco de «disparate organizado» | O que o neutraliza |
|---|---|
| Autor e verificador concordam num invariante mal formulado | Os invariantes vêm dos ADRs, revistos por ti, **antes** de qualquer nó arrancar |
| Golden fixture gerada a partir da implementação | Fixtures apuradas a partir do seed demo, em L4/L12, com os números derivados à mão do balancete existente; `vitest -u` proibido nesse directório |
| Property test que aceita qualquer coisa | Passo 2 do §3: tem de falhar primeiro |
| E2E que passa porque não chega a testar nada | `qa-e2e` exige asserção sobre valores, não sobre presença de elementos |
| Classificação contabilística errada mas coerente | **Nada automático o apanha.** Task 15.3 `[HUMANO]` |

A última linha é a honesta: o grafo prova que o mapa fecha, não que está certo face ao Decreto
70/2009. Está registado no ADR-0037 §Consequências como risco aceite, com a mitigação humana
obrigatória antes de qualquer cliente real ver a DFC.

## 6. Arranque

```bash
# 1. worktrees (o repositório já tem 30 em wt/, todas ignoradas pelo git)
git worktree add wt/feat-tesouraria -b feat/22-tesouraria
git worktree add wt/feat-dfc        -b feat/22-dfc

# 2. base viva para os oráculos
docker compose up -d && pnpm db:migrate:dev && pnpm db:seed

# 3. abrir o épico WS-1 — prompt P0 em prompts-22-fluxo-de-caixa.md
```

> **Aviso sobre `wt/`**: a maioria dessas worktrees é pré-monorepo e tem o ERP em `<wt>/src/`, não
> em `<wt>/apps/erp/src/`. Qualquer agente que trabalhe aqui usa `git grep`/`rg` ou arranca a busca
> de `apps/erp/` — um `find` da raiz devolve o ficheiro certo no sítio errado, e editá-lo não dá
> erro nenhum: dá uma alteração que nunca chega ao produto (CLAUDE.md §Comandos).

## 7. Custo estimado

| Épico | Nós | Iterações típicas | Ordem de grandeza |
|---|---|---|---|
| WS-1 | 8 | 1–3 por nó | ~15–25 sessões de agente |
| WS-2 | 7 | 1–3 por nó | ~12–20 sessões de agente |
| Verificador | transversal | 1 por loop de núcleo | ~6 sessões |
| Humano (tu) | — | — | revisão dos 2 ADRs + task 15.3 + merges |

Se o número de iterações por nó passar consistentemente de 2, o problema é o spec, não os agentes:
pára o grafo e reabre o design.
