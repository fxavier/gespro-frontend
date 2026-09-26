# Handoff — grafo `dfc`, nó `pagina` (ticket 8 + 9.2)

- **Data**: 2026-09-26 · **Grafo**: [`.claude/grafos/dfc.md`](../../.claude/grafos/dfc.md) · **Destranca**: `e2e-v`
- **Depende de**: `config` ([`dfc-config.md`](dfc-config.md)) e `export` ([`dfc-export.md`](dfc-export.md)), HEAD `5d8cc2f`
- **Agente**: `feat-dfc`, worktree `wt/feat-dfc` (ramo `ws-2-dfc`). Sem commit, sem migração, **sem escrita na base**
  (o smoke só leu). O grafo não foi marcado.
- **Voltas**: 2. A primeira corrida do axe apanhou um contraste de 4,47:1 (ver «Achados»); a segunda ficou verde.

## Gate do ticket 8

| Verificador | Resultado |
|---|---|
| `pnpm --filter erp build` | verde |
| `pnpm e2e:a11y` (só `-g "Fluxos de Caixa"`, projecto `a11y` + `setup`, contra `next start -p 3010`) | 2/2 AA, tema claro e escuro, com uma rubrica expandida |
| smoke autenticado (Playwright ad-hoc, `networkidle`, apagado no fim) | 4/4, 0 erros de consola ou de página |
| resultado líquido da DFC = DRE do mesmo intervalo | 3 301 508,00 = 3 301 508,00 (2026-01 a 2026-09) · 1 349 418,75 = 1 349 418,75 (15/04–10/06, alargado a 2026-04 a 2026-06) |
| ficheiros protegidos | `git diff --stat HEAD -- …/financas/__tests__ …/export/__tests__ …/provisioning/__tests__ …/dfc-voltar.test.ts playwright/.auth/admin.json` vazio |
| `npx tsc --noEmit -p .` | 0 |
| `pnpm check` | só o vermelho aceite: `projecao.golden` («a base tem resíduos», `compromissosManuais` 1 vs 0). 149/150 ficheiros, 2091 testes |
| `pnpm gates` | 5/5, `gate-periodo` a zero |

## Entregue

| Ficheiro | O quê |
|---|---|
| `…/contabilidade/dfc/_components/mapa-dfc.tsx` | Server Component. 8.1 coluna N-1 (`homologo`): «—» em todas as linhas sem exercício anterior, e uma nota a dizê-lo; com exercício anterior, a linha sem movimento num dos lados vale 0,00 (a regra do PDF). 8.2 quatro `KpiCard` (OP, INV, FIN, Δcaixa, com o N-1 na descrição) e o gráfico. 8.3 as rubricas passam a `LinhaRubrica`. 8.4 cartão «Reconciliação com a DRE» (resultado líquido + ligação à DRE com as mesmas datas). 9.2 «Exportar PDF» no cabeçalho do mapa, só com `financas:exportar`. NIT: o estado da versão vem do `StatusBadge` sem `label` (o `STATUS_LABELS` resolve «Por validar»/«Validado») e o número vai ao lado, «Mapeamento vN». |
| `…/dfc/_components/linha-rubrica.tsx` | `'use client'`, só o estado aberto/fechado. Recebe textos já formatados e `href`s montados no servidor. Botão com `aria-expanded` e, aberto, `aria-controls` com os ids únicos das linhas das contas. Cada conta mostra o `efeitoCaixa` em N e N-1, a variação do saldo, e liga a `/contabilidade/razao-geral?contaId=…&dataInicio=…&dataFim=…` do intervalo N. |
| `…/dfc/_components/grafico-dfc.tsx` | `'use client'`, Recharts `BarChart` com OP, INV, FIN e Δcaixa. Valores chegam como string decimal (o `parseFloat` é só para desenhar) e a dica mostra o texto formatado no servidor. Cores `var(--chart-1..4)` e `var(--border)`; `role="img"` com `aria-label` que lista os quatro valores. |
| `…/dfc/_components/exportar-pdf.tsx` | `'use client'`. `fetch` ao `GET /api/contabilidade/dfc/export?dataInicio=&dataFim=`. 200 ⇒ descarrega o blob com o nome do `Content-Disposition`; 422 ⇒ mostra `error.details.impedimentos` inteiros num `Alert`; outro erro ⇒ a `message` do envelope. Um `<a download>` gravaria o JSON do 422 como se fosse o PDF, sem aviso. |
| `…/dfc/_components/impedimentos-painel.tsx` | Era `impedimentos-dfc.tsx` (`git mv`). Avisos de coerência da caixa **acima**; as frases todas (NIT: `key` com índice); a tabela com «Intervalo pedido»/«Comparativo N-1». Com `:configurar`, «Mapear» por linha → `/contabilidade/fluxo-caixa/rubricas/mapear?contaId=<id>&voltar=<encodeURIComponent('/contabilidade/dfc?dataInicio=…&dataFim=…')>`; sem ela, a indicação de a quem pedir. |
| `…/dfc/page.tsx` | Passa `podeConfigurar`, `podeExportar` e o `voltar` (a DFC com o intervalo resolvido). m1: o delta de `DFC_NAO_ARTICULA` passa por `formatMZN`. |
| `apps/erp/src/lib/dfc-linhas.ts` | Função pura `compararSeccao(atual, homologo)`: emparelha rubricas (por `id`) e contas de N com N-1, união ordenada por `ordem`/`codigo`. **Não soma nada**: cada lado é o `valor`/`efeitoCaixa` do `gerarDFC`. Teste acessório `lib/__tests__/dfc-linhas.test.ts` (2). |
| `apps/erp/src/lib/dfc-intervalo.ts` | NIT: «O tenant ainda não tem nenhum exercício contabilístico, e sem períodos não há DFC. Crie o exercício em Contabilidade › Exercícios.» O «aberto» era falso: `listarPeriodos({})` traz períodos de qualquer estado. Caso novo, por acrescento, em `dfc-intervalo.test.ts`. |
| `apps/erp/src/lib/periodo-fiscal.ts` + `…/dre/page.tsx` + `…/razao-geral/page.tsx` | `intervaloDoDiaMaputo`: `aaaa-mm-dd` ⇒ `T00:00:00.000+02:00` / `T23:59:59.999+02:00`. A DRE e o razão usavam `z.coerce.date` à meia-noite UTC, e o último dia do intervalo ficava de fora (defeito descrito no CLAUDE.md). A DFC liga às duas com as datas de um período, por isso as duas têm de ler o mesmo intervalo que ela. O título da DRE passou a `formatarData`: com o início às 22h00 UTC da véspera, o `toLocaleDateString` no servidor mostrava 31/12. Teste acessório `lib/__tests__/periodo-fiscal.test.ts` (3). O **balancete** continua com o defeito (não é ligado pela DFC). |
| `…/contabilidade/page.tsx` | Opcional: cartão «Fluxos de Caixa» no dashboard, a seguir à DRE. |
| `apps/erp/e2e/a11y.a11y.ts` | `A11y: Contabilidade — Demonstração de Fluxos de Caixa`, nos dois temas, com uma rubrica expandida. Aceita o mapa ou o painel de impedimentos. |

**Contrato**: não mudou. `LinhaRubricaDFC.contas` (`VariacaoClassificada[]`) já trazia as contas e a variação.

## Achados

- **Contraste no hover.** Com o rato em cima da rubrica acabada de expandir, o `text-destructive` de um negativo
  sobre o `hover:bg-muted/50` da `TableRow` fica a **4,47:1** no tema claro (#e7000b sobre #f4f8ff). O axe só o viu
  porque o clique deixou o rato ali. As tabelas do mapa passam a `[&_tr:hover]:bg-transparent`, e as linhas de
  destaque usam um filete (`border-t-2`) em vez de fundo, porque a soma das actividades pode ser negativa. **O mesmo
  defeito existe em qualquer tabela da casa com negativos a vermelho e hover** (DRE, razão, balancete): é dívida
  transversal, fora deste nó.
- **A correcção das datas da DRE não foi decisiva para a igualdade no seed.** O único lançamento no último dia de
  um intervalo testado (30/06, 20h17 UTC) é 421/121, sem contas de resultado. Mas é decisiva para o razão dessas
  contas, que é para onde a DFC liga, e para qualquer lançamento de gastos ou rendimentos no último dia.
- **O LEITURA vê «Exportar PDF».** Tem `financas:exportar` na matriz actual. É coerente com o CLAUDE.md
  («exportar nunca se trava»); fica registado para o REVIEW.
- **O razão mostra as datas das linhas com `toLocaleDateString('pt-PT')`** (defeito anterior, fora do âmbito).

## Smoke (Playwright ad-hoc em `apps/erp/`, apagado no fim)

Build de produção em `next start -p 3010`, com `NEXTAUTH_URL`/`AUTH_URL`/`APP_URL=http://localhost:3010` e o
`KEYCLOAK_CLIENT_SECRET` lido do contentor do Keycloak (`GESPRO_ERP_CLIENT_SECRET`), só nesse processo. A porta 3000
(checkout principal) não foi tocada. O axe correu com `BASE_URL=http://localhost:3010 npx playwright test
--project=a11y -g "Fluxos de Caixa"`: o `playwright.config.ts` lê `BASE_URL`, e o `webServer` com
`reuseExistingServer` não arranca nada porque a 3000 já responde. Depois, `git checkout --
apps/erp/playwright/.auth/admin.json`.

- **admin**, por omissão (2026-01 a 2026-09) e com 15/04–10/06:
  - diferença 0,00; KPIs e gráfico visíveis;
  - cabeçalho da coluna «N-1», nota «Sem exercício anterior», total operacional N-1 = «—»;
  - «Abrir a DRE» → `/contabilidade/dre?dataInicio=2026-01-01&dataFim=2026-09-30` e `…2026-04-01…2026-06-30`;
    o LUCRO LÍQUIDO lido na DRE é igual ao resultado líquido da DFC nos dois casos.
- **expandir** a primeira rubrica (OP-04): `aria-expanded` passa a `true`, aparece a 411 Clientes c/c; a ligação
  abre `/contabilidade/razao-geral?contaId=…&dataInicio=2026-04-01&dataFim=2026-06-30` e a página mostra
  «Movimentos da Conta».
- **Exportar PDF**: `200 application/pdf`, pedido `?dataInicio=2026-04-01&dataFim=2026-06-30`, ficheiro
  `dfc-2026-04-a-2026-06.pdf`.
- **operador**: «Sem permissão», sem KPIs.
- **leitura**: vê a DFC (diferença 0,00).

Não houve smoke do painel de impedimentos nem do «Mapear»: produzir um impedimento exige escrever na base
(desmapear uma conta), e este nó só lê. O E2E 10.1 (`e2e-v`) cobre-os. Os `data-testid` que lhe servem:
`dfc-impedimentos`, `dfc-nao-mapeada-<codigo>`, `dfc-mapear-<codigo>`, `dfc-impedimentos-quem`, `dfc-avisos`,
`dfc-exportar-pdf`, `dfc-exportar-erro`, `dfc-rubrica-<codigo>-expandir`, `dfc-conta-<codigo>-razao`,
`dfc-resultado-liquido`, `dfc-ligacao-dre`, `dfc-coluna-n1`, `dfc-sem-homologo`, `dfc-kpis`, `dfc-grafico`,
`dfc-versao`.

Screenshots em `/private/tmp/claude-502/-Users-xavier-dev-code-workspace-2026-gespro/970104f2-f985-483d-bacf-948d15748124/scratchpad/`:
`pagina-claro.png`, `pagina-escuro.png`, `pagina-tabela-{claro,escuro}.png`, `pagina-grafico-{claro,escuro}.png`,
`pagina-dre-articulacao-{claro,escuro}.png`, `pagina-expandida.png`, `pagina-razao.png`, `pagina-operador.png`.

## Para o `e2e-v` / `fecho`

- O «Mapear» leva o `voltar` com o intervalo **resolvido** (períodos completos), não o pedido: depois de mapear
  volta-se à mesma DFC que estava no ecrã.
- O botão de exportar só aparece com mapa. Se a configuração mudar entre o desenho da página e o clique, o 422
  aparece por baixo do botão com a lista completa.
- A página continua com a `CommandPalette` sem filtro de permissões (dívida anterior).

## FIX — volta 1 de 3 (revisão «APROVAR COM NITS», PV: LIMPO)

- **MINOR** `razao-geral/page.tsx`: as datas das linhas passam a `formatarData(l.data)` (fuso fixo Maputo), em vez de
  `new Date(l.data).toLocaleDateString('pt-PT')`. Um lançamento de 01/04 às 00h30 de Maputo aparecia datado de 31/03.
  Não sobra nenhum `toLocale*` directo no razão nem na DRE (só um comentário na DRE a explicar a troca).
- **NIT** `mapa-dfc.tsx`: a linha «Diferença» da articulação troca `bg-muted/50` por `border-t-2`, como as linhas de
  destaque. Era o par fundo + `text-destructive` que falhou o AA.
- **NIT** `exportar-pdf.tsx`: a raiz do componente é `contents` e o `Alert` do erro tem `basis-full`. O componente
  passou a filho directo do `CardHeader` (`flex-wrap`), com os badges em `ml-auto`. O botão fica na linha dos badges
  e o erro do 422 ocupa a largura toda, por baixo.
- Não entrou nenhuma cor nova (só `border-t-2` e `basis-full`). O a11y não foi repetido.
- `tsc` 0 · eslint sem erros (só os avisos que já existiam) · `pnpm --filter erp build` com exit 0 ·
  `src/lib/__tests__` 117/117 · protegidos intocados.

**Correcção de datas fora do módulo** (commit à parte). São exactamente estes quatro ficheiros, e nenhum ficheiro da
DFC depende deles:
`apps/erp/src/app/(dashboard)/contabilidade/dre/page.tsx`, `apps/erp/src/app/(dashboard)/contabilidade/razao-geral/page.tsx`,
`apps/erp/src/lib/periodo-fiscal.ts` e `apps/erp/src/lib/__tests__/periodo-fiscal.test.ts`.
