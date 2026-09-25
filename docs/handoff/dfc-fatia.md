# Handoff — grafo `dfc`, nó `fatia` (ticket 6)

- **Data**: 2026-09-26 · **Grafo**: [`.claude/grafos/dfc.md`](../../.claude/grafos/dfc.md) · **Destranca**: `config-v`, `export-v`
- **Depende de**: `servico` (FEITO: [`dfc-servico.md`](dfc-servico.md), HEAD `81cd84b`)
- **Agente**: `feat-dfc`, na worktree `wt/feat-dfc` (ramo `ws-2-dfc`). Sem commit e sem migração. A única escrita
  na base foi o `pnpm db:seed` do 6.1, que é aditivo.
- **Gate do ticket 6**:
  - `pnpm build` verde ✅
  - smoke autenticado real, na porta 3010 com `next start`: diferença 0,00 ✅, faixa «por validar · versão 1»
    visível ✅, «Sem permissão» para o `operador@` ✅
  - oráculos protegidos verdes e sem alterações (6 ficheiros, 98/98) ✅
  - `tsc` 0 ✅
  - `pnpm check` só com o vermelho aceite (`projecao.golden`, `compromissosManuais` 1 vs 0) ✅
  - `pnpm gates` 5/5, com o `gate-periodo` a zero ✅
- **Voltas**: 1. Houve um tropeço de ambiente no smoke: em produção o `next start` exige `KEYCLOAK_CLIENT_SECRET`,
  e usou-se o placeholder de dev só nesse processo. O código não mudou por causa disso.

## Entregue

| Ficheiro | O quê |
|---|---|
| `apps/erp/prisma/seed/rbac.ts` | Três permissões: `financas:fluxo-caixa:{leitura,configurar,validar}`. A ligação aos papéis é **explícita**, porque o padrão das outras `financas:*` erra aqui: o sufixo `:leitura` daria a DFC ao OPERADOR (via `isReadOnly`) e o prefixo `financas:` daria `:validar` ao FINANCEIRO. OPERADOR exclui `financas:fluxo-caixa:*`, FINANCEIRO exclui `:validar`, e o GESTOR tem `:configurar` e `:validar` em `restricted`. |
| `apps/erp/src/server/actions/fluxo-caixa.actions.ts` | `gerarDFCAction`: `FiltroDFCSchema`, `financas:fluxo-caixa:leitura`, `permiteEmLeitura: true`. A página não a usa, porque é Server Component. Fica para o nó `pagina` e para o E2E. |
| `apps/erp/src/app/(dashboard)/contabilidade/dfc/page.tsx` | Server Component. Faz a verificação de permissão, resolve o intervalo e chama **só** `gerarDFC` (MINOR-4). Mostra as recusas de regra no ecrã e deixa os outros erros propagarem para o `error.tsx`. |
| `…/dfc/_components/mapa-dfc.tsx` | Server Component. Mostra a faixa «Mapeamento por validar · versão n», os badges «Provisório» e «Mapeamento vN», as secções OP/INV/FIN (só a coluna N, com o resultado líquido a abrir a OP), a soma das actividades e o cartão de articulação (caixa inicial, fluxo, caixa final e diferença). |
| `…/dfc/_components/impedimentos-dfc.tsx` | Server Component, versão simples: as frases do serviço, uma tabela das contas não mapeadas (código, nome, «Intervalo pedido»/«Comparativo N-1», movimento, saldo final) e os avisos. |
| `apps/erp/src/lib/dfc-intervalo.ts` | Função pura `resolverIntervaloDFC(periodos, {dataInicio?, dataFim?}, hoje)` e `periodoQueContem`, que traduzem datas da URL em períodos. Explicação na secção seguinte. |
| `apps/erp/src/lib/format-date.ts` | `formatarDiaIso(v)` devolve `aaaa-mm-dd` do dia civil em Maputo. `toISOString().slice(0,10)` daria o dia UTC, e o início de um período (22h00 UTC da véspera) cairia no dia anterior. |
| `apps/erp/src/components/patterns/status-badge.tsx` | Estados novos no mapa único: `PENDING` (warning, «Por validar»), `VALIDATED` (success, «Validado») e `PROVISORIO` (warning, «Provisório»). |
| `apps/erp/src/components/layout/AppSidebar.tsx` | Entrada «Demonstração de Fluxos de Caixa» a seguir ao Balancete, com `permission: 'financas:fluxo-caixa:leitura'`. |
| `apps/erp/src/components/layout/CommandPalette.tsx` · `Breadcrumbs.tsx` | Entrada na paleta. O segmento `dfc` do breadcrumb do topo passa a «Fluxos de Caixa» (antes aparecia «Dfc»). |
| `apps/erp/src/server/services/financas/dfc.interface.ts` · `dfc.service.ts` | **MINOR-1**: `ContaNaoMapeada.comparativo: boolean`, com JSDoc. `true` quer dizer que os valores são do homólogo N-1; uma conta que se move nos dois períodos aparece uma vez, com `false`. O serviço preenche o campo em `apurarNaoMapeadas`, e `apurarTodas` deixou de embrulhar `{apurada, comparativo}`. |
| Testes acessórios (fora dos protegidos) | `src/lib/__tests__/dfc-intervalo.test.ts` (9), `financas/__tests__/dfc-permissoes.test.ts` (4, a matriz de E5) e dois casos novos de `comparativo` em `dfc-servico-homologo.test.ts`, o acessório do próprio `feat-dfc` do nó `servico` (agora com 6). |

## Decisão: o seletor de período em intervalo

O `seletor-periodo` partilhado trabalha com datas; o `FiltroDFC`, com ids de período. **O seletor ficou intacto**
e as datas resolvem-se no servidor (`resolverIntervaloDFC`). Razões:

- Muda-se o mínimo. O componente serve o balancete e a DRE, e mexer nele obrigava a um segundo modo ou a outra
  prop, sem nenhum ganho para a DFC.
- A URL continua legível (`?dataInicio=2026-04-01&dataFim=2026-06-30`) e com a mesma forma das outras duas
  páginas. Ids opacos na URL não servem a ninguém.
- A regra «a DFC é de períodos **completos**» (§6, E3) vive num único sítio, puro e testado. Um dia a meio do mês
  alarga ao mês inteiro, a página mostra «o intervalo pedido foi alargado a 2026-04 a 2026-06», e o seletor volta
  a desenhar-se com o intervalo resolvido (tem `key` pelas datas).
- Sem datas na URL, o intervalo vai do 1.º período do exercício ao período de hoje: em 26/09/2026 dá 2026-01 a
  2026-09, que é um dos casos da golden.
- Um dia que esteja em dois períodos (o 31/12, que pertence ao 12 e ao 13) resolve para o de menor `ordem`. É a
  mesma dívida do período 13 que ficou com o ADR-0035 (MINOR-3).
- `resolverIntervaloDFC` não verifica o mesmo exercício nem a ordem. Isso cabe ao serviço (V4,
  `DFC_INTERVALO_INVERTIDO`), e a página mostra a recusa dele. As datas sem período e as datas inválidas dão um
  aviso com resposta 200, nunca um 500.

## Smoke (Playwright ad-hoc, apagado no fim)

Build de produção servido com `next start -p 3010`, com `NEXTAUTH_URL`/`AUTH_URL`/`APP_URL` a apontar para `:3010`
e o `KEYCLOAK_CLIENT_SECRET` de dev, tudo só nesse processo. A porta 3000 é do checkout principal e não se tocou
nela. O login foi feito no nosso ecrã `/auth/login`, contra o Keycloak real. 18/18 OK:

- **admin**, por omissão (2026-01 a 2026-09):
  - diferença «0,00 MT»;
  - faixa «Mapeamento por validar · versão 1»;
  - badge «Provisório»;
  - caixa final 4 235 981,20, igual à golden;
  - entrada presente na barra lateral;
  - 0 erros de consola ou de página.
- **admin**, com o seletor preenchido depois de `networkidle` (15/04 a 10/06):
  - alarga a 2026-04 a 2026-06, e o aviso aparece;
  - caixa inicial 1 325 889,20 e final 2 454 248,29, iguais à golden;
  - diferença 0,00.
- **admin**, com uma data sem período: recusa na página, HTTP 200.
- **operador**: «Sem permissão», sem mapa e sem entrada na barra lateral.
- **leitura**: vê a DFC.

Screenshots no scratchpad da sessão: `dfc-admin.png`, `dfc-admin-articulacao.png`, `dfc-admin-abr-jun.png` e
`dfc-operador.png`. O `playwright/.auth/admin.json` não foi reescrito, porque o projecto `setup` não correu.

## Para o `config` / `export` / `pagina`

- `ContaNaoMapeada.comparativo` já existe. O painel com «Mapear» (nó `pagina`) usa-o para dizer de que coluna vêm
  os valores.
- A coluna N-1 ainda não é mostrada. O `MapaDFC` recebe o `DFC` inteiro, e o nó `pagina` acrescenta a coluna (com
  «—» quando `homologo` é `null`) e as linhas expansíveis das contas (`LinhaRubricaDFC.contas`). Colunas com
  funções vão para um módulo `'use client'`, com `Decimal` passado como string.
- O `gerarDFCAction` já existe. Nenhum componente cliente o usa ainda.
- `:configurar` e `:validar` estão semeadas. As actions de escrita e a rota de validação são do nó `config`.
- O dashboard de `/contabilidade` tem um cartão da DRE e nenhum da DFC. Não entrou aqui porque o ticket só
  pede a barra lateral e a paleta; fica como sugestão para o `pagina`.
- Na barra lateral, o item «Dashboard» de Finanças aparece activo em todas as subpáginas de `/contabilidade`. É
  comportamento anterior, alheio a este nó.

## Estado da base

O `pnpm db:seed` correu da raiz da worktree sobre a base partilhada. No tenant `demo`, as três permissões ficaram
em ADMIN (3), FINANCEIRO (leitura e configurar), GESTOR (leitura) e LEITURA (leitura). Conferido por `psql`: 7
linhas em `RolePermission`. O resíduo «Pagamento da Internet» continua lá, alheio a este nó.

## Decisões do orquestrador depois da revisão (code-reviewer: APROVAR COM NITS; PV: LIMPO)

Passam para o nó `pagina`, que volta a tocar nestes ficheiros:
- **m1**: o delta de `DFC_NAO_ARTICULA` aparece em bruto (`page.tsx:83`). Passa a `formatMZN`.
- **NITs**:
  - o rótulo da versão deve usar `STATUS_LABELS` (`mapa-dfc.tsx:141`);
  - a mensagem «sem exercício» está imprecisa (`dfc-intervalo.ts:83`);
  - `key` única nos impedimentos (`impedimentos-dfc.tsx:31`).
- **Dívida fora do grafo**: a `CommandPalette` não filtra entradas por permissão. Vem de antes e afecta todos os itens.
