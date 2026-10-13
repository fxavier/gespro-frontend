## Contexto

O Balancete de Verificação (`/contabilidade/balancete`) está funcionalmente correcto — agregação em SQL (ADR-0018 D3), saldo anterior (#141), dia civil de Maputo — mas o **formato** não é o que um contabilista moçambicano espera. A referência de mercado (e o que os TOC dos nossos clientes usam hoje) é o balancete do **PHC CS Contabilidade**. Esta issue alinha o GestPro com esse modelo, sem mexer na aritmética já validada.

### Estado actual (resumo)

- `contabilidade.service.ts` → `gerarBalancete` + `montarLinhasBalancete` (pura).
- Colunas: `Código | Conta | Saldo Anterior | Débitos | Créditos | Saldo Actual`.
- Só contas folha (`aceitaLancamento = true`) — **sem hierarquia** (classe / razão / subcontas).
- Saldo **único com sinal**, orientado pela natureza da conta (negativos a vermelho) — não há colunas Saldo Devedor / Saldo Credor.
- Saldo anterior = **todo o histórico** antes de `dataInicio`, não o acumulado do exercício.
- Período por datas livres; não usa `ExercicioContabil` / `PeriodoContabil` (ADR-0033).
- `FiltroBalanceteSchema.classe` existe mas **é ignorado** pelo serviço.
- Linha "TOTAIS" com `Saldo Actual = totalDeb − totalCred` (sem significado num balancete por natureza).
- Sem exportação (PDF/Excel), sem drill-down para o razão.
- `src/lib/contabilidade/balancete.ts` — implementação legada sobre `localStorage`, sem consumidores.

## Objectivo — modelo PHC CS

### 1. Layout (colunas)

| Conta | Descrição | Movimento do período || Acumulado || Saldo ||
|---|---|---|---|---|---|---|---|
| | | Débito | Crédito | Débito | Crédito | Devedor | Credor |

- **Movimento do período**: somas de débito/crédito entre o período inicial e final escolhidos.
- **Acumulado**: somas de débito/crédito desde o início do exercício até ao período final (inclui o período).
- **Saldo**: `acumD − acumC` apresentado numa só coluna — Devedor se > 0, Credor se < 0. **Nunca valores negativos**; deixa de depender da natureza da conta para o sinal (a natureza passa a servir só para assinalar saldos "contra natureza", ver §4).

### 2. Hierarquia PGC-NIRF

- Mostrar todos os níveis (`nivel` 1–4: classe, grupo/razão, subgrupo, analítica), com os valores das contas-mãe obtidos por **roll-up** das folhas (via `contaMaeId`, não por prefixo de código).
- Contas agregadoras em negrito; analíticas indentadas.
- Opção **"Ver apenas contas de razão"** (equivalente ao filtro PHC): só nível 2.
- Opção **Grau/nível máximo** (1–4).
- **Subtotal por classe** e **Total geral**.

### 3. Período

- Selector **Exercício + Período inicial + Período final** (`PeriodoContabil.ordem` 1..13), com o período 13 (encerramento, ADR-0035) opcional — permite balancete **antes e depois do apuramento/encerramento**.
- Manter o modo por datas livres apenas como avançado (ou remover — decidir na triagem).
- Tipos de apresentação como no PHC: **Por período**, **Acumulado**, **Por período e acumulado** (oculta/mostra o bloco de colunas correspondente).

### 4. Filtros e opções

- **Conta inicial / Conta final** (intervalo por código).
- **Classe** — ligar o `classe` que já existe no schema.
- **Ver contas sem movimento e saldo** (substitui "Incluir zeradas").
- **Ver apenas contas com saldo**.
- **Excluir contas** (lista de códigos).
- Pesquisa por código/descrição mantém-se e **não altera os totais** (contrato #141).
- Destaque de saldos **contra natureza** (ex.: Caixa credora, conta 11/12 com saldo credor) — aviso visual, não erro.

### 5. Totais e controlo

- Linha de totais para Movimento, Acumulado e Saldo.
- Verificação explícita de três igualdades: `ΣmovD = ΣmovC`, `ΣacumD = ΣacumC`, `ΣsaldoDevedor = ΣsaldoCredor`, com indicador de equilíbrio. Remove a linha actual "Saldo Actual = totalDeb − totalCred".
- Totais calculados **só sobre folhas** (evita dupla contagem com o roll-up).

### 6. Saída

- **Exportar PDF** (A4 horizontal) com cabeçalho estilo PHC: entidade, NUIT, exercício, período, data/hora de emissão, utilizador, paginação "Página x de y", totais transportados por página. Reutilizar `src/lib/pdf`.
- **Exportar Excel/CSV** com a mesma estrutura de colunas (valores numéricos, não formatados).
- **Drill-down**: clicar numa conta folha abre `/contabilidade/razao-geral` com a conta e o período pré-preenchidos.

## Restrições / não regressões

- **Contrato da DFC**: o balancete de *movimento* (`comSaldoAnterior` ausente) é consumido pela DFC (`dfc.service.ts`, `projecao.service.ts`). Ou se mantém esse caminho intacto, ou a DFC passa a uma função própria — `dfc.golden.test.ts`, `dfc.property.test.ts` e `duplo-leitura-dfc.ts` têm de continuar verdes.
- **Agregação em SQL** (ADR-0018 D3): nada de `findMany` de partidas. O acumulado é mais uma `groupBy` (ou uma única com `CASE` por intervalo). Roll-up hierárquico em memória sobre as dezenas/centenas de contas, não sobre partidas.
- **Decimal** em todo o cálculo; conversão para número só na apresentação.
- Predicado de estado `FILTRO_LANCAMENTO_MAPA` mantém-se.
- Multi-tenancy: contas fora do tenant continuam a ser descartadas em `montarLinhasBalancete`.
- Cenário k6 `perf/k6/scenarios/balancete-razao.js` sem regressão face ao baseline.
- UI sem modais (`ui-conventions`); filtros via URL (Server Component).

## Decisões em aberto (para a triagem)

1. **Acumulado = desde o início do exercício** (modelo PHC) vs. todo o histórico (actual). Sem lançamento de abertura (`OrigemLancamento` não tem `ABERTURA`), o acumulado do exercício perde os saldos transitados das classes 1–5. Opções: (a) incluir saldos de exercícios anteriores para contas de balanço como "abertura" implícita; (b) introduzir lançamento de abertura no encerramento (ADR-0035). Provavelmente exige ADR.
2. Manter ou retirar o modo por datas livres.
3. Destino da página "Registar Balancete Oficial" (`balancete/nova`) — fica fora desta issue salvo decisão contrária.

## Critérios de aceitação

- [ ] Colunas Movimento D/C, Acumulado D/C, Saldo Devedor/Credor, sem valores negativos.
- [ ] Hierarquia completa com roll-up, subtotais por classe e total geral; opção "apenas contas de razão" e grau máximo.
- [ ] Selecção por exercício + período inicial/final, com/sem período 13.
- [ ] Filtros: conta inicial/final, classe, sem movimento e saldo, apenas com saldo, excluir contas.
- [ ] Três igualdades verificadas e visíveis.
- [ ] Exportação PDF e Excel/CSV; drill-down para o razão.
- [ ] Testes unitários da função pura (roll-up, split devedor/credor, totais só de folhas, filtros não alteram totais) + golden test com o seed `demo-contabilidade`.
- [ ] E2E `e2e/20-balancete.spec.ts` actualizado.
- [ ] DFC e projecção sem regressão (testes existentes verdes).
- [ ] `src/lib/contabilidade/balancete.ts` (legado `localStorage`) removido.

## Referências

- PHC — [Balancete Contabilístico](https://helpcenter.phcgo.net/pt/sug/ptxview.aspx?stamp=!!!e4d1e75483ee2249:gg55f), [Balancete de contas por período e acumulado](https://helpcenter.phcgo.net/PT/sug/ptxview.aspx?stamp=71e4e1:df9e185598gc511), [Balancete de contas acumulado](https://helpcenter.phcgo.net/PT/sug/ptxview.aspx?stamp=4c4::62f5e:5f53bcgb548)
- ADR-0018 §6 (D1, D3, D7), ADR-0033 (exercício/períodos), ADR-0035 (encerramento), ADR-0037 (DFC), #141
- Código: `apps/erp/src/server/services/financas/contabilidade.service.ts` (`gerarBalancete`, `montarLinhasBalancete`), `apps/erp/src/app/(dashboard)/contabilidade/balancete/page.tsx`, `apps/erp/src/lib/validations/contabilidade.ts`
