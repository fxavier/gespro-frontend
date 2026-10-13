# RUN: fatura-pdf-pagamento
graph: feature   size: M   started: 2026-10-06
request: «Descarregar PDF» do menu ⋯ da lista de facturas não ligado; no detalhe só aparecia com ficheiro guardado; não há botão para registar pagamento nem marcar vencida — facturas ficam Emitida. Commit + PR por nó.
justification: 3 fatias; contrato de RegistarPagamentoFaturaSchema muda (meio + lançamento); sem migração.

## Decisões
- Utilizador: pagamento COM lançamento (D meio / C 411, numerário também na caixa); vencida por botão manual.
- Detalhe: o botão PDF já aparece sempre (#133 fechada) — só a lista está por ligar.
- Pagamento: sem modelo novo — o lançamento (origem PAGAMENTO, documentoOrigemTipo 'Fatura') é o registo. Meio via resolverContaMeioPagamento (molde: liquidarNotaCredito DEVOLUCAO), permissões por meio iguais (caixa:operar / financas:banca:escrita). Recusa valor > pendente (PAGAMENTO_EXCEDE_SALDO) e data anterior à emissão. Rota /faturacao/[id]/pagamento.
- Vencida: serviço recusa antes do dia seguinte ao vencimento (Maputo) — FATURA_NAO_VENCIDA; AlertDialog no detalhe.

## Verification
| command | purpose | last result |
| pnpm check | tsc/eslint/vitest | baseline: 4 golden DFC/projecção vermelhos (base local) |
| pnpm gates | arquitectura | OK |
| integração / E2E por nó | — | — |

## Nodes
| id | node | skill | agent | inputs | outputs | blocked-by | parallel | loop | gate | status | iter |
| O | oráculos P1-P3 | tdd | verificador | ledger | testes + sha | — | — | red | G1 | pending | 0 |
| P1 | PDF no menu da lista | tdd | executor ../gespro-fat-pdf | O | PR | O | ‖ P2 (escritas disjuntas: faturas-table.tsx) | red→green | G4,G5 | pending | 0 |
| P2 | registar pagamento c/ lançamento | tdd | executor ../gespro-fat-pag | O | PR | O | ‖ P1 | red→green | G4,G5 | pending | 0 |
| P3 | marcar vencida | tdd | executor ../gespro-fat-ven (empilhado P2) | O,P2 | PR | P2 | serial (detalhe + serviço partilhados) | red→green | G4,G5 | pending | 0 |

## Gates
| gate | node | verdict | evidence | decided by |

## Changes
- 2026-10-06 G1 PASS (O): P1 vermelho por leitura (item sem destino), P2 17/21 vermelhos, P3 3/8 vermelhos; P3 oráculos guardados em p3-oraculo/ até à worktree fat-ven.
- 2026-10-06 P1 done → PR #378. G4: tsc/eslint/gates, E2E 39 2/2 (3114); G5 PASS (MINOR: oráculo não afirma «não navegou»; /faturacao sem gate de faturacao:leitura — pré-existente).
- 2026-10-06 P2 G4 PASS (integração 30/30, tsc, gates, E2E 40). G5 → MAJOR: seed demo-contabilidade chaveia recebimentos por documentoOrigemTipo 'Recebimento' → recebimento a dobrar no próximo db:seed. Rota de falha: implementador (iter 2) corrige o seed por origem + NIT PERM; verificador acrescenta PERIODO_FECHADO, VENCIDA pagável e (se viável) teste de idempotência do seed.
- 2026-10-06 P2 done → PR #379 (iter 2; G5 MAJOR seed corrigido, provado por seed-recebimento-idempotente vermelho→verde). P3 worktree ../gespro-fat-ven empilhada em P2.
- 2026-10-06 P3 done → PR #380 (base feat/fatura-p2-pagamento). G4: integração 8/8 (+P2 31/31), E2E 40+41; G5 PASS (MINOR: E2E 41 nos dias 1–2 do mês; resíduo de facturas no demo).

## Gates (resultado)
| G1 | O | PASS | vermelhos observados nas 3 fatias; SHA | orquestrador |
| G4/G5 | P1 | PASS/PASS | E2E 39; revisão | orquestrador / code-reviewer |
| G4/G5 | P2 | PASS/PASS (iter 2) | integração 34/34, seed 2× sem recebimentos novos; MAJOR seed corrigido | orquestrador / code-reviewer |
| G4/G5 | P3 | PASS/PASS | integração 8/8, E2E 41 | orquestrador / code-reviewer |
| G7 | — | apresentado | PR #378, #379, #380 | humano |
