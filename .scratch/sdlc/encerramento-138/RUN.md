# RUN: encerramento-138
graph: feature   size: L   started: 2026-10-05
request: «usando rtk resolve a issue: Encerramento do exercício (ADR-0035) não implementado; período 13 sem lançamentos mas exige apuramento (#138). Quando um node ou worktree terminar faz commit e abre PR e depois avanca ate terminar a resolucao da issue. Use sempre rtk»
justification: schema + migração de dados do plano + permissões + serviço + UI; >5 fatias → L. Corrida limitada ao núcleo (decisão do utilizador).
worktree: /Users/xavier/dev/code/workspace/2026/gespro-enc138 (um worktree, branches empilhados N1→N5). Ledger vive no checkout principal.

## Verification
| command | purpose | last result |
|---|---|---|
| pnpm check | suite | só os 4 golden da base local (runs #89/#354) |
| pnpm gates | gates | 5/5 |
| pnpm test:integration (ficheiro do nó) | L1/G4 | — |
| pnpm e2e (N5) | UI | — |

## Decisões (G1 — utilizador, 2026-10-05)
- Âmbito: núcleo (N1–N5). Follow-ups: abertura AB do exercício seguinte, aplicação do resultado 88→59, arquivo PDF (balanço e PDF da DRE não existem; storage sem `put`).
- Lançamento 1: regra da DRE (calcularLinhasDRE): 82 = 69 + 78; 81 = resto das classes 6/7 (inclui 67/79); 81 e 82 transferem para 83 no mesmo lançamento. Lançamento 3 salda 83 e 85 (851, 852) para 88.
- (orquestrador) Pré-condição «balanço de abertura lançado ou primeiro exercício» → «sem exercício anterior, ou anterior ≥ ENCERRADO_PROVISORIO» enquanto a abertura AB não existir; abertura implícita (ADR-0040) dá os saldos.
- (orquestrador) Sem PRD/to-issues: o ADR-0035 é o spec; fatias vivem neste ledger (pedido autónomo do utilizador).

- (orquestrador, N2) DFC: 81/82/83/88 → OP-00; 59 → FIN-02 (I7 exige rubrica para toda a conta que aceita lançamento).
- (orquestrador, N2) **Requisito para N3**: os lançamentos de encerramento têm data 31/12 → mapas por DATAS (gerarDRE, DFC/gerarBalancete «desde sempre», razão?) têm de excluir os lançamentos do período ordem 13, senão a DRE do ano dá resultado 0. O balancete por períodos já tem `incluir13`.

## Exploração (F1)
- fecharPeriodo :1763 — 7 impedimentos; IVA_NAO_APURADO :1869 sem excepção para ordem 13; janelas de data (2,3,4) sobrepõem p12.
- apurarIva :266 sem guarda de ordem; página IVA mostra «Apurar» no p13.
- resolverPeriodo :267 nunca resolve p13 (data → AAAA-MM).
- Achados A/B/C do ADR-0033 corrigidos (FILTRO_LANCAMENTO_MAPA, DRE sem pontos).
- Plano: 59/81/82/83/88 aceitaLancamento=false, sem filhas; 851/4411 folhas; 85 tem 851+852.
- Permissões: só financas:exercicio:abrir (GESTOR recebe-a sem querer — follow-up).
- Storage: só presign/delete; sem PDF de DRE/balanço; sem balanço.
- Auditoria: AUDIT_MODELS + CRITICAL_ENTITIES em audit-extension.ts, teste audit-extension.test.ts.
- gate-periodo: escrita em Lancamento só em contabilidade.service.ts.

## Nodes
| id | node | skill | agent | inputs | outputs | blocked-by | parallel | loop | gate | status | iter |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F0 | preflight | — | main | repo | baseline | — | — | — | G0 | done | 1 |
| F1 | explore | — | Explore ×3 ∥ | ADR-0035 | secção acima | F0 | ∥ | — | — | done | 1 |
| F2 | decisões | grilling (lite) | main | F1 | secção Decisões | F1 | — | — | G1 | done | 1 |
| N1 | período 13 fecha sem IVA; apurarIva recusa p13 | tdd | oráculo A → implementador B | ADR-0035 §2/§7 | PR #359 | G1 | — | tdd | G4,G5 | done | 2 |
| N2 | plano + permissões + schema + máquina de estados + CONTEXT/ADR | tdd | oráculo → implementador; migração pelo orquestrador | N1 | PR #360 (base N1) | N1 | serial (migração, rbac) | tdd | G4,G5,G6 | done | 3 |
| N3 | encerrarExercicio provisório | tdd | oráculo → implementador | N2 | PR #361 (base N2) | N2 | serial (contabilidade.service) | tdd | G4,G5 | done | 2 |
| N4 | reabrir exercício + encerramento definitivo | tdd | oráculo → implementador | N3 | PR #362 (base N3) | N3 | serial | tdd | G4,G5 | done | 2 |
| N5 | UI + actions + E2E | tdd | oráculo E2E → implementador | N4 | PR #367 (base N4) | N4 | serial | tdd | G4,G5 | done | 2 |
| F10 | ship | — | humano | PRs #359→#360→#361→#362→#367 | merges | N5 | — | — | G7 | presented | — |

## Gates
| gate | node | verdict | evidence | decided by |
|---|---|---|---|---|
| G1 | F2 | PASS | âmbito núcleo + mapa DRE escolhidos (AskUserQuestion) | utilizador |
| L1 | N1 | PASS | periodo-13-encerramento: 4 vermelhos (IVA_NAO_APURADO, RECONCILIACAO/SESSAO, apurarIva resolve), 2 verdes | orquestrador |
| G4 | N1 | PASS | sha OK; integração 13/13; check só 4 golden; gates 5/5 | orquestrador |
| L1 | N2 | PASS | 32 vermelhos (bandeiras JSON, máquina 16 pares, permissões, auditoria), 7 guardas verdes | orquestrador |
| G4 | N2 | PASS | sha OK (+ duplo-config-dfc sincronizado pelo oráculo); check só 4 golden; gates 5/5; integração 30/30 ficheiros (200 testes); migração aplicada, diff vazio | orquestrador |
| G5+G6 | N2 | PASS | APPROVE; MAJOR docs (neutralidade OP-00 pelo tipo; EM_ENCERRAMENTO) corrigidos; NITs tipo Prisma + contaId na fotografia | revisor fresco |
| L1 | N3 | PASS | 9/9 vermelhos (serviço inexistente), setup pelos serviços reais; caso 9 endurecido e mutação (FORA_DO_PERIODO_13={}) → «expected '0.00' to be '670.00'» | orquestrador |
| G4 | N3 | PASS | sha OK; oráculo 9/9 ×3; integração 31 ficheiros/209; check: 4 ficheiros golden (3 testes — o 3.º é resíduo local da migração N2 na sentinela V1; idêntico no main com a mesma base; CI semeia depois da migração); gates 5/5 | orquestrador |
| G5 | N3 | PASS (iter 2) | REQUEST-CHANGES → BLOCKER fixture DFC (corrigido no N2: 46b72ec, verificado em base fresca) + PERIODO_13_FECHADO, EM_FALTA, documentoOrigemTipo, logs; oráculo +7 casos (16) | revisor fresco |
| L1 | N4 | PASS | 9/9 vermelhos; +3 casos (estorno genérico EN ×2 vermelhos; data/série verde) | orquestrador |
| G4 | N4 | PASS | integração 32/228; gates 5/5; check só resíduo local | orquestrador |
| G5 | N4 | PASS (iter 2) | APPROVE; MAJOR estorno genérico de EN → LANCAMENTO_DE_ENCERRAMENTO | revisor fresco |
| L1 | N5 | PASS | E2E 4/5 vermelhos (link/rota inexistentes), a11y vermelho; caso 5 redesenhado (não destrutivo); bug de locator has: corrigido pelo oráculo | orquestrador |
| G4 | N5 | PASS | E2E 6/6 ×3, a11y 3/3; next build OK; gates 5/5; tsc 0; check só resíduo local | orquestrador |
| G5 | N5 | PASS | APPROVE c/ NITs (aplicados) + guarda anti-destrutiva no E2E | revisor fresco |
| G7 | F10 | apresentado | 5 PRs empilhados; follow-ups #363–#366 | humano |
| G5 | N1 | PASS | APPROVE; MINORs UI (detalhe/apurar/TEXTOS_RECUSA) + NITs aplicados (iter 2) | revisor fresco |

## Changes
- 2026-10-05 N1 → PR #359 (base main). Follow-ups anotados: ADR-0035:137 («já exigidas para os treze») desactualizado; GESTOR recebe financas:exercicio:abrir; reabrirPeriodo p13 com IVA DECLARADO legado (mensagem).
- 2026-10-05 N2 → PR #360 (base N1). Migração 20261005120000 aplicada na base local (orquestrador). Pós-merge: pnpm db:seed; revalidar mapeamento DFC.
- 2026-10-05 N3: sentinela dfc-golden (V1) falha localmente após a migração N2 (mapeamentos novos depois da v1 semeada). CI não afectada (migrate deploy em base vazia → seed). Limpeza local: re-semear o tenant demo.
- 2026-10-05 N3 follow-up: ano com 6/7 a somar exactamente zero e estimativa 0 → SEM_RESULTADOS_A_APURAR (lancamentoLiquidoId obrigatório) — decisão de produto.
- 2026-10-05 N4 requisito: reabrirPeriodo de um mês de exercício ENCERRADO_PROVISORIO tem de recusar.
- 2026-10-05 N2 adenda 46b72ec (fixture golden 435→440, verificador spec 22, base fresca com relógio fixo). N3 → PR #361; N4 → PR #362. Local: pnpm db:seed corrido (permissões ADMIN demo). Follow-ups: AuditLog das transições do ExercicioContabil (prismaBase); ano de resultado zero.
- 2026-10-05 N5 → PR #367. Follow-ups: #363 (abertura AB), #364 (aplicação do resultado), #365 (PDF/balanço/storage put), #366 (AuditLog transições, ano resultado zero, GESTOR abrir, E2E sucesso). Servidor 3115 parado.
