# Design: Processamento Salarial (Payroll)

## Âmbito

Motor de folha no WS E (Pessoas). Consome contratos do WS D
(`registarLancamentoContabilistico`, `registarMovimentoCaixa`, `proximoNumeroSerie`)
e do WS C (`Comissao`) e lê `RegistoAssiduidade`/`Ausencia` do próprio WS E.
Reutiliza o modelo `Payroll` existente e acrescenta linhas + tabelas paramétricas.

## Novos modelos (`prisma/schema/pessoas-projetos.prisma`)

```prisma
enum TipoLinhaPayroll { PROVENTO DESCONTO }
enum NaturezaLinhaPayroll { BASE SUBSIDIO HORAS_EXTRAS COMISSAO BONUS
  INSS IRPS FALTA ADIANTAMENTO PENHORA OUTRO }

// Cabeçalho da folha mensal (lote), agrupa os Payroll individuais
model FolhaPagamento {
  id            String   @id @default(cuid())
  tenantId      String
  mesReferencia Int
  anoReferencia Int
  status        StatusPayroll @default(PENDENTE)
  totalBruto    Decimal  @db.Decimal(18,2) @default(0)
  totalDescontos Decimal @db.Decimal(18,2) @default(0)
  totalLiquido  Decimal  @db.Decimal(18,2) @default(0)
  totalEncargosPatronais Decimal @db.Decimal(18,2) @default(0)
  lancamentoId  String?  // lançamento da massa salarial (WS D)
  processadoPorId String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@unique([tenantId, anoReferencia, mesReferencia])
  @@index([tenantId, status])
}

// Linhas detalhadas de cada Payroll (proventos e descontos)
model LinhaPayroll {
  id         String @id @default(cuid())
  tenantId   String
  payrollId  String
  tipo       TipoLinhaPayroll
  natureza   NaturezaLinhaPayroll
  descricao  String
  valor      Decimal @db.Decimal(18,2)
  payroll    Payroll @relation(fields: [payrollId], references: [id], onDelete: Cascade)
  @@index([tenantId, payrollId])
}

// Tabelas paramétricas versionadas por vigência
model TabelaINSS {
  id String @id @default(cuid())
  tenantId String
  vigenciaInicio DateTime
  vigenciaFim    DateTime?
  taxaTrabalhador Decimal @db.Decimal(9,6) // 0.03
  taxaEntidade    Decimal @db.Decimal(9,6) // 0.04
  tetoIncidencia  Decimal? @db.Decimal(18,2)
  @@index([tenantId, vigenciaInicio])
}

model EscalaoIRPS {
  id String @id @default(cuid())
  tenantId String
  vigenciaInicio DateTime
  vigenciaFim    DateTime?
  ordem          Int
  limiteInferior Decimal @db.Decimal(18,2)
  limiteSuperior Decimal? @db.Decimal(18,2) // null = último escalão
  taxa           Decimal @db.Decimal(9,6)
  parcelaAbater  Decimal @db.Decimal(18,2)
  numeroDependentes Int  @default(0) // se a tabela variar por dependentes
  @@index([tenantId, vigenciaInicio, ordem])
}
```

Acrescentar relação `Payroll.folhaId` + `Payroll.linhas LinhaPayroll[]`.

## Motor de cálculo (função pura, testável isoladamente)

`src/server/services/pessoas-projetos/payroll-calculo.ts` — **sem I/O**, recebe
snapshots e devolve o resultado; é o núcleo com property tests.

```ts
export interface EntradaCalculoPayroll {
  salarioBase: Decimal;
  subsidios: { alimentacao: Decimal; transporte: Decimal; habitacao: Decimal; outros: Decimal };
  variaveis: { horasExtras: Decimal; comissoes: Decimal; bonus: Decimal; outros: Decimal };
  descontosDiversos: { descricao: string; valor: Decimal }[];
  tabelaInss: TabelaINSS;
  escaloesIrps: EscalaoIRPS[];
}
export interface ResultadoCalculoPayroll {
  bruto: Decimal; baseInss: Decimal; inssTrabalhador: Decimal; inssEntidade: Decimal;
  baseIrps: Decimal; irps: Decimal; outrosDescontos: Decimal;
  liquido: Decimal; custoTotalEntidade: Decimal;
  linhas: { tipo: 'PROVENTO'|'DESCONTO'; natureza: string; descricao: string; valor: Decimal }[];
}

export function calcularPayroll(e: EntradaCalculoPayroll): ResultadoCalculoPayroll {
  const bruto = e.salarioBase
    .plus(sum(e.subsidios)).plus(sum(e.variaveis));
  const inssTrabalhador = baseInss(e).times(e.tabelaInss.taxaTrabalhador);
  const inssEntidade    = baseInss(e).times(e.tabelaInss.taxaEntidade);
  const baseIrps = bruto.minus(inssTrabalhador);           // regra da tabela vigente
  const irps = calcularIRPS(baseIrps, e.escaloesIrps);      // escalão → taxa − parcela
  const outros = e.descontosDiversos.reduce((s, d) => s.plus(d.valor), new Decimal(0));
  const liquido = bruto.minus(inssTrabalhador).minus(irps).minus(outros);
  const custoTotalEntidade = bruto.plus(inssEntidade);
  return { bruto, inssTrabalhador, inssEntidade, baseIrps, irps, outrosDescontos: outros, liquido, custoTotalEntidade, /* linhas */ };
}

// IRPS progressivo: imposto = base × taxaEscalao − parcelaAbater (escalão da base)
function calcularIRPS(base: Decimal, escaloes: EscalaoIRPS[]): Decimal { /* ... */ }
```

**Invariantes (property tests):** `liquido = bruto − inssTrabalhador − irps − outros`;
`irps` monótono não-decrescente na base; `inssTrabalhador = baseInss × 0.03`;
nunca `liquido < 0` sem desconto explícito que o justifique; arredondamento a 2 casas.

## Serviço (`payroll.service.ts` — novo, orquestra I/O)

```ts
processarFolhaMes(input: { mes: number; ano: number }, ctx: Ctx): Promise<{ folhaId: string; total: number }>
//  ↳ $transaction: para cada Colaborador ACTIVO → reúne snapshots (assiduidade,
//     comissões, subsídios) → calcularPayroll(...) → cria Payroll + LinhaPayroll
//     (idempotente por @@unique). Actualiza totais da FolhaPagamento.

marcarProcessada(folhaId, ctx): Promise<void> // gera lançamento SALARIOS (WS D)
marcarPaga(folhaId, ctx): Promise<void>        // gera movimento caixa/banco (WS D)
cancelar(folhaId, ctx): Promise<void>
recalcularPayroll(payrollId, ctx): Promise<void> // reprocessa 1 colaborador
obterRecibo(payrollId, ctx): Promise<ReciboDados>
listarFolhas(filter, ctx) / listarPayrolls(filter, ctx)
```

### Lançamento da massa salarial (partidas dobradas)

| Conta (PGC classe) | Débito | Crédito |
|---|---|---|
| Gastos com pessoal (6x) | bruto + INSS entidade | |
| INSS a pagar (2x) | | INSS trab. + INSS entidade |
| IRPS retido a pagar (2x) | | IRPS |
| Remunerações a pagar (2x) | | líquido |

Débito total == crédito total (validado pelo contrato `registarLancamentoContabilistico`).

## Máquina de estados

```ts
const TRANSICOES_PAYROLL: Record<StatusPayroll, StatusPayroll[]> = {
  PENDENTE:   ['PROCESSADO', 'CANCELADO'],
  PROCESSADO: ['PAGO', 'CANCELADO'],
  PAGO:       [],
  CANCELADO:  [],
};
```

## Validações (`src/lib/validations/payroll.ts` — novo)

`ProcessarFolhaSchema` (mes 1–12, ano), `AjusteLinhaSchema`,
`TabelaINSSSchema`/`EscalaoIRPSSchema` (admin), `FilterPayrollSchema`.

## Actions + UI

- Actions (`src/server/actions/payroll.actions.ts`): `processarFolhaMesAction`,
  `marcarProcessadaAction`, `marcarPagaAction`, `cancelarFolhaAction`,
  `recalcularPayrollAction`. Permissões `rh:payroll:*` no catálogo RBAC.
- **Ligar o form existente** `/rh/payroll/novo` à `processarFolhaMesAction`
  (remover o stub) — passar de introdução manual de INSS/IRPS para cálculo.
- `/rh/payroll` (lista mensal via serviço), `/rh/payroll/[id]` (recibo).
- Recibo PDF e mapas INSS/IRPS via Route Handlers `withApi`.

## Seed

`prisma/seed/payroll.ts`: `TabelaINSS` (3%/4%) + `EscalaoIRPS` da vigência,
seedados a partir das fontes oficiais citadas nos requisitos, com o decreto/versão
documentado em comentário. Uma folha de demonstração para o tenant demo.

## Riscos e mitigações

- **Rigor legal:** cálculo isolado numa função pura com *golden tests* contra
  exemplos oficiais; tabelas versionadas por vigência. Qualquer alteração de lei
  é um novo registo de tabela, não código.
- **Reprocessamento:** `@@unique` garante idempotência; correcção via cancelar +
  reprocessar (append-only nos valores após PROCESSADO).
- **Precisão monetária:** `Decimal` em todo o cálculo; arredondamento único e
  testado; nunca `number`/`Float`.
