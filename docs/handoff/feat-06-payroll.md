# Handoff — Spec 06: Processamento Salarial (Payroll)

Branch: `ws-06` (worktree `wt/feat-payroll`). `pnpm check` + `pnpm gates` verdes.
Cobertura do motor de cálculo: **100% stmts/lines/funcs, 95.5% branches** (≥90% exigido).

## O que foi implementado

### Schema (`prisma/schema/pessoas-projetos.prisma`) — SEM migration (orquestrador gera)
- **Bloco aditivo no fim do ficheiro** (coordenação com specs 07/08): enums
  `TipoLinhaPayroll`/`NaturezaLinhaPayroll`; modelos `FolhaPagamento` (lote mensal,
  `@@unique([tenantId, anoReferencia, mesReferencia])`), `LinhaPayroll` (detalhe,
  `manual Boolean` para ajustes), `TabelaINSS` e `EscalaoIRPS` (paramétricas,
  **versionadas por vigência** `vigenciaInicio`/`vigenciaFim`).
- Modelo `Payroll` existente (alteração aditiva): `folhaId`, `encargoInssEntidade`,
  `custoTotalEntidade`, relações `folha`/`linhas`, índice `[tenantId, folhaId]`.
  Comentário "extensão futura" removido.
- FKs cross-WS escalares (sem `@relation`): `lancamentoId`/`lancamentoPagamentoId`
  → Lancamento (WS D), `processadoPorId` → User.

### Motor puro (`src/server/services/pessoas-projetos/payroll-calculo.ts`)
- `calcularPayroll`, `calcularIRPS`, `valorizarHorasExtras`, `calcularDescontoFalta`,
  `arredondar2`. **Sem I/O e sem `server-only`** (importado pelo seed; imports
  relativos de propósito). Tudo em `Prisma.Decimal`.
- **Arredondamento único documentado**: 2 casas, ROUND_HALF_UP por componente;
  o líquido é derivado dos componentes já arredondados → identidade exacta
  `liquido = bruto − inssTrab − irps − outros`.
- Testes: `__tests__/payroll-calculo.test.ts` — golden tests de **5 escalões IRPS**
  + continuidade nas fronteiras + INSS 3%/4% + teto de incidência; property tests
  (fast-check): identidade do líquido, IRPS monótono, INSS = 3% da base, ≤2 casas
  decimais, líquido nunca negativo sem descontos diversos, somas de linhas.

### Serviço (`payroll.service.ts`) + interface (`payroll.interface.ts`)
- `processarFolhaMes` em `$transaction`: colaboradores ACTIVO → snapshots
  (horas extras de `RegistoAssiduidade` com majoração 50%/208h mensais; faltas
  APROVADAS não justificadas + licenças sem vencimento a `salarioBase/30 × dias`;
  comissões APROVADAS do WS C) → motor → `Payroll`+`LinhaPayroll`. **Idempotente**:
  PENDENTE/CANCELADO recalculados, PROCESSADO/PAGO nunca tocados; folha
  PROCESSADO/PAGO → `FOLHA_JA_PROCESSADA`.
- `marcarProcessada`: lançamento **diário SALARIOS** via
  `registarLancamentoContabilistico` (WS D) dentro da mesma tx; congela valores.
- `marcarPaga`: lançamento de pagamento (4622 → 121) + `registarMovimentoCaixa`
  (SANGRIA) quando `sessaoCaixaId` é fornecido.
- `cancelar`: PROCESSADO → **estorno** do lançamento (append-only) + estados
  CANCELADO; reprocessamento posterior permitido.
- `recalcularPayroll`/`ajustarLinhaManual` (só PENDENTE — `PAYROLL_IMUTAVEL`),
  `obterRecibo`, `listarFolhas`/`listarPayrolls`, `mapaMensal`,
  `criarTabelaINSS`/`criarEscaloesIRPS` (nova vigência fecha a anterior).
- `TRANSICOES_PAYROLL` (PENDENTE→PROCESSADO→PAGO; CANCELADO de PENDENTE/PROCESSADO)
  também em `src/lib/state-machines.ts` (client-safe).
- Testes (`__tests__/payroll.service.test.ts`, Prisma mockado): **property test
  débito==crédito** em `montarLancamentoFolha` e `montarLancamentoPagamentoFolha`
  (equilíbrio POR CONSTRUÇÃO: o líquido é derivado dos restantes totais), máquina
  de estados, erros de negócio, imutabilidade, versionamento de vigências.

### Contabilização (contas PGC-NIRF do seed, constantes `PGC_PAYROLL`)
| Conta | Movimento |
|---|---|
| 622 Remunerações dos trabalhadores | Débito: bruto |
| 623 Encargos sobre remunerações | Débito: INSS entidade (4%) |
| 449 Contribuições para o INSS | Crédito: INSS trab. + entidade (7%) |
| 442 Impostos retidos na fonte | Crédito: IRPS |
| 451 Pessoal | Crédito: outras retenções (adiantamentos/penhoras/faltas) |
| 4622 Remunerações a pagar aos trabalhadores | Crédito: líquido |
| Pagamento: débito 4622, crédito 121 Depósitos à ordem (alinhado com conta-pagar) | |

### Validações, actions, RBAC
- `src/lib/validations/payroll.ts` (novo, sem tocar em `rh.ts`): Processar/
  MarcarProcessada/MarcarPaga/CancelarFolha/RecalcularPayroll/AjusteLinha/
  Filter*/TabelaINSS/CriarEscaloesIRPS.
- `src/server/actions/payroll.actions.ts`: processar/processada/paga/cancelar/
  recalcular/ajustar/listar + tabelas admin.
- `prisma/seed/rbac.ts` (aditivo): `rh:payroll:{read,processar,pagar,cancelar,tabelas}`;
  FINANCEIRO recebe todas as `rh:payroll:*`; ADMIN/GESTOR automáticos; LEITURA
  apanha `rh:payroll:read` pelo sufixo.
- `status-badge.tsx` (aditivo): `PROCESSADO` (info) e `PAGO` (success) + labels.

### UI (sem modais; excepção única: AlertDialog no cancelamento)
- `/rh/payroll/novo` — **stub removido**: form em lote (mês/ano) ligado a
  `processarFolhaMesAction`; inputs manuais de INSS/IRPS eliminados.
- `/rh/payroll` — lê via `PayrollService` (sem prisma cru): secção "Folhas
  mensais" com acções processar/pagar/cancelar + links dos mapas; tabela de
  payrolls individuais com `rowHref` para o detalhe.
- `/rh/payroll/[id]` — detalhe/recibo (colaborador, proventos, descontos,
  encargos patronais, custo total) + download PDF.

### Documentos (Route Handlers `withApi`, permissão `rh:payroll:read`)
- `GET /api/rh/payroll/[id]/recibo` — recibo de vencimento **PDF** gerado por
  `src/lib/pdf/simple-pdf.ts` (gerador mínimo próprio, A4, Helvetica/WinAnsi,
  sem dependências — validado a abrir correctamente).
- `GET /api/rh/payroll/mapas/{inss,irps}?mes=&ano=` — CSV (`;`, BOM UTF-8) com
  payrolls PROCESSADO/PAGO do mês.

### Seed (`prisma/seed/payroll.ts`, registado em `index.ts`)
- `TabelaINSS`: 3%/4%, sem teto, vigência 2018-01-01 — **Lei 4/2007 + Decreto
  51/2017** (https://www.inss.gov.mz/taxa-contributiva-tco/).
- `EscalaoIRPS` (vigência 2024-01-01): tabela do **art. 54 do CIRPS (Lei 20/2013)
  mensalizada** (limites/parcelas anuais ÷12): até 3.500→10%(0); 14.000→15%(175);
  42.000→20%(875); 126.000→25%(2.975); >126.000→32%(11.795).
- Folha demo do mês anterior (PENDENTE) calculada pelo motor. Idempotente.

## Decisões (e porquês)
1. **IRPS mensalizado do art. 54** em vez das tabelas de retenção na fonte por
   dependentes: encaixa na fórmula `base × taxa − parcela` do design; o modelo
   `EscalaoIRPS.numeroDependentes` já suporta tabelas por dependentes quando se
   quiser carregar (nova vigência, zero código).
2. **⚠ Reforma fiscal 2026**: os valores 2026 não foram fixados por não ser
   possível validar o Boletim da República a partir daqui. A tabela seedada é a
   do CIRPS em vigor pré-reforma, com aviso no seed. **Acção para o orquestrador:
   quando o diploma final estiver validado, carregar nova vigência via
   `criarEscaloesIRPSAction` (ou seed) — nunca editar registos existentes.**
3. **Base INSS = bruto (com teto opcional da tabela)** — regra de incidência
   vive na `TabelaINSS`, não no código.
4. **Horas extras**: valor hora = salarioBase/208 (26 dias × 8h), majoração 50%
   por omissão (Lei 23/2007, art. 90) — parâmetros do motor, configuráveis.
5. **Comissões (WS C)**: `Comissao.vendedorId` referencia `User`; não existe
   ligação Colaborador↔User no schema → correspondência por **email** (único por
   tenant em ambos). Comissões APROVADAS criadas no mês. Dívida: ligação formal
   Colaborador.userId (mudança de schema partilhada — coordenar).
6. **Cancelamento de folha PROCESSADA** estorna o lançamento (`estornarLancamento`,
   fora da tx principal porque o contrato gere as suas escritas) — append-only.
7. **Débito==crédito por construção**: `montarLancamentoFolha` deriva o líquido
   dos restantes totais em vez de o receber — impossível desequilibrar.
8. **Ponto de extensão para o spec 08 (benefícios)**: `LinhaPayroll.manual=true`
   + `PayrollService.ajustarLinhaManual`/`AjusteLinhaSchema`. O spec 08 pode
   injectar proventos/descontos por colaborador criando linhas manuais antes de
   `marcarProcessada` (ou expor um contrato que o `montarEntrada` consuma —
   ver TODO no serviço). NÃO há dependência actual do spec 08.

## Ficheiros tocados (partilhados → aditivo apenas)
- `prisma/schema/pessoas-projetos.prisma` (bloco no fim + campos aditivos em `Payroll`)
- `prisma/seed/rbac.ts`, `prisma/seed/index.ts`, `src/components/patterns/status-badge.tsx`,
  `src/lib/state-machines.ts` — só acrescentos.
- `package.json`: `@vitest/coverage-v8` (devDependency, para medir a cobertura exigida).

## Correcções pós-review (MAJORs fechados)
1. **`cancelar` recuperável/idempotente**: antes de estornar verifica o estado do
   lançamento via `obterLancamento` (contrato WS D) e salta o estorno se já
   estiver ESTORNADO — um retry após falha parcial completa só os estados
   (teste: "retry após falha parcial é idempotente").
2. **`processarFolhaMes` sem N+1**: pré-agregação fora do loop (comissões,
   `groupBy` de assiduidade e ausências, payrolls existentes e linhas manuais em
   lote — n.º de queries constante) + `{ timeout: 60_000 }` na `$transaction`.
   `montarEntrada` passou a função pura (sem I/O).
3. **`LIQUIDO_NEGATIVO`**: `recalcularPayroll`/`ajustarLinhaManual` rejeitam
   líquido negativo (na MESMA tx — a linha manual não persiste em caso de erro)
   e `marcarProcessada` valida antes de montar o lançamento (testes novos).
- NITs: Zod (`ProcessarFolhaSchema`) nos query params dos mapas CSV; P2002 na
  criação da folha → `FOLHA_JA_EM_PROCESSAMENTO`; `UnsavedChangesGuard` no form;
  taxas removidas dos textos de UI (só as tabelas paramétricas falam de taxas).

## Gaps / dívidas
- **Migration não gerada** (regra): orquestrador corre `prisma migrate dev` — as
  tabelas novas não existem na DB partilhada; testes de payroll usam Prisma
  mockado e motor puro (nenhum teste toca as tabelas novas).
- **Smoke autenticado** (processar → processada → paga → recibo) fica para o
  orquestrador pós-merge (DB só terá as tabelas depois da migration + seed).
- UI de administração das tabelas INSS/IRPS: serviço + actions + validações
  prontos; página admin não construída (fora do caminho crítico).
- Faltas: considera ausências com `dataInicio` dentro do mês (não reparte
  ausências que atravessam meses).
- Recibo PDF minimalista (gerador próprio); layout rico → biblioteca dedicada.
- Mapas INSS/IRPS em CSV genérico — formatos oficiais específicos (ficheiro
  INSS/e-declaração AT) quando houver especificação.
- Pagamento credita sempre `121 Depósitos à ordem` (o PGC seedado não tem conta
  de caixa lançável); movimento físico de caixa opcional via `sessaoCaixaId`.
