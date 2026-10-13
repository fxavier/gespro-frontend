# RUN: encomenda-editar
graph: feature   size: M   started: 2026-10-06
request: «O botão Editar que aparece numa encomenda em Rascunho ainda não abre nenhum ecrã. Cria o ecrã e implemente. Quando tudo terminar comita e abre PR.»
justification: rota /vendas/pedidos/[id]/editar em falta + contrato UpdateEncomendaSchema alargado (cliente e itens) → M; sem migração.
worktree: ../gespro-encedit  branch: feat/encomenda-editar-rascunho

## Decisões (omissões, sem pergunta)
- Rascunho edita-se por inteiro: cliente, vendedor, data prevista, notas e itens (substituição total das linhas, totais recalculados).
- Guarda atómica: a escrita só passa se o estado ainda for RASCUNHO dentro da tx (sem corrida com confirmar).
- Formulário: o mesmo de /novo, em modo edição (sem duplicar o componente).

## Verification
| command | purpose | last result |
| pnpm check (raiz) | prisma/tsc/eslint/vitest | baseline main: verde salvo 4 golden DFC/projecção (resíduo da base local, conhecido) |
| pnpm gates | gates de arquitectura | baseline: passam |
| pnpm test:integration (ficheiro) | serviço contra Postgres efémero | — |
| npx playwright test e2e/13-encomendas.spec.ts | ecrã real | — |

## Nodes
| id | node | skill | agent | inputs | outputs | blocked-by | parallel | loop | gate | status | iter |
| N0 | oráculo: integração + E2E | tdd | subagente verificador | este ledger | test/integration/encomenda-editar-rascunho.test.ts, e2e/13 caso novo | — | — | red | G1 (vermelho observado, SHA) | done | 1 |
| N1 | implementação: schema+serviço+action+página+form | tdd | executor (worktree) | N0 | código | N0 | — | red→green | G4 | done | 1 |
| N2 | revisão fresca | revisao-dois-eixos | code-reviewer | diff | veredicto | N1 | — | — | G5 | done | 1 |
| N3 | commit + PR | — | main | — | PR | N2 | — | — | G7 | done | 1 |

## Gates
| gate | node | verdict | evidence | decided by |

## Changes

## Gates (resultado)
| G1 | N0 | PASS | integração 4 vermelhos por comportamento em falta, 3 verdes de regressão; SHA em oraculo.sha256 | orquestrador |
| G4 | N1 | PASS | integração 7/7; tsc limpo; gates OK; SHA OK; E2E 13: 3/3 (porta 3111) | orquestrador (re-corrido) |
| G5 | N2 | PASS | code-reviewer fresco: sem BLOCKER/MAJOR; E2E 4/4 na 3108 | code-reviewer |
| G7 | N3 | apresentado | PR #375 | humano |
