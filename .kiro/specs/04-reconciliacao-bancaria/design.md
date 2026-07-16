# Design: Reconciliação Bancária

## Âmbito e princípio

Feature **incremental** sobre o WS D (Finanças). Não introduz novos modelos de
raiz — completa o serviço, actions, validações e UI em torno dos modelos já
existentes. Reutiliza os contratos de contabilidade (`ContaPGC`, `Lancamento`,
`PartidaLancamento`) por chamada directa de serviço, dentro do mesmo domínio.

## Alterações de schema (mínimas)

Os modelos existem. Delta proposto (migração `05xx_reconciliacao_bancaria`):

```prisma
model ItemReconciliacaoBancaria {
  // ... campos existentes ...
  // Novo: par sugerido/confirmado no matching (auto-relação escalar)
  itemParId String?   // id do item do lado oposto conciliado com este
  @@unique([tenantId, reconciliacaoId, extratoReferencia]) // idempotência de importação
}
```

Nada mais muda; `conciliado`, `lancamentoId`, `tipoMovimento` já suportam o fluxo.

## Contrato de serviço (`contabilidade.service.ts` — completar `IContabilidadeService`)

```ts
// Abertura: calcula saldos contabilísticos reais + gera itens do razão
iniciarReconciliacao(input: IniciarReconciliacaoInput, ctx: Ctx): Promise<{ id: string }>

// Geração idempotente de itens LANCAMENTO_CONTABIL no intervalo
gerarItensRazao(reconciliacaoId: string, ctx: Ctx): Promise<{ criados: number }>

// Importação de extracto (CSV já parseado + validado na action)
importarExtrato(input: ImportarExtratoInput, ctx: Ctx): Promise<{ criados: number; ignorados: number }>

// Sugestões de matching (não persiste)
sugerirMatches(reconciliacaoId: string, ctx: Ctx): Promise<MatchSugerido[]>

// Conciliar/desconciliar 1..n itens + recálculo transaccional da diferença
marcarItemReconciliado(input: MarcarItemInput, ctx: Ctx): Promise<{ diferencaNaoConciliada: string }>

// Fecho com validação de balanceamento
concluirReconciliacao(id: string, ctx: Ctx): Promise<void>
cancelarReconciliacao(id: string, ctx: Ctx): Promise<void>

// Leitura do workspace (razão vs extracto + saldos)
obterReconciliacao(id: string, ctx: Ctx): Promise<ReconciliacaoDetalhe>
```

### Cálculo de saldo contabilístico (agregação)

```ts
// Saldo da conta bancária = Σ débitos − Σ créditos das partidas da contaContabilId
// em lançamentos LANCADO, até à data-limite. Natureza DEVEDORA (classe 1).
async function saldoContabilAte(contaId: string, ate: Date, ctx: Ctx): Promise<Decimal> {
  const agg = await prisma.partidaLancamento.groupBy({
    by: ['tipo'],
    where: {
      tenantId: ctx.tenantId, contaId,
      lancamento: { status: 'LANCADO', data: { lte: ate } },
    },
    _sum: { valor: true },
  });
  const deb = agg.find(a => a.tipo === 'DEBITO')?._sum.valor ?? new Decimal(0);
  const cred = agg.find(a => a.tipo === 'CREDITO')?._sum.valor ?? new Decimal(0);
  return deb.minus(cred); // conta devedora
}
```

### Recálculo da diferença (invariante)

`diferencaNaoConciliada = (saldoFinalBanco − saldoFinalContabil) − ajusteConciliado`,
onde `ajusteConciliado` é a soma líquida dos itens já conciliados que explicam a
diferença. Executado sempre dentro da transacção de `marcarItemReconciliado` e de
`concluirReconciliacao`, nunca a partir de valores vindos do cliente.

## Máquina de estados

```ts
const TRANSICOES_RECONCILIACAO: Record<StatusReconciliacao, StatusReconciliacao[]> = {
  EM_ANDAMENTO: ['CONCLUIDA', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: [],
};
```

`concluir` exige `diferencaNaoConciliada == 0` OU `observacoes` não-vazio
(justificação). Property test: nenhuma sequência de conciliar/desconciliar leva a
uma diferença que contradiga a soma dos itens; `CONCLUIDA`/`CANCELADA` são terminais.

## Importação de extracto (Route Handler + action)

- Parsing e validação Zod na Server Action (`ImportarExtratoSchema`: array de linhas
  `{ data, descricao, valor, tipoMovimento, extratoReferencia }`).
- `importarExtrato` no serviço faz `createMany` com `skipDuplicates` sobre a chave
  `[tenantId, reconciliacaoId, extratoReferencia]` (idempotência do Requisito 4).
- Exportação do relatório de reconciliação (CSV/PDF) via
  `src/app/api/contabilidade/reconciliacao/[id]/export/route.ts` com `withApi`.

## Validações (`src/lib/validations/contabilidade.ts` — acrescentar)

- `ContaBancariaSchema` (Create/Update/Filter).
- `IniciarReconciliacaoSchema` (já existe — estender com validação de intervalo).
- `ImportarExtratoSchema`, `MarcarItemSchema` (`conciliado: boolean`),
  `AutoMatchSchema` (janela de dias, tolerância).

## Actions (`contabilidade.actions.ts` — acrescentar)

`criarContaBancariaAction`, `iniciarReconciliacaoAction` (existe),
`importarExtratoAction`, `sugerirMatchesAction`, `marcarItemReconciliadoAction`
(existe — ajustar schema), `concluirReconciliacaoAction` (existe),
`cancelarReconciliacaoAction`. Permissão base `financas:banca:reconciliacao`
(já no catálogo `prisma/seed/rbac.ts`); acrescentar `financas:banca:contas:*`.

## UI (golden standard `compras/requisicoes`)

```
/contabilidade/reconciliacao/                page.tsx (lista — existe)
/contabilidade/reconciliacao/nova/           page.tsx (Server) + _components (form 'use client')
/contabilidade/reconciliacao/[id]/           page.tsx (workspace 2 colunas)
                                             _components/matching-board.tsx ('use client')
/contabilidade/reconciliacao/[id]/importar/  page.tsx (upload CSV)
```

- Workspace: duas `DataTable` (razão | extracto), selecção múltipla, botões
  *Conciliar*, *Auto-match*, *Importar extracto*, *Concluir* (`AlertDialog`).
- Cartão de saldos: banco vs contabilístico vs diferença (tokens, dark mode).

## Riscos e mitigações

- **Saldo contabilístico caro (N lançamentos):** agregação com índice
  `[tenantId, contaId, tipo]` já existente em `PartidaLancamento`; snapshot por
  reconciliação evita recomputar tudo a cada acção.
- **Concorrência em matching:** todas as escritas de `conciliado` + recálculo da
  diferença numa `$transaction` com o `tenantId` explícito.
- **Fuga cross-tenant:** repetir o padrão do fecho do BLOCKER da Wave 2 — filtrar
  `tenantId` em `findFirst`/`update` (não confiar no scoping da extensão).
