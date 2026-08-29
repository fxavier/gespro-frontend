# Handoff — w8-desempenho (ADR-0018, spec 20 §3)

**Estado:** fase 1 parcial. A campanha local «fase A» (instância única) correu e está triada;
a campanha final contra a pilha (2 instâncias atrás do proxy) fica para ordem posterior do
orquestrador. Última actualização: 2026-08-22.

> **Medição LOCAL (ADR-0026):** todos os números deste documento valem como **grandeza
> relativa** (que consulta é 10× mais lenta, se um índice melhorou, se houve regressão) e
> **não** como valores absolutos de produção. O «tenants por instância» sairá daqui como
> ordem de grandeza, reconfirmada quando houver produção.

## 1. Estado por task

| Task | Estado | Nota |
|---|---|---|
| 3.1 seed de volume (ADR-0018 §2) | **Feita e verificada** | Aritmética confirmada contra a BD — ver §2 |
| 3.2 perfil 50 tenants | Gerador pronto; **seed multi por executar** | Executa-se na fase B (capacidade/3.9); `VOLUME_PROFILE=multi pnpm db:seed:volume` |
| 3.3 seis cenários k6 | Feita | 7.º (autenticação) é fase 2 pós-Keycloak, por decisão registada em `perf/README.md` |
| 3.4 primeira execução + baseline versionada | **Parcial** | Fase A corrida (resultados em disco, não versionados — ver §3); `baseline-pre-keycloak.json` só se versiona com a campanha da pilha |
| 3.5 confirmar/ajustar SLOs por escrito | **Preliminar** — ver §7 | Fecho na fase B |
| 3.6 EXPLAIN (ANALYZE, BUFFERS) top-20 + triagem | **Feita** | §4; saídas versionadas em `perf/explain/` |
| 3.7 índices `CREATE INDEX CONCURRENTLY` à mão | **Feita** | `perf/sql/proposed-indexes.sql`, testados na BD de volume com antes/depois (§5) |
| 3.8 job `perf` no CI (limiar 20 %) | Feita | `.github/workflows/perf.yml` + `compare-baseline.mjs` permissivo sem `baseline.json` |
| 3.9 tenants por instância | **Pendente (fase B)** | Exige pilha (2 instâncias) + perfil multi |
| 3.10 cache ADR-0014 justifica-se? | **Respondida preliminarmente com dados** — ver §8 | Reconfirmar depois das correcções de consulta |

## 2. Task 3.1 — a aritmética do volume (100k vs 250k: não há défice)

A linha do ADR-0018 §2 «**Lançamentos contabilísticos e partidas — 250 000**» conta-se nas
**partidas** (é o que o próprio ADR §3 diz do cenário: «agregação sobre 250 000 partidas»).
O gerador produz, por tenant à escala 1:

- 100 000 lançamentos × ~2,5 partidas = **250 000 partidas**, assim: débito principal em
  todos (100 000) + débito secundário nos ímpares (50 000) + crédito em todos (100 000).

Verificado na BD de volume (contagens reais; os deltas acima do seed são escrita da própria
campanha fase A):

| Entidade | ADR §2 | Na BD | |
|---|---|---|---|
| Produtos + variantes | 5 000 | 4 000 + 1 000 | ✅ |
| Clientes | 2 000 | 2 000 | ✅ |
| Vendas | 120 000 | 122 046 | ✅ |
| Movimentos de stock | 400 000 | 404 089 | ✅ |
| **Partidas** (lançamentos) | **250 000** | **254 005** (101 335 lanç.) | ✅ |
| Facturas | 60 000 | 61 335 | ✅ |
| Colaboradores × meses | 80 × 24 | 1 920 payrolls de seed | ✅ |
| Auditoria | ~1 000 000 | 1 000 000 | ✅ |

O manifesto do seed passa a registar um bloco `derivadosPorTenant` com esta aritmética
(`prisma/seed/volume/index.ts`), para a confusão não se repetir. **Os números da fase A
foram medidos sobre o volume correcto do ADR** — não eram cenário optimista.

## 3. Fase A — resultados e validade

Alvo: build de produção standalone, 1 instância local, BD de volume (`perfil pme`).
JSON completo em `perf/results/campanha-local-fase-a.json` (**só em disco** — `perf/results/`
não é versionado por decisão do `.gitignore`; a linha de base versionável nasce na fase B).

| Operação | p95 (ms) | SLO prov. | Veredicto |
|---|---|---|---|
| POS venda ponta-a-ponta | 135 | < 1 500 | ✅ |
| Emissão de factura | 286 | < 1 200 | ✅ |
| PDF de factura | 330 | < 3 000 | ✅ |
| Payroll (80 colab.) | 458 | lote | ✅ |
| Export XLSX | 3 579 | < 3 000 | ⚠️ limítrofe |
| Listagem mov. stock | 6 919 | < 800 | ❌ 8,6× |
| Mov. stock página funda | 13 252 | < 800 | ❌ 16,6× |
| Razão de conta | 13 227 | < 3 000 | ❌ **medição inválida — ver D2** |
| Balancete | 56 004 | < 3 000 | ❌ 18,7× |

**Validade das medições — três correcções de leitura importantes:**

1. **A razão de conta nunca executou a consulta.** A página passa datas *string* ao serviço;
   o Prisma rejeita antes de emitir SQL; o `catch` da página devolve um cartão de erro com
   HTTP 200; o cenário k6 só verifica status 200. Prova: `pg_stat_statements` regista 30
   lookups de `ContaPGC` e **zero** consultas de partidas com `contaId`. Os 13,2 s medidos
   são congestão de event loop causada pelos balancetes concorrentes — **a razão tem de ser
   re-medida depois da correcção D2**.
2. **O balancete da fase A correu sem filtro de datas** (defeito D1: o `safeParse` da página
   falha e cai no default sem datas) — varreu as 250k partidas. Com datas varreria ~126k:
   continuaria a falhar o SLO. O problema de fundo é o D3 (agregação em JS), não o volume.
3. Os 18,7× do balancete **não são explicáveis por «medição local»**: são 6,1 s de consulta
   + transferência de 250k linhas + hidratação de 250k `Decimal` no Prisma + agregação em JS
   **por pedido**, em fila numa única instância Node. Causa arquitectural, não ambiental.

## 4. Task 3.6 — EXPLAIN (ANALYZE, BUFFERS) e triagem

Método: `pg_stat_statements` da fase A (top-20 por tempo médio, colapsado em 20 **formatos**
de consulta), re-executados com `EXPLAIN (ANALYZE, BUFFERS)` sobre a BD de volume com
parâmetros reais. Saídas integrais versionadas em `perf/explain/qNN-*-{antes,depois}.txt`.
Tempos «quente» = média do `pg_stat_statements` da campanha; «frio» = EXPLAIN isolado.

| # | Consulta | Sintoma | Causa raiz | Triagem |
|---|---|---|---|---|
| Q01 | Balancete (capturada, sem datas) | 6 086 ms/chamada, **250 009 linhas devolvidas** | `gerarBalancete` faz `findMany` de todas as partidas e agrega em JS | **Reescrever (D3)** — seq scan aceite: a consulta pede tudo |
| Q02 | Balancete com datas (pretendida) | 317 ms na BD, 125 732 linhas | Idem; datas nunca chegam (D1) | **Reescrever (D1+D3)** |
| Q03 | Balancete **reescrito em SQL** (`GROUP BY contaId, tipo`) | **89 ms, 60 linhas** | — | Prova da reescrita: ~70× na BD; elimina a hidratação de 250k linhas |
| Q04 | Razão de conta (pretendida) | 42 ms, 3 342 linhas | Nunca correu na fase A (D2) | **Corrigir página (D2)**; consulta em si OK com índices existentes; seq scan do `Lancamento` no hash join aceite (~50 % de selectividade) |
| Q05 | Mov. stock 1.ª página (`LIMIT 51`) | 46 ms frio / 232 ms quente; Parallel Seq Scan + top-N sort de 404k | **Índice em falta** — nenhum começa por `(tenantId, createdAt)` | **Índice I1** → 0,76 ms |
| Q06 | Mov. stock página funda (capturada) | 534 ms na BD, **204 088 linhas devolvidas** | Cursor Prisma com `orderBy` não-único emite SQL **sem LIMIT** (take em memória) — D4 | **Reescrever (D4)** + I1 |
| Q07 | Mov. stock keyset (proposta) | com I1: **0,6 ms** a 200 000 de profundidade | — | Prova da reescrita D4 |
| Q08 | `ItemVenda WHERE vendaId=$1` (include POS) | 614 ms frio / 17,6 ms quente × 2 038 chamadas; seq scan 244k | **Índice em falta** — `(tenantId, vendaId)` inutilizável: o include do Prisma filtra só pela FK | **Índice I2** → 0,11 ms |
| Q09 | `PagamentoVenda WHERE vendaId=$1` | 443 ms frio / 9,9 ms quente × 2 038; seq scan 122k | Idem | **Índice I3** → 0,12 ms |
| Q10 | `LinhaFatura WHERE faturaId IN (...)` | 556 ms frio / 12,8 ms quente × 2 664; seq scan 122k | Idem | **Índice I4** → 0,17 ms |
| Q11 | Export XLSX: cursor histórico **sem LIMIT** | 3,9 ms mas devolve ~3 000 linhas/chamada | D4 (sistémico) | **Reescrever (D4)**; índice existente cobre |
| Q12 | Histórico 1.ª página | 7,6 ms | Índice `(tenantId, clienteId, dataTransacao)` OK | Aceite |
| Q13 | Clientes ordenados por nome, take ~1000 | 19 ms frio / 5,1 ms quente × 2 375 | Índice OK; o `take 1000` é a dor (D6) | Aceite (índice); rever take |
| Q14 | Produtos activos por nome (POS) | 28 ms frio / 2,9 ms quente; seq+top-N de 4k | Tabela pequena | **Aceite com justificação** — ganho marginal |
| Q15 | `SerieDocumento` numeração atómica | 20,4 ms quente × 3 370 | Espera de lock `FOR UPDATE` — serialização **intencional** (numeração sem lacunas) | **Aceite com justificação**; é o tecto de débito de emissão por série |
| Q16 | Factura por id | 0,9 ms | pkey | Aceite |
| Q17 | Auditoria (1M linhas), lista recente | 20 ms frio | Index Scan Backward `(tenantId, createdAt)` | Aceite |
| Q18 | Vendas por data | 1,8 ms | Índice OK | Aceite |
| Q19 | Facturas por data de emissão | 23 ms frio | Índice OK | Aceite |
| Q20 | Diário: lista 2,4 ms + `COUNT(*)` do paginador 52 ms | COUNT index-only de 101k por página | Custo conhecido do count exacto | Aceite por agora; se doer, count aproximado/cacheado |

## 5. Task 3.7 — índices propostos, com ganho medido

Ficheiro: **`perf/sql/proposed-indexes.sql`** (CREATE INDEX CONCURRENTLY à mão, com
justificação por índice e a lista de seq scans *aceites*). **Nada foi tocado em
`prisma/schema/**` nem em migrations** — os donos dos domínios adicionam os `@@index`
equivalentes e o orquestrador gera a migration com este SQL. Criação dos 4 na BD de volume:
~12 s no total.

| Índice | Consulta | Antes | Depois | Ganho |
|---|---|---|---|---|
| I1 `MovimentoStock(tenantId, createdAt, id)` | Q05 lista | 46 ms (232 sob carga) | **0,76 ms** | ~60× |
| I1 + reescrita keyset (D4) | Q07 página funda | 3 519 ms quente | **0,6 ms** | ~5 900× |
| I2 `ItemVenda(vendaId)` | Q08 | 614 ms frio / 17,6 quente | **0,11 ms** | ~160× quente |
| I3 `PagamentoVenda(vendaId)` | Q09 | 443 / 9,9 ms | **0,12 ms** | ~80× quente |
| I4 `LinhaFatura(faturaId, ordemLinha)` | Q10 | 556 / 12,8 ms | **0,17 ms** | ~75× quente |

Honestidade sobre a página funda (quadro 2×2 — nenhuma metade chega sozinha):
forma capturada sem índice **534 ms**; forma capturada com I1 **157 ms** (o índice tira o
sort, mas continuam a atravessar 204k linhas); keyset sem índice **~184 ms**; **keyset + I1
0,6 ms**. É preciso a reescrita D4 **e** o índice I1.

Lição de modelação a levar à skill `prisma-conventions`: «índices começam por tenantId» é
correcto para listagens, mas as cargas de relação do Prisma (`include`) filtram **apenas
pela FK** — toda a relação N:1 consultada via include precisa também de `@@index([fk])`.

## 6. Defeitos de domínio encontrados (só-leitura aqui — entregar aos donos)

| # | Onde | Defeito | Correcção proposta |
|---|---|---|---|
| D1 | `app/(dashboard)/contabilidade/balancete/page.tsx` | `FiltroUrlSchema` recebe `incluirZeradas="false"` (string) num `z.boolean()` → `safeParse` falha → default **sem datas** → balancete varre tudo; além disso as datas seguem como *string* com `as any` | `z.coerce.boolean()`/`z.coerce.date()` no schema de URL; remover `as any` (teria denunciado o tipo) |
| D2 | `app/(dashboard)/contabilidade/razao-geral/page.tsx` | Datas string passadas a `razaoConta` → Prisma rejeita → `catch` devolve erro com HTTP 200; razão **nunca correu** na fase A | Idem D1; e ver D7 |
| D3 | `contabilidade.service.ts` `gerarBalancete` (e `gerarDRE`, mesmo padrão) | `findMany` de 250k partidas + agregação em JS → 6,1 s BD + hidratação massiva; 56 s p95 e2e | Agregar no SQL: `groupBy(contaId, tipo, _sum)` ou `$queryRaw` com filtro de tenant (Q03: 89 ms, 60 linhas) |
| D4 | `src/server/db/paginate.ts` + chamadores | **Sistémico:** cursor `{id}` com `orderBy` não-único → Prisma emite SQL **sem LIMIT** e aplica `take` em memória (MovimentoStock ~190k linhas/pedido; HistoricoTransacao ~3k; Cliente idem) | Acrescentar `id` como desempate do `orderBy` em todos os chamadores (ou keyset explícito `(campo, id)`), e **verificar a SQL emitida** com `log_min_duration_statement` |
| D5 | `app/(dashboard)/inventario/movimentacoes/page.tsx` | Filtro `tipo` parseado do URL mas nunca passado ao serviço | Passar o filtro (já documentado no cenário k6) |
| D6 | Listagem de clientes (POS/procura) | `take ~1000` por pedido (1 001 linhas, 2 375 chamadas) | Paginar/pesquisar server-side com take pequeno |
| D7 | Páginas balancete/razão | `catch {}` genérico devolve cartão de erro com **HTTP 200** — mascarou D2 e engana health/k6 | Deixar o erro propagar para `error.tsx` ou responder ≠200; os cenários k6 passarão a validar conteúdo, não só status (dívida minha, ver §10) |

> **Actualização 2026-08-30 — D1, D2 e D7 corrigidos.** Não ficaram para o `w8-correcoes`: sem eles
> a linha de base pré-Keycloak mediria uma página de erro e um balancete sem filtro de datas, e ficava
> versionada como referência para sempre. As correcções foram as três mínimas que separam «medir a
> página» de «medir outra coisa»:
>
> - **D1** — `balancete/page.tsx`: o schema de URL deixa de sobrepor as datas com `z.string()` e lê o
>   booleano explicitamente (`z.coerce.boolean()` não serve: `Boolean("false") === true`). O `as any`
>   saiu com ele.
> - **D2** — `razao-geral/page.tsx`: idem; só o `take` precisa de coerção.
> - **D7** — ambas as páginas perderam o `catch` genérico. O erro propaga para `app/error.tsx` e a
>   resposta é ≠ 200.
> - **Fallback silencioso** (a causa-raiz comum, que a tabela não isolava): as duas páginas faziam
>   `parseResult.success ? data : FILTROS_DEFAULT`. Filtros inválidos passavam a ser um pedido
>   diferente, sem ninguém saber. Agora mostram a instrução.
>
> **D3, D4, D5 e D6 continuam para os donos.** São estáveis e estão presentes nas duas medições,
> portanto não estragam a comparação pré/pós-Keycloak — só confirmam que os números absolutos valem
> pouco, o que o ADR-0018 já diz.

## 7. Task 3.5 — SLOs provisórios: veredicto preliminar

- **POS < 1 500 ms, factura < 1 200 ms, PDF < 3 000 ms: confirmados** (folga ≥ 4× na fase A).
- **Listagem de stock < 800 ms: confirmado como alvo** — a falha da fase A é defeito
  (D4 + I1), não SLO irrealista; com a correcção a página funda faz 0,6 ms na BD.
- **Balancete < 3 000 ms: mantido condicionalmente** — só é atingível com D3 (agregação em
  SQL). Se a reescrita não entrar, o SLO é fantasia; não o ajustamos para cima, corrige-se
  a consulta.
- **Razão < 3 000 ms: sem medição válida** (D2) — re-medir antes de confirmar.
- **Export XLSX < 3 000 ms: manter e re-medir** — o 3 579 ms inclui o padrão D4; nota já
  registada no README: tecto real do export é ~5 000 linhas.
- Fecho definitivo (com números da pilha) na fase B.

## 8. Task 3.10 — a cache do ADR-0014 justifica-se? (preliminar, com dados)

**Para os três incumprimentos de SLO: não.** A evidência do EXPLAIN mostra que são defeitos
de consulta/índice, não custo intrínseco que se deva amortizar com cache:

- Balancete: 56 s → **89 ms** só com a reescrita SQL (Q03). Cache esconderia o defeito.
- Stock (lista e página funda): 6,9–13,3 s → **< 1 ms** com D4 + I1.
- Razão: nunca correu (D2); a consulta pretendida faz 42 ms com os índices existentes.

**Onde pode vir a justificar-se** (decidir com números da fase B, depois das correcções):
o `COUNT(*)` de paginadores (52 ms/página no diário, Q20) e relatórios agregados
(balancete/DRE) sobre dados **append-only** — cache com invalidação simples por escrita
contabilística seria segura. Mas primeiro corrige-se; se depois de D3/D4/I1–I4 os p95
da pilha couberem nos SLOs, a cache do ADR-0014 fica para rate-limit distribuído e sessões,
não para consultas.

## 9. Infra efémera de medição

- Contentor `gespro-perf-db` (`postgres:17-alpine`, porta 5433, `pg_stat_statements`,
  `shared_buffers=512MB`, `work_mem=32MB`) — **removido no fim desta sessão**.
- **O volume de dados Docker foi mantido** (justificação: reseed do perfil pme custa
  ~30–40 min; a fase B pode reutilizá-lo). Reanexar:

  ```bash
  docker run -d --name gespro-perf-db -p 5433:5432 \
    -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=gespro_perf \
    -v 499349b54b2ed53e3a2525a3ec20d32f2169d45de6dd2f2a59a840399fded75b:/var/lib/postgresql/data \
    postgres:17-alpine -c shared_preload_libraries=pg_stat_statements \
    -c pg_stat_statements.max=5000 -c track_io_timing=on \
    -c shared_buffers=512MB -c work_mem=32MB
  ```

- Os 4 índices de teste foram **removidos** depois da medição — a BD está prístina para a
  fase B medir o código tal como estiver merged (recriá-los: `perf/sql/proposed-indexes.sql`,
  ~12 s).
- A pilha (`gespro-db`, `gespro-erp-*`, proxy, Keycloak, LGTM…) **não foi tocada**.
- O worktree tem um `.env` local (git-ignored) com `DATABASE_URL` apontado ao 5433 — os
  testes de integração do `pnpm check` precisam de BD viva. Para isso a BD de perf recebeu
  também o **tenant demo** (`pnpm db:seed`, tenant separado, algumas centenas de linhas —
  impacto de medição negligenciável, registado por honestidade). Sem o contentor de perf
  activo, o `pnpm check` volta a falhar nos 3 testes que exigem BD.

## 10. Pendências e dívida

1. **Fase B (ordem do orquestrador):** campanha contra a pilha (2 instâncias atrás do
   proxy), *depois* de D1–D4 e I1–I4 aplicados pelos donos → 3.4 (baseline versionada),
   3.5 (fecho dos SLOs), 3.9 (**tenants por instância** — com perfil `multi` de 50
   tenants, task 3.2), 3.8 (activar o gate com `baseline.json`).
2. ~~**Cenários k6 validam pouco** (dívida minha): verificam HTTP 200.~~ **Feito (2026-08-30).**
   `rendeuDados()` em `perf/k6/lib/util.js` verifica estado **e** um marcador que só existe com
   conteúdo real — `TOTAIS` no balancete, `Saldo Acum.` na razão, ausência de «Sem movimentações
   registadas» no stock. Acrescentado `checks: ['rate>0.99']` aos limiares dos dois cenários: sem
   isso uma verificação falhada não faz falhar a execução, e a asserção era decorativa.
3. A razão de conta não tem número válido; o export XLSX é limítrofe e re-mede-se depois
   do D4.
4. `perf/results/campanha-local-fase-a.json` existe **só em disco** neste worktree — não
   apagar até a fase B produzir a linha de base versionada.
5. Lição para `prisma-conventions` (§5) por propor ao dono da skill.
