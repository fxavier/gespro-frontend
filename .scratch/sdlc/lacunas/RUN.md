# RUN: lacunas (docs/sistema/08-lacunas-conhecidas.md)
graph: bug+feature (por issue)   size: L   started: 2026-10-07
request: «resolva todas as lacunas em aberto usando multiagentes em paralelo; quando um node/worktree terminar commita, abre PR e marca a lacuna como resolvida; autónomo, perguntas de alinhamento se houver dúvida; sempre rtk».
justification: ~110 issues abertas, cross-módulo → ondas.

## Decisões do utilizador (2026-10-07)
- Ondas por gravidade A → M → B; parar no fim de cada onda para merges.
- 4 worktrees em paralelo.
- Documento: um PR de documentação por onda (riscar resolvidas, acrescentar novas, corrigir #85 #139 #147 #363–#365).
- Decisões de produto/contabilísticas: orquestrador escolhe a opção conservadora, regista no ledger e no PR. [HUMANO] (#337, #338) fora.

## Onda 1 — gravidade A
#76 #79 #80 #81 #332 #317 #318 #86(+#266) #91 #92 #94 #95 #96 #97 #98 #99

## Verification
| command | purpose | last result |
| pnpm check | tsc/eslint/vitest | baseline: 4 golden DFC/projecção vermelhos (resíduo da base local) |
| pnpm gates | arquitectura | OK |

## Triagem (T1–T4, main f5ea8c6) — todas presentes; #86/#266 parcial (tecto do servidor já existe)

## Decisões conservadoras do orquestrador (registadas também em cada PR)
- #76: permissão de consulta por MÓDULO num layout.tsx por módulo + um só mapa rota→permissão que alimenta a barra lateral; página «Sem permissão» partilhada. Sub-recursos finos ficam para depois.
- #98: dois COUNT inline (ADR-0027 §3); tenant sem Assinatura = sem limite; nunca bloquear desactivar/downgrade.
- #99: FECHADA comercial → sessão restrita só a quem gere a subscrição, redireccionada para /definicoes/faturacao; fechado pela GestPro (deletedAt) continua terminal; nenhum endpoint público novo.
- #317: recusar só crédito (parte a crédito do POS + factura a crédito) a cliente não ATIVO; venda a pronto continua.
- #318: crédito utilizado DERIVADO dos saldos em aberto das facturas (sem contador armazenado); limite = aviso, não bloqueio.
- #79: derivar na leitura (filtro «vencidas» inclui VENCIDA, KPI com PARCIALMENTE_PAGA/VENCIDA por valorRestante, dia de Maputo); sem cron.
- #80: secção «Stock por localização» no detalhe do produto (listarSaldos com nomes e stockBaixo).
- #81: item JUSTIFICADO não é ajustado; limiar e aprovador saem do cliente; nova permissão inventario:contagens:aprovar-discrepancia (aprovador = ctx.userId).
- #86/#266: procurarFaturasCreditaveis esconde facturas sem saldo creditável e mostra o saldo; vendas/notas-credito/nova passa a usá-la.
- #91+#92 (um nó): totais da sessão derivados dos movimentos (função pura que exclui ABERTURA/FECHAMENTO); tesouraria lê movimentos das sessões abertas; golden da spec 22 re-derivada pelo VERIFICADOR; sessões já fechadas sem backfill.
- #94: aprovar/rejeitar ausência (nova permissão rh:ausencias:aprovar), motivoRejeicao gravado; folha não recalculada automaticamente (aviso na UI).
- #95: benefícios na folha — proventos tributáveis e todos os descontos; não tributáveis ficam de fora com nota (motor sem canal isento).
- #96: pagamento da folha por meio (resolverContaMeioPagamento), data efectiva, diário SALARIOS mantido, PAGAMENTO na caixa; sem migração.
- #97: cabeçalho do mapa INSS neutro (sem taxas fixas).
- #332: ADR-0042 (Proposto) com opções inventário periódico vs perpétuo/custo médio — SEM código (L, decisão contabilística; marcar Aceite é humano).

## Faixas (4 em paralelo; dentro da faixa, empilhado e em série — escritas partilhadas)
- A (porta 3121): #91+#92 → #79 → #80 → #98   (caixa/projecção; compras; stock.service partilhado por #80/#98)
- B (porta 3122): #95 → #96 → #97             (payroll.service partilhado)
- C (porta 3123): #317 → #318 → #86/#266      (venda/faturacao.service partilhados)
- D (porta 3124): #94 → #81 → #99 → #76 → #332-ADR  (rbac.ts; auth.ts/layout partilhados por #99/#76)
Por item: setup worktree → oráculo (verificador) → implementador → revisor fresco (≤2 voltas) → commit+PR («Closes #N»).

## Nodes
(ver workflow; estado actualizado no fim)

## Gates
| gate | node | verdict | evidence | decided by |

## Changes
- 2026-10-07 Onda 1 lançada: workflow wf_7f0ca4e9-e88 (4 faixas A–D, 16 issues em 15 nós; #332 só ADR).

## Onda 1 — resultado (2026-10-07)
15/15 nós com PR e G5 PASS; tudo no main: #381 #382 #383 #384 #385 #386 #388 #389 #390 #391 #392 #393 #394 #395 #396 (o #387 ficou preso num branch intermédio → reaberto como #396). Docs: PR #399.
Aviso de segurança do workflow (oracle-fix #317, «Security Test Removal») investigado: falso positivo — só duplos alargados com status/deletedAt. Varredura dos 15 PRs: remoções de asserções em #381/#386/#384/#390/#392 são substituições equivalentes ou mais fortes (integração).
main após merges: tsc OK, gates OK, vitest só os 4 golden conhecidos; integração completa em curso.
Seguimentos abertos: #397, #398. Permissões novas (rh:ausencias:aprovar, inventario:contagens:aprovar-discrepancia) exigem `pnpm db:seed` nos tenants existentes.

## Onda 1b — gravidade A aparecida depois do documento
#208 #294 #295 #296 #329 #331 #335 #336 #352 #356 #397 #398 — triagem em curso.
Integração completa no main pós-onda-1: 54 ficheiros, 525 testes verdes.

### Onda 1b — decisões conservadoras
- #208: recusar PRORATA_NAO_SUPORTADO para QUALQUER linha de saída a 0% (Factura e ND) a partir de 2026; compras inalteradas; exportadores também recusados (recusar > número errado, ADR-0034 §4).
- #294: neutralizar fórmulas com prefixo ' em células de texto (toCsv) e nas rotas CSV feitas à mão (mapas IVA, INSS, IRPS); colunas numéricas intactas.
- #295: lista binária conta a conta da classe 4 (ambíguas 441/4435/445/446 ficam DEVEDORA e documentadas); migração de dados natureza+tipo só onde o valor ainda é o do seed; golden DFC re-derivada (só sinais) pelo verificador; o PR pede validação do contabilista.
- #296: o serviço já está resolvido (#347); falta a lista do formulário excluir descendentes (helper idsDescendentes).
- #329: verificação motivoIsencaoEmFalta nos núcleos de emissão (Factura/NC/ND, formulários pedem o motivo); POS/troca/devolução preenchem um texto legal fixo a partir do regime do tenant; sem migração.
- #331: tranca FOR UPDATE da NC reutilizada; códigos NC_JA_LIQUIDADA vs NC_CANCELADA; série própria TROCA (prefixo TRC) com SERIES_INICIAIS + 2 migrações (ADD VALUE; INSERT para tenants existentes).
- #335: FORA — decisão fiscal/legal (numeração fora de ordem); lacuna aceite no ADR-0041 §9 mantém-se.
- #336: hash de integridade encadeado por série só em Factura/FR (sha256 do documento + hash anterior da série, sob a tranca da série); sem QR; documentos antigos ficam null.
- #352: schemas da regra de comissão com inicioDoDia/fimDoDia + predicado por dia civil de Maputo (cobre linhas antigas sem migração).
- #356: compare-and-set (updateMany com estado) em gravarEstornoEmTx e marcarDeclarado; sem índice único.
- #397+#398 (um nó): analytics deriva o saldo de caixa dos movimentos (prismaBase.groupBy + totaisSessaoCaixa) e usa inicioDoDiaCivilMaputo + ABERTA/PARCIALMENTE_PAGA/VENCIDA.
### Faixas 1b
- A (3121): #329 → #336 → #331 (núcleos de emissão, devolução/troca)
- B (3122): #208 → #356 → #296 → #295 (apuramento/contabilidade)
- C (3123): #294 → #352
- D (3124): #397+#398
- 2026-10-07 Onda 1b lançada: workflow wf_becd4c0f-937 (11 issues em 10 nós; #335 fora).
- 2026-10-07 Onda 1b (wf_becd4c0f-937): OK #329→PR405, #208→PR401, #356→PR404, #294→PR402, #352→PR403, #397+#398→PR400 (todos fundidos). #403 e #404 ficaram presos em branches intermédios → reabertos como #406 e #407. 4 nós caíram por limite de sessão (#336 oracle, #331 setup, #296 review, #295 setup).
- 2026-10-07 Script mudado: PRs SEMPRE com base main (dependência anunciada no corpo) e worktree reutilizada faz merge de origin/main — elimina os merges presos. Relançados #336→#331 e #296→#295: wf_7e36d706-8a9.
- 2026-10-08 Relançamento (wf_7e36d706-8a9): #296 → PR #408 (inclui o commit do #356 = PR #407; fazer merge do #407 primeiro). Limite semanal cortou review de #336/#295 e setup de #331 → retomado (resume, cache).
- 2026-10-08 Onda 1b fechada: #336→PR409, #295→PR410, #331→PR411 (aberto), #296→PR408. Todos os outros no main. Varredura de testes: só #410 removeu asserções (caso positivo do E2E 20 deixou de ter dados após a correcção da natureza — legítimo, cobertura unitária mantém-se). Docs: PR #413. Novo seguimento A: #412 (devolução sem reembolso aceita NC CANCELADA).
- Próximo: onda 2 (gravidade M) depois dos merges de #411 e #413.

## Onda 2a (gravidade M, lote 1 de ~3) — 2026-10-08
Sem triagem separada (orçamento): o verificador confirma presença (JA_RESOLVIDA → pára) e escolhe a opção conservadora quando houver decisão, registada no PR.
- A (3121, segurança/API): #190+#191 → #194+#195 → #196 → #198
- B (3122, RBAC — rbac.ts partilhado): #181 → #299 → #113 → #100
- C (3123, vendas/caixa): #412(A) → #132 → #270 → #146
- D (3124, RH): #155 → #272 → #157 → #156
Fechar à mão (resolvidas, abertas por merges em branches intermédios): #82 #83 #84 #86 #98 #147 #266 #363.
- 2026-10-08 Onda 2a lançada: wf_ec005404-369 (16 issues em 16 nós; PRs sempre com base main).
- 2026-10-08 Onda 2a: 15/16 PR (#414–#428); #100 JA_RESOLVIDA (nenhum código pede compras:*:ver; menu refeito pelo #394). 13 no main; abertos #427 (#156), #428 (#146). Varredura: 0 remoções/skips. Seguimentos: #429 (tenants sem Assinatura vs crons), #430 (limite S3 ADR-0017 §1).

## Onda 2b — 2026-10-08
- A (3121, compras): #108 → #109 → #110 → #111
- B (3122, vendas/POS): #129 (resto) → #130 → #322 → #327
- C (3123, plataforma): #176 → #179 → #177 → #178
- D (3124, inventário/relatórios/faturação): #119 → #300 → #112 → #235
- 2026-10-08 Verificação do main pós-2a: migrações OK, tsc OK, unit só os 4 golden; INTEGRAÇÃO 2 falhas em pos-contabilidade-ponta-a-ponta (PRORATA_NAO_SUPORTADO com linha POS a 0%) — conflito do teste antigo com a decisão do #208/PR #401 (cada PR passou a sua revisão; nenhum correu a suite inteira). Verificador a adaptar o teste (PR próprio) mantendo a cobertura + caso novo da recusa.
- Lição: a partir do lote 2c, o implementador corre a suite de integração COMPLETA antes de DONE.
- 2026-10-08 Regressão corrigida no PR #431 (só o teste: venda E a 16%, caso novo F prova a recusa a 0%); integração completa 74 ficheiros / 690 testes verdes.
- 2026-10-08 Lote 2b cortado pelo limite de sessão (13/29 agentes); retomado (resume wf_8b989a37-c9c) já com a exigência da suite de integração completa.
- 2026-10-08 Lote 2b: 12 PRs (#432–#443); #112 JA_RESOLVIDA (SEGMENTOS_ESTATICOS no @panel). Cortados pelo limite: #111 review, #322 review, #327 setup → retomado (resume).
- 2026-10-08 #322 → PR #444. Cortados de novo: #111 (ship), #327 (fix1) → retomado.
- 2026-10-08 Lote 2b final: #111 → PR #446; #176 ganhou correcção PR #447 (formulário único); os restantes já estavam no main (oráculos re-corridos deram JA_RESOLVIDA). #327: worktree actualizada pelo orquestrador (stash/merge/pop) e relançada sozinha: wf_41f3082b-8f2.
- 2026-10-08 #327 → PR #448. Lote 2b fechado (varredura limpa). 

## Lote 2c — 2026-10-08 (agentes com rtk explícito)
- A (3121, produção + compras): #166 → #165 → #164 → #445
- B (3122, activos + formulários): #117 → #118 → #101+#265
- C (3123, RH/payroll/comissões): #158 → #159 → #131
- D (3124, projectos/tickets/POS): #167 → #169 → #128 → #267
Fora deste lote (decisão de desenho, ADR): #333 (conta de vendas por artigo), #334 (integração contabilística diferida do POS). Seguimentos abertos: #429, #430.
- 2026-10-08 Docs onda 2: PR #449. Resolvidas mas abertas no GitHub (humano fecha): #82 #83 #84 #86 #266 #98 #147 #363 #100 #112 (#327 após #448).
- 2026-10-08 main pós-#448/#449: migrações OK, tsc OK, gates OK, integração 87/87 (833 testes). Unit: 4 golden conhecidos + extracto.parser.test.ts por TIMEOUT (5s) — também falha com src/lib/reporting anterior ao #436 e no caso CSV → carga da máquina (lote 2c a correr); re-verificar com a máquina livre.
- 2026-10-08 Lote 2c (wf_edb4346f-5bf): PR #452 (#166, traz migração aditiva gerada no nó — 3 colunas anuláveis; adoptada conscientemente, verificar migrate diff vazio no main), #451 (#117), #455 (#118), #450 (#158), #454 (#159), #453 (#167), #456 (#169). Cortados pelo limite: #165 review2, #164/#445/#267 setup, #101+#265 e #128 impl, #131 review → retomado.
- 2026-10-09 Lote 2c: #165→#458, #164→#461, #445→#463 (aberto), #131→#460, #128→#459, #267→#462, #169 também #457; tudo o resto no main. #101+#265: worktree actualizada pelo orquestrador (conflito em vendas.actions.ts resolvido mantendo as duas actions; prisma generate; tsc limpo; stash wip-101 removido, stashes do utilizador intactos) e relançado: wf_f6301283-acc.
- 2026-10-09 #101+#265 → PR #464; conflito com o main (imports em compras.actions.ts após #463) resolvido pelo orquestrador juntando os dois lados; tsc + gates verdes; push; CI em curso. Lote 2c fechado em código. Por fazer: verificação do main + PR de docs do 2c; ADRs #333/#334; seguimentos #429 #430; onda 3 (gravidade B).
- 2026-10-09 Pedido do utilizador: #145 (menu DRE/Centros de Custo/Contas Bancárias) + #465 nova (desactivar/reactivar conta bancária — desbloqueia reconciliação com 121 partilhada) → wf_c1523693-166, 2 faixas paralelas.
- 2026-10-09 #145 → PR #466; #465 → PR #467 (ContaBancaria entrou em AUDIT_MODELS).
- 2026-10-09 Utilizador autorizou fechar issues resolvidas: fechadas #82 #83 #84 #86 #266 #98 #147 #363 #100 #112 #280 #281 #283 #284 #285 #286 (com comentário e PR). Ficam abertas: #282 (balancete/nova ainda em localStorage) e PRD #279 (comentado).

## Onda 3 — gravidade B (2026-10-09), ~65 issues em ~4 lotes
### Lote 3a
- A (3121, UI transversal): #102+#103 → #104 → #105+#106 → #107
- B (3122, compras/inventário): #114+#115 → #116 → #120+#121+#122+#123 → #124
- C (3123, vendas/faturação): #154+#259 → #134+#135 → #136 → #241
- D (3124, contabilidade): #142 → #143 → #144 → #298
- 2026-10-09 Lote 3a: 16/16 PRs (#471–#486), varredura limpa; #471 e #472 já no main. Migrações: #475 (financeiro_abrir_exercicio; #478/#480 arrastam-na por empilhamento) e #485 (rbac_inventario_ativos) — mesmo carimbo 20261009120000, nomes distintos, ordenam por nome. Seguimento do #107: o parágrafo do CLAUDE.md sobre transitar* lançar Error cru fica desactualizado (passa a BusinessRuleError TRANSICAO_INVALIDA) — corrigir no PR de docs da onda 3.
- 2026-10-10 Lote 3a todo no main (#471–#486). Fechadas à mão #102 #103 (o Closes não disparou).
### Lote 3b
- A (3121, API/cron — with-api partilhado): #186+#201 → #187+#188+#189 → #197 → #192
- B (3122, RH): #160 → #161+#275 → #162 → #163
- C (3123, UI/plataforma): #182 → #183+#184 → #185 → #202+#180
- D (3124, produtos/stock/caixa/UI): #125+#207 → #126 → #150 → #345
- 2026-10-10 Lote 3b: 14 PRs (#487–#500); #161+#275 JA_RESOLVIDA (PR #421); #162 parou na volta de correcção (tsc do main vermelho). HOTFIX: main vermelho no tsc por junção má #481×#483 (merge 9200517) em movimentacoes/page.tsx + linha duplicada em listarMovimentos que sobrepunha o grupo TRANSFERENCIA → PR #501; oráculo #121 alinhado pelo verificador com o contrato do #106 (decisão do orquestrador).
- 2026-10-10 Fechadas #161 #275 (já pelo #421). Main ainda vermelho (#501 por fundir) → lote 3c parte do ramo do #501 (lane.base), PRs com base main e dependência anunciada.
### Lote 3c
- A (3121, projectos): #168 → #170 → #172 → #175
- B (3122, transporte/tickets/plataforma): #171 → #174 → #173 → #429
- C (3123, contabilidade/IVA/vendas): #282+#301 → #343 → #199 → #328
- D (3124, RH/documentos/armazenamento): #162 → #200 → #193 → #430
Ficam para 3d: #325 #326 (refactors), #330 #373 (testes). Fora: #333 #334 #335 #337 #338.
- 2026-10-10 #501 e lote 3b (#487–#500) todos no main (verificado com merge-base). Verificação completa do main em curso.
- 2026-10-10 Main pós-3b: tsc OK, gates OK, migrações OK. Integração: 1 falha cruzada #479×#486 (fixture do teste #107 sem codigo, agora exigido pelo #116) → PR #506 (só teste; suite inteira 120/120, 1211 testes). Unit: 4 golden conhecidos + dfc.property e extracto.parser por TIMEOUT de 5 s com load average 25–49 (lote 3c a correr) — ambiental.
- 2026-10-10 Lote 3c: 13 PRs (#502–#505, #507–#515), varredura limpa, sem migrações (#511 resolve o #193 pelo mapeamento de permissão de leitura, sem rbac.ts); #170 JA_RESOLVIDA (detalhes criados no 2c). PR #506 = fixture do teste #107. Cortados pelo limite: #429 (oracle), #328 (review) → retomado (resume wf_e97db0f0-574).
- 2026-10-10 Lote 3c todo no main (#502–#515) + #506. Retoma de #328/#429 em curso.
### Lote 3d (último de código)
- A (3121, núcleos de faturação — faturacao.service partilhado): #325 → #326
- B (3122, testes): #330 → #373
- 2026-10-10 #429 → PR #516 (migração 20261010120000_assinatura_tenants_anteriores + seed do demo; seguimentos: seed de volume perf-* sem Assinatura; trialFim mostrado em ATIVA). #328 → PR #517.
- 2026-10-10 Lote 3d: #330→PR #518, #325→PR #519, #326→PR #520, #373→PR #521 (bandeira RATE_LIMIT_REGISTO_DESLIGADO revista pelo orquestrador: só fora de NODE_ENV=production e só no registoLimiter, provado por teste). Varredura limpa, sem migrações. Seguimentos: resíduo histórico de 17 745 ContaPGC órfãs na base local (SQL de limpeza única); 7 E2E com urlBaseDados local; playwright webServer.url fixo na 3000; CLAUDE.md desactualizado sobre construirLancamentoVendaPOS (#326) e transitar* (#486) → PR de docs da onda 3.
