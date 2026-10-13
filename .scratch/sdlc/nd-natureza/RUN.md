# RUN: nd-natureza (#139 + #85)
graph: feature   size: M   started: 2026-10-06
request: resolver #139 (ecrã da conta por natureza de ND) e #85 (natureza gravada, conta resolvida no lançamento em vez de 711, factura de referência no formulário). Commit + PR por nó.
justification: 2 fatias, contratos de action/schema novos, sem migração (natureza/contaCreditoId já existem no schema).

## Decisões (omissões)
- P1 #139: /contabilidade/configuracoes/naturezas-nota-debito, uma linha por natureza, ComboboxRemoto filtrado pela classe admitida (6 p/ DESPESAS_REPERCUTIDAS, 7 restantes), «Sem conta» possível; permissão financas:configurar.
- P2 #85: EmitirNotaDebitoSchema ganha natureza (omissão ACERTO_PRECO) e contaCreditoId opcional (idEntidade). Conta = contaCreditoId validado ?? resolverContaNaturezaNotaDebito; nenhuma → CONTA_CREDITO_OBRIGATORIA. ND grava natureza+contaCreditoId. Lançamento: D 411 / C conta / C 44331 se IVA.
- Factura de referência: do tenant (senão NotFound), do mesmo cliente (FATURA_DE_OUTRO_CLIENTE), não RASCUNHO/CANCELADA (FATURA_NAO_REFERENCIAVEL).
- Fora: estorno no cancelamento de ND/NC (ADR-0039 §3), motivoIsencao (#329), ND de fornecedor, PDF/detalhe.

## Verification
| command | purpose | last result |
| pnpm check | prisma/tsc/eslint/vitest | baseline: 4 golden DFC/projecção vermelhos (resíduo da base local) |
| pnpm gates | arquitectura | baseline OK |
| vitest integração (ficheiros novos) | serviço | — |
| playwright e2e novos | ecrã | — |

## Nodes
| id | node | skill | agent | inputs | outputs | blocked-by | parallel | loop | gate | status | iter |
| O | oráculos P1+P2 | tdd | verificador | ledger | testes + sha | — | — | red | G1 | pending | 0 |
| P1 | #139 ecrã | tdd | executor ../gespro-nd139 | O | código | O | — | red→green | G4,G5 | pending | 0 |
| P2 | #85 emissão | tdd | executor ../gespro-nd85 (empilhado em P1) | O,P1 | código | P1 | serial (ficheiros partilhados: lib/nota-debito.ts, natureza-nota-debito.service.ts) | red→green | G4,G5 | pending | 0 |

## Gates
| gate | node | verdict | evidence | decided by |

## Changes
- 2026-10-06 P1 done → PR #376 (G4 re-corrido pelo orquestrador; G5 PASS com MINOR: conta inactiva sem aviso).
- 2026-10-06 P2 BLOCKED (iter 1): oráculo P2 23/23 verde, E2E 37+38 verdes, mas 2 duplos unitários antigos (serie-na-emissao, travao-emissao-verificacao) sem contaNaturezaNotaDebito/contaPGC. Reencaminhado ao verificador (dono dos testes), não ao implementador.
- 2026-10-06 P2 done → PR #377 (base feat/nd-139-config-natureza). G4 re-corrido: integração 30/30, unit só os 4 golden conhecidos; G5 PASS (MINOR: corrida ao trocar de cliente; E2E sem caminho de conta obrigatória/factura).

## Gates (resultado)
| G1 | O | PASS | P1 7/7 vermelhos, P2 22/23 vermelhos (1 de regressão); SHA | orquestrador |
| G4 | P1 | PASS | integração 7/7, tsc, gates, E2E 37 | orquestrador |
| G5 | P1 | PASS | code-reviewer | code-reviewer |
| G4 | P2 | PASS | integração 30/30, unit financas só golden conhecidos, E2E 37+38 | orquestrador |
| G5 | P2 | PASS | code-reviewer | code-reviewer |
| G7 | — | apresentado | PR #376, #377 | humano |
