# Plano de Implementação: Fluxo de Caixa (Spec 22)

Depende de: WS D (Finanças) e spec 04 (Reconciliação Bancária) — ambos implementados.
Novas dependências cross-WS: leitura de `ContaPagar` (Compras) e `Payroll` (Pessoas) — **só leitura**,
sem alteração de schema nesses domínios.

Cada task é um **tracer bullet**: atravessa schema→serviço→teste→UI numa fatia fina e verificável, e
fecha com um comando que ou passa ou não passa. Uma task que não tenha critério executável não é uma
task — é um desejo.

Convenções: `[BLOCKING]` trava tudo o que vem depois. `[HUMANO]` não é executável por agente.
Nenhum agente gera migrações Prisma (só o orquestrador).

---

## WS-1 — Projecção de Tesouraria · agente `feat-tesouraria` · worktree `wt/feat-tesouraria`

- [ ] **1. Contratos** `[BLOCKING]`
  - [ ] 1.1 `CompromissoTesouraria` + enums `TipoCompromisso`, `RecorrenciaCompromisso` em `prisma/schema/financas.prisma` (design §2)
  - [ ] 1.2 `src/lib/validations/tesouraria.ts` — `FiltroProjecaoSchema`, `CompromissoSchema` (Criar/Atualizar/Filtro), `superRefine` do tecto horizonte×granularidade
  - [ ] 1.3 `src/server/services/financas/projecao.interface.ts` — tipos `Bucket`, `Ocorrencia`, `ProjecaoTesouraria`, `PerfilAtraso`, assinaturas das funções puras
  - [ ] 1.4 Publicar `docs/handoff/feat-22-fluxo-de-caixa.md` §Contratos e **parar** para revisão
  - ✅ Gate: `pnpm check` verde; `code-reviewer` sem BLOCKERs; migração `22a` gerada pelo orquestrador

- [ ] **2. Núcleo puro + property tests** `[BLOCKING]`
  - [ ] 2.1 `montarBuckets` (DIARIA/SEMANAL/MENSAL, fronteiras em `Africa/Maputo` via `diaCivilEmMaputo`)
  - [ ] 2.2 `expandirRecorrencia` (UNICA/MENSAL/TRIMESTRAL/ANUAL, `dataFimRecorrencia`)
  - [ ] 2.3 `distribuirCompromissos` (cenários; saídas nunca deslocadas)
  - [ ] 2.4 `acumularSaldos`
  - [ ] 2.5 `projecao.property.test.ts` — `I2`, `I3`, `I5` com fast-check
  - [ ] 2.5-bis Caso canónico do design §4.1-bis como **teste nomeado** no oráculo: mensal de `2026-01-31`, horizonte 150 → `31 Jan · 28 Fev · 31 Mar · 30 Abr · 31 Mai · 30 Jun`. Escreve-o o `verificador-fluxo-caixa`, nunca o `feat-tesouraria` — é território do oráculo. Verificado à mão no L2, mas verificação à mão não fica a guardar a regra
  - ✅ Gate: property tests verdes com ≥ 1000 execuções por propriedade; cobertura do módulo puro ≥ 95 %

- [ ] **3. Saldo de abertura e perfil de atraso**
  - [ ] 3.1 `saldoTesourariaAte` — Σ `saldoContabilAte` das contas bancárias activas + sessões `ABERTA`. **Proibido** ler `ContaBancaria.saldoAtual`
  - [ ] 3.2 `perfilAtraso` — média e desvio sobre facturas liquidadas ≤ 180 d; `< 20` ⇒ `amostraInsuficiente`
  - [ ] 3.2-bis Duas funções **puras** entram no contrato (`projecao.interface.ts`), ratificadas pelo orquestrador porque sem elas as regras R2.4 e ADR §10 não são falsificáveis senão no L4, tarde demais: `marcarVencidas(ocorrencias, dataReferencia): Ocorrencia[]` (anterior **estrito**; marca também SAÍDAS; não muta a entrada) e `calcularPerfilAtraso(atrasosBrutosDias: number[]): PerfilAtraso` (recebe os atrasos **crus**, possivelmente negativos, e trunca lá dentro — receber já truncado tornava a regra intestável)
  - [ ] 3.3 Teste `I1` (horizonte zero == balancete) contra o seed demo
  - [ ] 3.3-bis **R2.4 ganha verificador externo**: o teste de integração do L3 assere que uma ocorrência manual com data anterior à referência sai marcada `vencida: true`. O `expandirRecorrencia` devolve sempre `false` — a assinatura pura não recebe data de referência — e a re-marcação é do L3. Se o L3 se esquecer, nada parte: a ocorrência cai no primeiro bucket na mesma e só a degradação de cenário fica inoperante, com números plausíveis. É o perfil exacto da quase-perda da R3.4
  - [ ] 3.4-bis `saldoTesourariaAte` soma sobre `contaContabilId` **distintos**, não sobre `ContaBancaria` (ADR-0036 §2-bis). Uma conta PGC entra se ≥1 bancária ancorada nela estiver activa, e entra **uma vez, pelo saldo inteiro**. A ordem não é indiferente: **filtra `ativo: true` primeiro, desduplica depois**. Proibido `distinct` antes do filtro — o representante arbitrário pode ser a bancária inactiva e a conta sai do âmbito, de forma não-determinista. O código já constrói `contaIds` assim (`:504`); o defeito é o loop de soma (`:528`) iterar `contasAtivas`
  - [ ] 3.4-ter **Oráculo da 3.4-bis, escrito pelo `verificador-fluxo-caixa` e nunca pelo `feat-*`**: caso com **duas** bancárias activas na mesma conta PGC ⇒ o saldo conta **uma** vez. Sem isto a 3.4-bis pode ser implementada mal e o I1 continua verde — a fixture actual nunca tem duas activas na mesma conta, logo não falsifica a duplicação. Re-derivar também o lado direito do I1 por `contaContabilId` distintos e corrigir o comentário do teste que invoca a letra revogada do §2
  - [ ] 3.4-quater Corrigir o docstring de `saldoTesourariaAte` (`:483-487`), que cita a letra revogada do §2 como se fosse lei
  - [ ] 3.5-bis **[verificador]** Teste nomeado do alias: duas `ContaBancaria` activas ancoradas na mesma `ContaPGC` ⇒ o saldo dessa conta entra **uma vez**. Não há caso no seed, logo sem este teste a regra não tem guardião
  - ✅ Gate: `grep -n "saldoAtual" projecao.service.ts` devolve zero linhas

- [ ] **4. Agregações e orquestração**
  - [ ] 4.1 Agregação de `Fatura` a receber (estados e valor conforme R2.1)
  - [ ] 4.2 Agregação de `ContaPagar` (R2.2)
  - [ ] 4.3 Agregação de `Payroll` PROCESSADO com fallback de data (R2.3)
  - [ ] 4.4 Agregação de `CompromissoTesouraria` + expansão
  - [ ] 4.5 `projetarTesouraria` — `Promise.all`, pipeline do design §4.1, `primeiroDiaNegativo`, `menorSaldoProjetado`
  - [ ] 4.6 Vencidos no primeiro bucket, assinalados (R2.4)
  - [ ] 4.8 **[verificador]** Actualizar o oráculo do L3 para chamar `perfilAtraso(ctx, dataReferencia)` e **só então** tornar o parâmetro obrigatório. O L4 deixou-o opcional com `new Date()` por omissão para não tocar no oráculo — correcto, mas o default repõe o defeito que a ratificação fechava: quem chamar `perfilAtraso(ctx)` volta a ter um segundo relógio na mesma projecção
  - [ ] 4.9 **[verificador]** O **§12** (último dia útil do payroll) não tem caso vivo: o seed demo só tem `Payroll` `PENDENTE`, logo a fixture não o exercita. Teste nomeado com `Payroll` `PROCESSADO` e `dataPagamento` nula, num mês cujo último dia caia a sábado e noutro a domingo
  - [ ] 4.6-bis A golden fixture `projecao-seed-demo.json` contém pelo menos uma ocorrência vencida, com a bandeira `vencida` asserida e a exclusão PESSIMISTA (> 90 dias) exercitada — senão a fixture prova o caminho feliz e mais nada
  - [ ] 4.7 Ao guardar `perf/explain/22-projecao.sql`, olhar em concreto para o índice `[tenantId, dataPrevista, ativo]`: a chave de intervalo vem antes da de igualdade, e a forma canónica seria `[tenantId, ativo, dataPrevista]`. É o índice literal do design §2 — só se muda com o custo de filtro à vista no plano, nunca por teoria
  - ✅ Gate: golden fixture `projecao-seed-demo.json` bate ao cêntimo

- [ ] **5. CRUD de compromissos + isolamento**
  - [ ] 5.1 `criar`/`atualizar`/`eliminar` (soft delete), `tenantId` explícito em todos os `findFirst`/`update`
  - [ ] 5.0 **Fecha a 4.8**: `perfilAtraso(ctx, dataReferencia: Date)` perde o `?` e o `new Date()` por omissão. O verificador já actualizou o último chamador sem data (`acd1488`), por isso o default deixou de ter justificação — e enquanto existir, quem chamar `perfilAtraso(ctx)` volta a ter um segundo relógio na projecção. Uma linha em `projecao.interface.ts` e outra em `projecao.service.ts`
  - [ ] 5.2-bis Activar o teste em skip de `test/integration/tesouraria-tenant-sintetico.test.ts` (compromisso MENSAL a atravessar o horizonte) — depende de `criarCompromisso`, que é desta task
  - [ ] 5.1-quinquies `ExpandirRecorrenciaFn` declara no docstring que devolve as ocorrências em **ordem cronológica ascendente**. A implementação emite assim e os casos nomeados do §4.1-bis asserem listas ordenadas, mas o contrato nunca o disse — uma reordenação futura partiria os testes sem violar contrato nenhum
  - [ ] 5.1-quater Decidir `PaginacaoTesouraria.total?` — nenhum requisito nem o design §2 o pedem, e o contrato não diz quem o preenche. Ou passa a ter consumidor e contrato escrito, ou sai do `projecao.interface.ts`
  - [ ] 5.1-bis `atualizarCompromisso` reimpõe **R3.4** contra o registo existente quando só uma das datas vem no input — o `superRefine` do Zod não a apanha, porque não conhece o registo. Teste com os dois casos: só `dataPrevista` movida para depois do `dataFimRecorrencia` gravado, e só `dataFimRecorrencia` movida para antes da `dataPrevista` gravada; ambos `ValidationError`. No mesmo `superRefine`, `recorrencia: 'UNICA'` com `dataFimRecorrencia` preenchida — hoje ninguém a apanha, e é a mesma classe de defeito da R3.4
  - [ ] 5.1-ter `obterCompromisso(id, ctx)` no `IProjecaoService` — a rota `[id]/editar` (7.4) carrega por id e o `listarCompromissos` não serve; extensão aditiva do contrato do L1, molde `ICaixaService.obterSessao`
  - [ ] 5.2 Teste de integração cross-tenant → `NotFoundError` (`I4`)
  - ✅ Gate: **linha de base por identidade**, não «suite verde» — `pnpm test:integration` está vermelho por motivo alheio ([issue #67](https://github.com/fxavier/gespro-frontend/issues/67)). Passa se: (a) o bloco de sanidade correu, provando que a suite não passou vazia; (b) os testes que falham são **exactamente** os nomes registados em `docs/handoff/feat-22-fluxo-de-caixa.md` §Linha de base — por nome, não por contagem: uma corrigida e outra nova dão o mesmo total; (c) o ficheiro do nó corre isolado e passa

- [ ] **6. Actions e permissões**
  - [ ] 6.0 **Um teste, uma suite** — `projecao.tenant.test.ts` (o I4) sai de `src/**/__tests__/` e passa a viver em `test/integration/`, como os outros seis. Hoje salta no projecto `unit` por falta de `INTEGRATION_DB_URL` e aparece como 1 ficheiro / 9 testes **permanentemente saltados** no `pnpm check` — que é o gate de quase todos os nós, e um skip permanente num gate deixa de ser lido ao fim de duas semanas. Remover também a entrada avulsa do `include` em `vitest.integration.config.ts`, que passa a ser desnecessária. **Gate:** `pnpm check` com **zero** skips e o ficheiro a correr no `test:integration`
  - [ ] 6.1 `financas:tesouraria:leitura` e `:escrita` em `prisma/seed/rbac.ts`, ligadas aos papéis
  - [ ] 6.2 `tesouraria.actions.ts` via `createSafeAction`; consultas com `permiteEmLeitura: true`; `revalidate` declarado
  - [ ] 6.2-bis `superRefine` de `dataFim` ≥ `dataInicio` no `FiltroCompromissoSchema` — hoje um intervalo invertido devolve lista vazia sem dizer porquê
  - ✅ Gate: `pnpm gates` verde (`gate-leitura` em particular); `pnpm db:seed` corrido para ligar as permissões

- [ ] **7. UI `/tesouraria`**
  - [ ] 7.1 `page.tsx` SC + filtros em searchParams (`<Suspense>` à volta de `useSearchParams`)
  - [ ] 7.2 `tabela-buckets.tsx` e `grafico-projecao.tsx` ('use client'); tabela é a fonte
  - [ ] 7.3 `aviso-ambito.tsx` — limite do âmbito visível na página (R7.4)
  - [ ] 7.4 Rotas de compromissos (listagem/novo/editar) sem modais; `AlertDialog` só para eliminar
  - [ ] 7.4-bis Datas do formulário construídas por `new Date(ano, mes-1, dia, 12)` a partir do `<input type="date">` — `new Date('aaaa-mm-dd')` lê como UTC e a leste de Greenwich cai no dia anterior, mudando o bucket
  - [ ] 7.5 Entradas em `AppSidebar`, `Breadcrumbs`, `CommandPalette`
  - [ ] 7.6 Saldo negativo destacado sem depender só da cor
  - ✅ Gate: `pnpm build` (standalone) verde; `pnpm e2e:a11y` AA nos dois temas

- [ ] **8. Verificação de saída do WS-1**
  - [ ] 8.1 `e2e/14-tesouraria.spec.ts` — criar compromisso recorrente → ver reflectido nos buckets → eliminar
  - [ ] 8.2 `perf/k6/22-projecao.js` + `perf/explain/22-projecao.sql`; p95 < 400 ms em `perf-medio`
  - [ ] 8.3 Requisito 14 — corrigir `docs/DOCUMENTACAO.md:93,104,165`
  - ✅ Gate de épico: `pnpm check` + `pnpm gates` + `pnpm e2e` + orçamento p95; `code-reviewer` sem BLOCKERs

---

## WS-2 — Demonstração de Fluxos de Caixa · agente `feat-dfc` · worktree `wt/feat-dfc`

> **Bloqueado por WS-1 integrado.** Partilham `financas.prisma` e `CompromissoTesouraria.rubricaId`.

- [ ] **9. Contratos** `[BLOCKING]`
  - [ ] 9.1 `RubricaFluxoCaixa`, `MapeamentoContaFluxo`, enums `AtividadeFluxo`/`SinalFluxo`/`OrigemRubrica`; relação em `CompromissoTesouraria.rubricaId`
  - [ ] 9.2 `src/lib/validations/fluxo-caixa.ts`
  - [ ] 9.3 `dfc.interface.ts` — `DFC`, `SeccoesDFC`, `VariacaoClassificada`, `ContaNaoMapeada`
  - [ ] 9.4 Handoff §Contratos-DFC e **parar** para revisão
  - ✅ Gate: `code-reviewer` sem BLOCKERs; migração `22b` gerada pelo orquestrador

- [ ] **10. Seed de rubricas e mapeamento**
  - [ ] 10.1 `semearRubricasFluxo()` isolada, chamada por `tenant-bootstrap.ts`, idempotente
  - [ ] 10.2 Tabela de mapeamento das contas folha do PGC padrão (`plano-contas-pgc.json`)
  - [ ] 10.3 Recusa de eliminação de rubrica `SISTEMA` → `RUBRICA_DE_SISTEMA`
  - [ ] 10.4 Teste em `src/server/provisioning/__tests__/tenant-bootstrap.test.ts`: tenant novo ⇒ zero contas não mapeadas
  - ✅ Gate: `tenant-bootstrap.test.ts` verde; re-executar o bootstrap não duplica rubricas

- [ ] **11. Núcleo puro da DFC + property tests** `[BLOCKING]`
  - [ ] 11.1 `classificarVariacoes(balanceteIni, balanceteFim, mapa)`
  - [ ] 11.2 `montarSeccoesDFC(resultadoLiquido, variacoes)`
  - [ ] 11.3 `verificarArticulacao` — lança `DFC_NAO_ARTICULA` com delta em `details`
  - [ ] 11.4 `dfc.property.test.ts` — `I6` e `I8` com fast-check
  - ✅ Gate: property tests verdes ≥ 1000 execuções; um caso deliberadamente desarticulado **tem** de lançar

- [ ] **12. `gerarDFC` e impedimentos**
  - [ ] 12.1 `contasNaoMapeadas(periodoId)` — todas de uma vez, nunca uma de cada vez
  - [ ] 12.2 `gerarDFC` na ordem do design §4.2; `provisorio` conforme estado do período
  - [ ] 12.3 Teste `I9` — resultado líquido idêntico ao `gerarDRE` do mesmo período
  - [ ] 12.4 Golden fixture `dfc-seed-demo.json` (exercício do `pnpm db:seed`)
  - ✅ Gate: fixture bate ao cêntimo; conta desmapeada de propósito ⇒ `impedimentos` e nenhum mapa

- [ ] **13. Actions, exportação, permissões**
  - [ ] 13.1 `financas:fluxo-caixa:leitura` e `:configurar` no RBAC
  - [ ] 13.2 `fluxo-caixa.actions.ts`; `gerarDFCAction` com `permiteEmLeitura: true`
  - [ ] 13.3 `api/contabilidade/dfc/export/route.ts` via `withApi` (CSV + PDF), marca provisório
  - ✅ Gate: `pnpm gates` verde; export em modo Leitura funciona (GET)

- [ ] **14. UI DFC e rubricas**
  - [ ] 14.1 `/contabilidade/dfc` SC com `seletor-periodo` reutilizado
  - [ ] 14.2 `impedimentos-painel.tsx` — lista accionável, cada linha liga à conta
  - [ ] 14.3 `/contabilidade/fluxo-caixa/rubricas` — gestão e reatribuição, sem modais
  - [ ] 14.4 Navegação nos três sítios; badge «Provisório»
  - ✅ Gate: `pnpm build` verde; `e2e:a11y` AA nos dois temas

- [ ] **15. Verificação de saída do WS-2**
  - [ ] 15.1 `e2e/15-dfc.spec.ts` — desmapear conta → ver impedimento → mapear → gerar → exportar
  - [ ] 15.2 Confirmar `gate-periodo` a zero (a DFC é só leitura de `Lancamento`)
  - [ ] 15.3 **`[HUMANO]` Validação contabilística** da tabela de mapeamento semeada face ao Decreto
        70/2009, por contabilista moçambicano. Registar o parecer em `docs/handoff/feat-22-fluxo-de-caixa.md`.
        **Nenhum gate verde substitui esta task** (ADR-0037 §Consequências).
  - ✅ Gate de épico: tudo verde + parecer humano registado

---

## Ordem de merge (determinística, pelo orquestrador)

```
1.x → revisão → migração 22a → 2.x…8.x → merge WS-1 → integração verde
                                              ↓
                          9.x → revisão → migração 22b → 10.x…15.x → merge WS-2
```

Nenhum ramo do WS-2 arranca antes do merge do WS-1 estar verde na branch de integração.
