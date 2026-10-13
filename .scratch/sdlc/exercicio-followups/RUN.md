# RUN: exercicio-followups (#363 #364 #365 #366)
graph: feature   size: L   started: 2026-10-05
request: «usando rtk plugin implement o seguinte: #363 abertura do exercício seguinte (diário AB); #364 aplicação do resultado (88 → 59); #365 arquivo em PDF; o balanço ainda não existe, nem o PDF da DRE; #366 registo de auditoria das mudanças de estado do exercício, um ano com resultado exactamente zero, a permissão de abrir exercício que o GESTOR recebeu sem ser pretendido, e um E2E com encerramento real. Quando um node ou worktree terminar faz commit e abre PR e avance ate terminar tudo.»
justification: 4 issues, várias migrações, cross-module (contabilidade, DFC, tesouraria, reconciliação, IVA, storage, PDF, UI) → L.
worktree: /Users/xavier/dev/code/workspace/2026/gespro-ex366 (branches empilhados P1→P6), base origin/main f39bdb4 (pilha #138 fundida).

## Verification
| command | purpose | last result |
|---|---|---|
| pnpm check | suite | 4 golden/sentinela vermelhos por resíduo da base local (igual no main) |
| pnpm gates | gates | 5/5 |
| vitest -c vitest.integration.config.ts | integração | 32/228 verdes (fim #138) |
| playwright e2e (servidor da worktree) | UI | — |

## Decisões (G1 — utilizador 2026-10-05)
- AB automático: encerrar N gera/regera AB em N+1 se existir; criar N+1 com N ≥ ENCERRADO_PROVISORIO gera-o; reabrir N estorna o AB de N+1 (recusa se N+1 tiver período FECHADO).
- AB transporta classes 1–5 + classe 8 com saldo (88; 89 não aceita lançamento).
- Aplicação: transfere todo o 88 → 59 no exercício seguinte (data da deliberação, referência da acta); distribuição posterior por lançamentos manuais.
- Balanço simples por classes (Activo = 1–3 + 4 devedores; CP = 5 + 88; Passivo = 4 credores), página + PDF + arquivo. Modelo NIRF → issue própria.
## Decisões (orquestrador)
- Leitores por DATAS excluem fecho e abertura (período 13 e diário ABERTURA) por um predicado único; vistas por PERÍODO usam o AB. Leitores: gerarBalancete (→DFC), razaoConta (datas), obterContaDetalhe, saldoContabilAte, projeção saldoTesourariaAte, reconciliação saldoRazao, importação (partidas do banco), apurarIva (agregação e 4438).
- «Tem AB» = lançamento LANCADO no diário AB do exercício, não estornado e não estorno.
- Lançamento manual: diário EN recusado; diário AB só no primeiro exercício (sem anterior).
- DFC: 59 → OP-00 (com 88): a aplicação 88→59 fica neutra numa linha.
- Ano de resultado zero: ids dos lançamentos de encerramento opcionais; SEM_RESULTADOS_A_APURAR deixa de existir.
- Aplicação activa bloqueia reabrir N; anularAplicacaoResultado (motivo) estorna-a.
- P6: tenant novo via /registo (e-mail/slug únicos; verifyEmail false; CAPTCHA none em dev; rate limit 3/h por IP — contornar no ambiente de teste); um lançamento 6/7 pela UI; meses 1–12 desse tenant fechados por SQL (pg, precedente 20-balancete; primeira escrita de spec na base, só no tenant novo); encerrar/reabrir/definitivo/AB/aplicação/downloads pela UI.
- Auditoria: tx.auditLog.create explícito (UPDATE ExercicioContabil before/after estado; CREATE EncerramentoExercicio/ReaberturaExercicio) com userId, keycloakSub, requestId.
- GESTOR: rbac restricted + migração DELETE RolePermission (Role isSystem, nome GESTOR, code financas:exercicio:abrir).
- Arquivo PDF depois do commit do encerramento (render fora da tx), chaves no EncerramentoExercicio.

## Nodes
| id | node | skill | agent | inputs | outputs | blocked-by | parallel | loop | gate | status | iter |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F1 | explore ×3 | — | Explore ∥ | issues | relatórios | — | ∥ | — | — | done | 1 |
| F2 | decisões | grilling lite | main | F1 | secção Decisões | F1 | — | — | G1 | done | 1 |
| P1 | #366a auditoria + resultado zero + GESTOR | tdd | oráculo → impl; migração orquestrador | F2 | PR #368 | G1 | serial (migração) | tdd | G4,G5,G6 | done | 3 |
| P2 | #363a leitores imunes ao AB + temAbertura + diários EN/AB manuais | tdd | oráculo → impl | P1 | PR #369 | P1 | serial | tdd | G4,G5 | done | 2 |
| P3 | #363b geração/estorno do AB + pré-condição §7 | tdd | oráculo → impl | P2 | PR #370 | P2 | serial | tdd | G4,G5 | done | 3 |
| P4 | #364 aplicação do resultado (+UI, 59→OP-00) | tdd | oráculo → impl; migração orquestrador | P3 | PR #371 | P3 | serial | tdd | G4,G5,G6 | done | 2 |
| P5 | #365 storage put + balanço + PDF DRE + arquivo | tdd | oráculo → impl; migração orquestrador | P4 | PR #372 | P4 | serial | tdd | G4,G5,G6 | done | 3 |
| P6 | #366b E2E encerramento real | tdd | oráculo E2E → impl | P5 | PR #374 | P5 | serial | tdd | G4,G5 | done | 2 |
| F10 | ship | — | humano | #368→#369→#370→#371→#372→#374 | merges | P6 | — | — | G7 | presented | — |

## Gates
| gate | node | verdict | evidence | decided by |
|---|---|---|---|---|
| L1 | P1 | PASS | 9 integração + 1 unit vermelhos | orquestrador |
| G4 | P1 | PASS | integração 33/236; gates 5/5; check só resíduo local; migração 20261005150000 aplicada, diff vazio | orquestrador |
| G5+G6 | P1 | PASS | APPROVE + 3 NITs aplicados | revisor fresco |
| L1 | P2 | PASS | 13 vermelhos, 2 guardas | orquestrador |
| G1 | F2 | PASS | 4 opções recomendadas escolhidas | utilizador |

## Changes
- 2026-10-05 P2 desvios aceites: (1) só o AB de exercício COM anterior é excluído (o AB manual do 1.º exercício é a fonte real dos saldos); (2) predicados em fora-de-fecho-e-abertura.ts (mocks fechados de contabilidade.service). razão/obterContaDetalhe/saldoContabilAte excluem só AB (mantêm 13); IVA só AB. P3 tem de pôr o AB no período 1 do exercício com anterior.
- CLAUDE.md (do utilizador): sugerir linha sobre FORA_DE_FECHO_E_ABERTURA no fecho da corrida.
- 2026-10-05 P2 → PR #369 (APPROVE+NITs). P3 → PR #370: REQUEST-CHANGES (BLOCKER ano a zero; MAJOR exclusão por anteriorId + re-encadeamento; logs) → exclusão re-chaveada na origem do AB automático (+ estorno carimbado), DOCUMENTO_ORIGEM_RESERVADO; re-revisão APPROVE. Follow-up: anterior ENCERRADO_PROVISORIO sem registo (dados crus) sem saída.
- 2026-10-05 P4 → #371 (APPROVE; migração restringida à omissão FIN-02; NITs). P5 → #372 (REQUEST-CHANGES: a11y ids, CPU→after(), byte-a-byte; re-revisão APPROVE; NITs). P6 → #374 (REQUEST-CHANGES: corrida com after() → poll+reload; aprovado após correcção; E2E verde). Follow-up #373 (limite /registo, resíduos, helpers). Migrações locais aplicadas: 20261005150000, 20261005170000, 20261005190000. Servidor 3116 parado.
