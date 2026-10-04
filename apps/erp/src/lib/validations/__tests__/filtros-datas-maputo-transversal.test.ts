/**
 * Issue #349 — os filtros de intervalo de datas FORA da contabilidade lêem `aaaa-mm-dd`
 * como o dia civil INTEIRO em Maputo (o contrato que o #88 fixou para a contabilidade).
 *
 * `z.coerce.date('2026-12-01')` dá 2026-12-01T00:00Z = 02:00 em Maputo: como `gte`, deixa
 * de fora o que aconteceu entre a meia-noite e as 02h00 do primeiro dia; como `lte`,
 * `'2026-12-31'` deixa de fora quase todo o último dia. Contrato, por cada limite:
 *   início `aaaa-mm-dd` → `T00:00:00.000+02:00` · fim `aaaa-mm-dd` → `T23:59:59.999+02:00`
 *   Date e strings ISO com hora passam inalterados · lixo continua recusado ·
 *   campos opcionais continuam opcionais.
 *
 * EXCLUÍDOS de propósito (ver o último bloco): FilterTimesheetSchema e
 * FilterAssiduidadeSchema — as colunas filtradas são `@db.Date` (dia sem hora), e o
 * Postgres compara-as com o dia do parâmetro; ali a meia-noite UTC É o dia certo.
 *
 * Instantes comparados por `getTime()` contra literais com `+02:00` — nunca com getters de
 * hora local (o host e o CI correm em fusos diferentes).
 *
 * Escrito pelo autor do oráculo (run datas-349, nó B2); um agente de implementação que o
 * altere é BLOCKER.
 */
import { describe, it, expect } from 'vitest';
import type { ZodTypeAny } from 'zod';
import { FiltroSessaoCaixaSchema, FiltroMovimentoCaixaSchema } from '@/lib/validations/caixa';
import {
  FilterRequisicaoCompraSchema,
  FilterCotacaoSchema,
  FilterPedidoCompraSchema,
  FilterRecebimentoCompraSchema,
  FilterPagamentoSchema,
  FilterContaPagarSchema,
} from '@/lib/validations/compras';
import {
  FiltroFaturaSchema,
  FiltroNotaCreditoSchema,
  FiltroNotaDebitoSchema,
  FiltroProformaSchema,
  FiltroCotacaoComercialSchema,
} from '@/lib/validations/faturacao';
import {
  AtivoFilterSchema,
  ManutencaoAtivoFilterSchema,
  InventarioFisicoFilterSchema,
} from '@/lib/validations/inventario-ativos';
import { FilterContagemSchema } from '@/lib/validations/inventario-contagem';
import { FilterOrdemProducaoSchema } from '@/lib/validations/producao';
import { FilterComunicacaoSchema, FilterTimesheetSchema } from '@/lib/validations/projetos';
import {
  FilterAusenciaSchema,
  FilterFormacaoSchema,
  FilterAssiduidadeSchema,
} from '@/lib/validations/rh';
import { FilterAgendamentoServicoSchema } from '@/lib/validations/servicos';
import { MovimentoStockFilterSchema } from '@/lib/validations/stock';
import { FiltroCompromissoSchema } from '@/lib/validations/tesouraria';
import { FiltrarTicketsSchema } from '@/lib/validations/tickets';
import {
  FiltrarManutencoesSchema,
  FiltrarAtividadesSchema,
  FiltrarRotasSchema,
  FiltrarEntregasSchema,
  FiltrarAbastecimentosSchema,
} from '@/lib/validations/transporte';
import {
  FilterVendaSchema,
  FilterComissaoSchema,
  FilterEncomendaSchema,
  FilterDevolucaoSchema,
} from '@/lib/validations/vendas';

/** Um par (início, fim) de um schema. Nenhum destes schemas tem campos obrigatórios. */
type Par = { nome: string; schema: ZodTypeAny; inicio: string; fim: string };

const par = (nome: string, schema: ZodTypeAny, inicio = 'dataInicio', fim = 'dataFim'): Par => ({
  nome: `${nome} (${inicio}/${fim})`,
  schema,
  inicio,
  fim,
});

const PARES: Par[] = [
  // caixa
  par('FiltroSessaoCaixaSchema', FiltroSessaoCaixaSchema),
  par('FiltroMovimentoCaixaSchema', FiltroMovimentoCaixaSchema),
  // compras
  par('FilterRequisicaoCompraSchema', FilterRequisicaoCompraSchema),
  par('FilterCotacaoSchema', FilterCotacaoSchema),
  par('FilterPedidoCompraSchema', FilterPedidoCompraSchema),
  par('FilterRecebimentoCompraSchema', FilterRecebimentoCompraSchema),
  par('FilterPagamentoSchema', FilterPagamentoSchema),
  par('FilterContaPagarSchema', FilterContaPagarSchema, 'dataVencimentoInicio', 'dataVencimentoFim'),
  // faturação
  par('FiltroFaturaSchema', FiltroFaturaSchema, 'dataEmissaoInicio', 'dataEmissaoFim'),
  par('FiltroFaturaSchema', FiltroFaturaSchema, 'dataVencimentoInicio', 'dataVencimentoFim'),
  par('FiltroNotaCreditoSchema', FiltroNotaCreditoSchema),
  par('FiltroNotaDebitoSchema', FiltroNotaDebitoSchema),
  par('FiltroProformaSchema', FiltroProformaSchema),
  par('FiltroCotacaoComercialSchema', FiltroCotacaoComercialSchema),
  // inventário / activos
  par('AtivoFilterSchema', AtivoFilterSchema, 'dataAquisicaoInicio', 'dataAquisicaoFim'),
  par('ManutencaoAtivoFilterSchema', ManutencaoAtivoFilterSchema),
  par('InventarioFisicoFilterSchema', InventarioFisicoFilterSchema),
  par('FilterContagemSchema', FilterContagemSchema),
  // produção
  par('FilterOrdemProducaoSchema', FilterOrdemProducaoSchema),
  // projectos
  par('FilterComunicacaoSchema', FilterComunicacaoSchema),
  // RH
  par('FilterAusenciaSchema', FilterAusenciaSchema),
  par('FilterFormacaoSchema', FilterFormacaoSchema),
  // serviços
  par('FilterAgendamentoServicoSchema', FilterAgendamentoServicoSchema),
  // stock
  par('MovimentoStockFilterSchema', MovimentoStockFilterSchema),
  // tesouraria
  par('FiltroCompromissoSchema', FiltroCompromissoSchema),
  // tickets
  par('FiltrarTicketsSchema', FiltrarTicketsSchema),
  // transporte
  par('FiltrarManutencoesSchema', FiltrarManutencoesSchema),
  par('FiltrarAtividadesSchema', FiltrarAtividadesSchema),
  par('FiltrarRotasSchema', FiltrarRotasSchema),
  par('FiltrarEntregasSchema', FiltrarEntregasSchema),
  par('FiltrarAbastecimentosSchema', FiltrarAbastecimentosSchema),
  // vendas
  par('FilterVendaSchema', FilterVendaSchema),
  par('FilterComissaoSchema', FilterComissaoSchema),
  par('FilterEncomendaSchema', FilterEncomendaSchema),
  par('FilterDevolucaoSchema', FilterDevolucaoSchema),
];

const t = (iso: string) => new Date(iso).getTime();

function intervalo(p: Par, inicio: unknown, fim: unknown) {
  const r = p.schema.safeParse({ [p.inicio]: inicio, [p.fim]: fim });
  expect(r.success, r.success ? '' : JSON.stringify(r.error.issues)).toBe(true);
  const data = r.data as Record<string, Date | undefined>;
  return { inicio: data[p.inicio], fim: data[p.fim] };
}

describe.each(PARES)('$nome — intervalo aaaa-mm-dd em dias civis de Maputo (#349)', (p) => {
  const dezembro = () => intervalo(p, '2026-12-01', '2026-12-31');

  it('início aaaa-mm-dd vira a meia-noite de Maputo (00:00:00.000 +02:00)', () => {
    const { inicio } = dezembro();
    expect(inicio).toBeInstanceOf(Date);
    expect(inicio!.getTime()).toBe(t('2026-12-01T00:00:00.000+02:00'));
  });

  it('fim aaaa-mm-dd vira o último milissegundo do dia em Maputo (23:59:59.999 +02:00)', () => {
    const { fim } = dezembro();
    expect(fim).toBeInstanceOf(Date);
    expect(fim!.getTime()).toBe(t('2026-12-31T23:59:59.999+02:00'));
  });

  it('um registo ao meio-dia do último dia fica dentro do intervalo', () => {
    const { inicio, fim } = dezembro();
    const x = t('2026-12-31T12:00:00+02:00');
    expect(x >= inicio!.getTime() && x <= fim!.getTime()).toBe(true);
  });

  it('um registo à 01h00 do primeiro dia em Maputo fica dentro pelo início', () => {
    const { inicio } = dezembro();
    expect(t('2026-12-01T01:00:00+02:00') >= inicio!.getTime()).toBe(true);
  });

  it('um registo do dia anterior em Maputo (30/11 às 23h30) fica fora pelo início', () => {
    const { inicio } = dezembro();
    expect(t('2026-11-30T23:30:00+02:00') >= inicio!.getTime()).toBe(false);
  });

  it('um registo do dia seguinte em Maputo (01/01 às 00h30) fica fora pelo fim', () => {
    const { fim } = dezembro();
    expect(t('2027-01-01T00:30:00+02:00') <= fim!.getTime()).toBe(false);
  });

  it('um Date já construído passa inalterado', () => {
    const a = new Date('2026-12-01T00:00:00.000+02:00');
    const b = new Date('2026-12-31T23:59:59.999+02:00');
    const { inicio, fim } = intervalo(p, a, b);
    expect(inicio!.getTime()).toBe(a.getTime());
    expect(fim!.getTime()).toBe(b.getTime());
  });

  it('um Date à meia-noite UTC passa inalterado (o schema não reinterpreta Dates)', () => {
    const a = new Date('2026-12-01T00:00:00.000Z');
    const b = new Date('2026-12-31T00:00:00.000Z');
    const { inicio, fim } = intervalo(p, a, b);
    expect(inicio!.getTime()).toBe(a.getTime());
    expect(fim!.getTime()).toBe(b.getTime());
  });

  it('uma string ISO com hora passa exactamente para esse instante', () => {
    const { inicio, fim } = intervalo(p, '2026-12-01T08:15:00.000+02:00', '2026-12-31T17:45:00.000+02:00');
    expect(inicio!.getTime()).toBe(t('2026-12-01T08:15:00.000+02:00'));
    expect(fim!.getTime()).toBe(t('2026-12-31T17:45:00.000+02:00'));
  });

  it('uma string que não é data continua recusada', () => {
    expect(p.schema.safeParse({ [p.inicio]: 'nao-e-data', [p.fim]: '2026-12-31' }).success).toBe(false);
    expect(p.schema.safeParse({ [p.inicio]: '2026-12-01', [p.fim]: 'nao-e-data' }).success).toBe(false);
  });

  it('sem datas, faz parse com os dois limites undefined', () => {
    const r = p.schema.safeParse({});
    expect(r.success).toBe(true);
    const data = r.data as Record<string, unknown>;
    expect(data[p.inicio]).toBeUndefined();
    expect(data[p.fim]).toBeUndefined();
  });
});

describe('FiltroCompromissoSchema — a regra fim < início continua a funcionar (#349)', () => {
  it('o mesmo dia nos dois limites é aceite', () => {
    expect(FiltroCompromissoSchema.safeParse({ dataInicio: '2026-12-01', dataFim: '2026-12-01' }).success).toBe(
      true,
    );
  });

  it('fim anterior ao início é recusado no campo dataFim', () => {
    const r = FiltroCompromissoSchema.safeParse({ dataInicio: '2026-12-01', dataFim: '2026-11-30' });
    expect(r.success).toBe(false);
    expect(r.error!.issues.some((i) => i.path.join('.') === 'dataFim')).toBe(true);
  });
});

/**
 * GUARDA — colunas `@db.Date` (`Timesheet.data`, `RegistoAssiduidade.data`).
 *
 * Uma coluna `date` não tem hora: o Prisma envia o parâmetro e o Postgres compara pelo dia.
 * A meia-noite UTC de `'2026-12-31'` é exactamente o dia 31 nessa coluna; deslocá-la para
 * `23:59:59.999+02:00` (= 21:59:59.999Z do mesmo dia) ainda dava o dia 31, mas o início em
 * `00:00+02:00` (= 22:00Z do dia ANTERIOR) passaria a apanhar o dia 30. Por isso estes dois
 * schemas ficam como estão — e este bloco prova-o.
 */
describe.each([
  { nome: 'FilterTimesheetSchema', schema: FilterTimesheetSchema as ZodTypeAny },
  { nome: 'FilterAssiduidadeSchema', schema: FilterAssiduidadeSchema as ZodTypeAny },
])('$nome — coluna @db.Date: aaaa-mm-dd continua à meia-noite UTC (excluído do #349)', ({ schema }) => {
  it('início e fim aaaa-mm-dd ficam à meia-noite UTC do próprio dia', () => {
    const r = schema.safeParse({ dataInicio: '2026-12-01', dataFim: '2026-12-31' });
    expect(r.success).toBe(true);
    const data = r.data as { dataInicio: Date; dataFim: Date };
    expect(data.dataInicio.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(data.dataFim.toISOString()).toBe('2026-12-31T00:00:00.000Z');
  });
});
