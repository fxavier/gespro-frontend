import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma, prismaBase } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { paginate } from '@/server/db/paginate';
import type {
  CriarContaPGCInput,
  AtualizarContaPGCInput,
  FiltroContaPGCInput,
  CriarDiarioInput,
  AtualizarDiarioInput,
  CriarCentroCustoInput,
  AtualizarCentroCustoInput,
  FiltroCentroCustoInput,
  CriarLancamentoInput,
  EstornarLancamentoInput,
  FiltroLancamentoInput,
  CriarContaBancariaInput,
  AtualizarContaBancariaInput,
  IniciarReconciliacaoInput,
  MarcarItemReconciliadoInput,
  ImportarExtratoInput,
  AutoMatchInput,
  ConcluirReconciliacaoInput,
  FiltroBalanceteInput,
  FiltroRazaoInput,
  FiltroDREInput,
} from '@/lib/validations/contabilidade';
import {
  calcularDiferencaNaoConciliada,
  sugerirMatchesPuro,
  transitarReconciliacao,
  type MatchSugerido,
} from './reconciliacao.helpers';
import {
  TRANSICOES_LANCAMENTO,
  type StatusLancamento,
  type ContaPGC,
  type Diario,
  type CentroCusto,
  type Lancamento,
  type LancamentoComPartidas,
  type ContaBancaria,
  type ReconciliacaoBancaria,
  type ReconciliacaoDetalhe,
  type ReconciliacaoComConta,
  type StatusReconciliacao,
  type Balancete,
  type LinhaRazao,
  type DRE,
  type PaginacaoContabilidade,
  type RegistarLancamentoContabilisticoInput,
  type Ctx,
} from './contabilidade.interface';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function periodoFiscalDe(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

function transitarEstado(atual: StatusLancamento, alvo: StatusLancamento): void {
  const permitidas = TRANSICOES_LANCAMENTO[atual];
  if (!permitidas.includes(alvo)) {
    throw new BusinessRuleError(
      'TRANSICAO_INVALIDA',
      `Transição inválida: ${atual} → ${alvo}. Permitidas: ${permitidas.join(', ') || 'nenhuma'}`,
    );
  }
}

/** Resolve contaCodigo → contaId dentro de uma transacção (cross-domain). */
async function resolverContaPorCodigo(
  tx: Prisma.TransactionClient,
  codigo: string,
  tenantId: string,
): Promise<{ id: string }> {
  const conta = await tx.contaPGC.findFirst({
    where: { codigo, tenantId, ativo: true },
    select: { id: true, aceitaLancamento: true },
  });
  if (!conta) throw new NotFoundError(`Conta PGC "${codigo}" não encontrada`);
  if (!conta.aceitaLancamento) {
    throw new BusinessRuleError(
      'CONTA_NAO_ACEITA_LANCAMENTO',
      `Conta "${codigo}" não aceita lançamentos directos`,
    );
  }
  return { id: conta.id };
}

async function resolverCentroCustoPorCodigo(
  tx: Prisma.TransactionClient,
  codigo: string,
  tenantId: string,
): Promise<string | null> {
  const cc = await tx.centroCusto.findFirst({
    where: { codigo, tenantId, ativo: true },
    select: { id: true },
  });
  return cc?.id ?? null;
}

async function proximoNumeroLancamento(
  tx: Prisma.TransactionClient,
  diarioId: string,
  periodoFiscal: string,
  tenantId: string,
): Promise<string> {
  // Serializar via lock da linha do Diário para evitar corrida (W7).
  // Qualquer transacção concorrente que queira numerar no mesmo diário espera.
  await tx.$queryRaw`SELECT id FROM "Diario" WHERE id = ${diarioId} FOR UPDATE`;
  const count = await tx.lancamento.count({ where: { tenantId, diarioId, periodoFiscal } });
  return String(count + 1).padStart(6, '0');
}

// ---------------------------------------------------------------------------
// Plano de contas
// ---------------------------------------------------------------------------

export async function criarConta(input: CriarContaPGCInput, ctx: Ctx): Promise<ContaPGC> {
  const existente = await prisma.contaPGC.findFirst({
    where: { codigo: input.codigo, tenantId: ctx.tenantId },
  });
  if (existente) {
    throw new BusinessRuleError('CONTA_DUPLICADA', `Conta "${input.codigo}" já existe`);
  }
  return prisma.contaPGC.create({
    data: { tenantId: ctx.tenantId, ...input },
  }) as unknown as ContaPGC;
}

export async function atualizarConta(input: AtualizarContaPGCInput, ctx: Ctx): Promise<ContaPGC> {
  const { id, ...data } = input;
  const conta = await prisma.contaPGC.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!conta) throw new NotFoundError('Conta não encontrada');
  return prisma.contaPGC.update({ where: { id }, data }) as unknown as ContaPGC;
}

export async function desativarConta(id: string, ctx: Ctx): Promise<ContaPGC> {
  const conta = await prisma.contaPGC.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!conta) throw new NotFoundError('Conta não encontrada');
  const comUso = await prisma.partidaLancamento.count({ where: { contaId: id, tenantId: ctx.tenantId } });
  if (comUso > 0) {
    throw new BusinessRuleError('CONTA_COM_LANCAMENTOS', 'Conta tem lançamentos — não pode ser desativada');
  }
  return prisma.contaPGC.update({ where: { id }, data: { ativo: false } }) as unknown as ContaPGC;
}

export async function obterConta(id: string, ctx: Ctx): Promise<ContaPGC | null> {
  return prisma.contaPGC.findFirst({ where: { id, tenantId: ctx.tenantId } }) as unknown as ContaPGC | null;
}

export async function listarContas(filtro: FiltroContaPGCInput, ctx: Ctx): Promise<PaginacaoContabilidade<ContaPGC>> {
  return paginate(
    (a) =>
      prisma.contaPGC.findMany({
        ...a,
        where: {
          tenantId: ctx.tenantId,
          ...(filtro.classe ? { classe: filtro.classe } : {}),
          ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
          ...(filtro.nivel !== undefined ? { nivel: filtro.nivel } : {}),
          ...(filtro.aceitaLancamento !== undefined ? { aceitaLancamento: filtro.aceitaLancamento } : {}),
          ...(filtro.ativo !== undefined ? { ativo: filtro.ativo } : {}),
          ...(filtro.search
            ? { OR: [{ nome: { contains: filtro.search, mode: 'insensitive' } }, { codigo: { contains: filtro.search } }] }
            : {}),
        },
        orderBy: { codigo: 'asc' },
      }),
    { cursor: filtro.cursor, take: filtro.take },
  ) as unknown as Promise<PaginacaoContabilidade<ContaPGC>>;
}

export async function arvoreContas(ctx: Ctx): Promise<ContaPGC[]> {
  return prisma.contaPGC.findMany({
    where: { tenantId: ctx.tenantId, ativo: true },
    orderBy: { codigo: 'asc' },
  }) as unknown as ContaPGC[];
}

// ---------------------------------------------------------------------------
// Diários
// ---------------------------------------------------------------------------

export async function criarDiario(input: CriarDiarioInput, ctx: Ctx): Promise<Diario> {
  return prisma.diario.create({
    data: { tenantId: ctx.tenantId, ...input },
  }) as unknown as Diario;
}

export async function atualizarDiario(input: AtualizarDiarioInput, ctx: Ctx): Promise<Diario> {
  const { id, ...data } = input;
  const diario = await prisma.diario.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!diario) throw new NotFoundError('Diário não encontrado');
  return prisma.diario.update({ where: { id }, data }) as unknown as Diario;
}

export async function listarDiarios(ctx: Ctx): Promise<Diario[]> {
  return prisma.diario.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { codigo: 'asc' },
  }) as unknown as Diario[];
}

// ---------------------------------------------------------------------------
// Centros de custo
// ---------------------------------------------------------------------------

export async function criarCentroCusto(input: CriarCentroCustoInput, ctx: Ctx): Promise<CentroCusto> {
  return prisma.centroCusto.create({
    data: {
      tenantId: ctx.tenantId,
      ...input,
      orcamento: input.orcamento !== undefined ? new Prisma.Decimal(input.orcamento) : undefined,
    },
  }) as unknown as CentroCusto;
}

export async function atualizarCentroCusto(input: AtualizarCentroCustoInput, ctx: Ctx): Promise<CentroCusto> {
  const { id, ...data } = input;
  const cc = await prisma.centroCusto.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!cc) throw new NotFoundError('Centro de custo não encontrado');
  return prisma.centroCusto.update({
    where: { id },
    data: {
      ...data,
      orcamento: data.orcamento !== undefined ? new Prisma.Decimal(data.orcamento) : undefined,
    },
  }) as unknown as CentroCusto;
}

export async function listarCentrosCusto(filtro: FiltroCentroCustoInput, ctx: Ctx): Promise<PaginacaoContabilidade<CentroCusto>> {
  return paginate(
    (a) =>
      prisma.centroCusto.findMany({
        ...a,
        where: {
          tenantId: ctx.tenantId,
          ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
          ...(filtro.ativo !== undefined ? { ativo: filtro.ativo } : {}),
        },
        orderBy: { codigo: 'asc' },
      }),
    { cursor: filtro.cursor, take: filtro.take },
  ) as unknown as Promise<PaginacaoContabilidade<CentroCusto>>;
}

// ---------------------------------------------------------------------------
// Lançamentos (UI path — partidas com contaId resolvido pelo cliente)
// ---------------------------------------------------------------------------

export async function criarLancamento(input: CriarLancamentoInput, ctx: Ctx): Promise<LancamentoComPartidas> {
  return prismaBase.$transaction(async (tx) => {
    const diario = await tx.diario.findFirst({
      where: { id: input.diarioId, tenantId: ctx.tenantId, ativo: true },
    });
    if (!diario) throw new NotFoundError('Diário não encontrado ou inactivo');

    const periodo = periodoFiscalDe(input.data);
    const numero = await proximoNumeroLancamento(tx, diario.id, periodo, ctx.tenantId);

    // Invariante débito=crédito (Decimal exacto a partir de number)
    let totalDebito = new Prisma.Decimal(0);
    let totalCredito = new Prisma.Decimal(0);
    for (const p of input.partidas) {
      const v = new Prisma.Decimal(p.valor.toFixed(2));
      if (p.tipo === 'DEBITO') totalDebito = totalDebito.plus(v);
      else totalCredito = totalCredito.plus(v);
    }
    if (!totalDebito.equals(totalCredito)) {
      throw new BusinessRuleError(
        'PARTIDAS_DESEQUILIBRADAS',
        `Débitos (${totalDebito}) ≠ Créditos (${totalCredito})`,
      );
    }

    const lancamento = await tx.lancamento.create({
      data: {
        tenantId: ctx.tenantId,
        numero,
        data: input.data,
        tipo: 'MANUAL',
        origem: input.origem ?? 'MANUAL',
        diarioId: diario.id,
        documentoOrigemId: input.documentoOrigemId ?? null,
        documentoOrigemTipo: input.documentoOrigemTipo ?? null,
        historico: input.historico,
        valorTotal: totalDebito,
        status: 'RASCUNHO',
        periodoFiscal: periodo,
        observacoes: input.observacoes ?? null,
        criadoPorId: ctx.userId,
      },
    });

    for (const p of input.partidas) {
      // Verificar que a conta aceita lançamentos
      const conta = await tx.contaPGC.findFirst({
        where: { id: p.contaId, tenantId: ctx.tenantId },
        select: { aceitaLancamento: true },
      });
      if (!conta) throw new NotFoundError(`Conta ${p.contaId} não encontrada`);
      if (!conta.aceitaLancamento) {
        throw new BusinessRuleError('CONTA_NAO_ACEITA_LANCAMENTO', `Conta ${p.contaId} não aceita lançamentos`);
      }
      await tx.partidaLancamento.create({
        data: {
          tenantId: ctx.tenantId,
          lancamentoId: lancamento.id,
          contaId: p.contaId,
          centroCustoId: p.centroCustoId ?? null,
          tipo: p.tipo,
          valor: new Prisma.Decimal(p.valor.toFixed(2)),
          historico: p.historico ?? null,
        },
      });
    }

    return tx.lancamento.findFirst({
      where: { id: lancamento.id },
      include: {
        partidas: {
          include: {
            conta: { select: { id: true, codigo: true, nome: true, natureza: true } },
            centroCusto: { select: { id: true, codigo: true, nome: true } },
          },
        },
        diario: { select: { id: true, codigo: true, nome: true, tipo: true } },
      },
    }) as unknown as LancamentoComPartidas;
  });
}

export async function confirmarLancamento(id: string, ctx: Ctx): Promise<Lancamento> {
  const lancamento = await prisma.lancamento.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!lancamento) throw new NotFoundError('Lançamento não encontrado');
  transitarEstado(lancamento.status as StatusLancamento, 'LANCADO');
  return prisma.lancamento.update({ where: { id }, data: { status: 'LANCADO' } }) as unknown as Lancamento;
}

export async function estornarLancamento(input: EstornarLancamentoInput, ctx: Ctx): Promise<Lancamento> {
  return prismaBase.$transaction(async (tx) => {
    const lancamento = await tx.lancamento.findFirst({
      where: { id: input.lancamentoId, tenantId: ctx.tenantId },
      include: { partidas: true },
    });
    if (!lancamento) throw new NotFoundError('Lançamento não encontrado');
    transitarEstado(lancamento.status as StatusLancamento, 'ESTORNADO');

    const dataEstorno = input.data ?? new Date();
    const periodo = periodoFiscalDe(dataEstorno);
    const numero = await proximoNumeroLancamento(tx, lancamento.diarioId, periodo, ctx.tenantId);

    const estorno = await tx.lancamento.create({
      data: {
        tenantId: ctx.tenantId,
        numero,
        data: dataEstorno,
        tipo: 'ESTORNO',
        origem: lancamento.origem,
        diarioId: lancamento.diarioId,
        documentoOrigemId: lancamento.id,
        documentoOrigemTipo: 'Lancamento',
        historico: `ESTORNO: ${lancamento.historico}`,
        valorTotal: lancamento.valorTotal,
        status: 'LANCADO',
        periodoFiscal: periodo,
        observacoes: input.motivo,
        criadoPorId: ctx.userId,
        lancamentoEstornoId: lancamento.id,
      },
    });

    for (const p of lancamento.partidas) {
      await tx.partidaLancamento.create({
        data: {
          tenantId: ctx.tenantId,
          lancamentoId: estorno.id,
          contaId: p.contaId,
          centroCustoId: p.centroCustoId,
          tipo: p.tipo === 'DEBITO' ? 'CREDITO' : 'DEBITO',
          valor: p.valor,
          historico: p.historico,
        },
      });
    }

    return tx.lancamento.update({
      where: { id: lancamento.id },
      data: { status: 'ESTORNADO' },
    }) as unknown as Lancamento;
  });
}

export async function obterLancamento(id: string, ctx: Ctx): Promise<LancamentoComPartidas | null> {
  return prisma.lancamento.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      partidas: {
        include: {
          conta: { select: { id: true, codigo: true, nome: true, natureza: true } },
          centroCusto: { select: { id: true, codigo: true, nome: true } },
        },
      },
      diario: { select: { id: true, codigo: true, nome: true, tipo: true } },
    },
  }) as unknown as LancamentoComPartidas | null;
}

export async function listarLancamentos(filtro: FiltroLancamentoInput, ctx: Ctx): Promise<PaginacaoContabilidade<LancamentoComPartidas>> {
  return paginate(
    (a) =>
      prisma.lancamento.findMany({
        ...a,
        where: {
          tenantId: ctx.tenantId,
          ...(filtro.diarioId ? { diarioId: filtro.diarioId } : {}),
          ...(filtro.status ? { status: filtro.status } : {}),
          ...(filtro.origem ? { origem: filtro.origem } : {}),
          ...(filtro.periodoFiscal ? { periodoFiscal: filtro.periodoFiscal } : {}),
          ...(filtro.dataInicio || filtro.dataFim
            ? { data: { ...(filtro.dataInicio ? { gte: filtro.dataInicio } : {}), ...(filtro.dataFim ? { lte: filtro.dataFim } : {}) } }
            : {}),
        },
        include: {
          partidas: {
            include: {
              conta: { select: { id: true, codigo: true, nome: true, natureza: true } },
              centroCusto: { select: { id: true, codigo: true, nome: true } },
            },
          },
          diario: { select: { id: true, codigo: true, nome: true, tipo: true } },
        },
        orderBy: { data: 'desc' },
      }),
    { cursor: filtro.cursor, take: filtro.take },
  ) as unknown as Promise<PaginacaoContabilidade<LancamentoComPartidas>>;
}

// ---------------------------------------------------------------------------
// Relatórios
// ---------------------------------------------------------------------------

export async function gerarBalancete(filtro: FiltroBalanceteInput, ctx: Ctx): Promise<Balancete> {
  const partidas = await prisma.partidaLancamento.findMany({
    where: {
      tenantId: ctx.tenantId,
      lancamento: {
        data: { gte: filtro.dataInicio, lte: filtro.dataFim },
        status: { not: 'ESTORNADO' },
      },
    },
    include: {
      conta: { select: { id: true, codigo: true, nome: true, tipo: true, natureza: true } },
    },
  });

  const mapa = new Map<string, { conta: typeof partidas[0]['conta']; debitos: Prisma.Decimal; creditos: Prisma.Decimal }>();
  for (const p of partidas) {
    const e = mapa.get(p.contaId) ?? { conta: p.conta, debitos: new Prisma.Decimal(0), creditos: new Prisma.Decimal(0) };
    if (p.tipo === 'DEBITO') e.debitos = e.debitos.plus(p.valor);
    else e.creditos = e.creditos.plus(p.valor);
    mapa.set(p.contaId, e);
  }

  let totalDebitos = new Prisma.Decimal(0);
  let totalCreditos = new Prisma.Decimal(0);

  const contas = Array.from(mapa.values())
    .filter((e) => filtro.incluirZeradas || !e.debitos.equals(0) || !e.creditos.equals(0))
    .map((e) => {
      totalDebitos = totalDebitos.plus(e.debitos);
      totalCreditos = totalCreditos.plus(e.creditos);
      const saldoAtual = e.conta.natureza === 'DEVEDORA'
        ? e.debitos.minus(e.creditos)
        : e.creditos.minus(e.debitos);
      return {
        conta: e.conta,
        saldoAnterior: new Prisma.Decimal(0),
        debitos: e.debitos,
        creditos: e.creditos,
        saldoAtual,
      };
    })
    .sort((a, b) => a.conta.codigo.localeCompare(b.conta.codigo));

  return { dataInicio: filtro.dataInicio, dataFim: filtro.dataFim, contas, totalDebitos, totalCreditos };
}

export async function razaoConta(filtro: FiltroRazaoInput, ctx: Ctx): Promise<LinhaRazao[]> {
  const conta = await prisma.contaPGC.findFirst({ where: { id: filtro.contaId, tenantId: ctx.tenantId } });
  if (!conta) throw new NotFoundError('Conta não encontrada');

  const partidas = await prisma.partidaLancamento.findMany({
    where: {
      tenantId: ctx.tenantId,
      contaId: filtro.contaId,
      lancamento: {
        data: { gte: filtro.dataInicio, lte: filtro.dataFim },
        status: { not: 'ESTORNADO' },
      },
    },
    include: {
      lancamento: { select: { id: true, data: true, historico: true, origem: true } },
    },
    orderBy: { lancamento: { data: 'asc' } },
  });

  let saldo = new Prisma.Decimal(0);
  const isDevedora = conta.natureza === 'DEVEDORA';

  return partidas.map((p) => {
    if (p.tipo === 'DEBITO') saldo = isDevedora ? saldo.plus(p.valor) : saldo.minus(p.valor);
    else saldo = isDevedora ? saldo.minus(p.valor) : saldo.plus(p.valor);
    return {
      lancamentoId: p.lancamentoId,
      data: p.lancamento.data,
      historico: p.historico ?? p.lancamento.historico,
      debito: p.tipo === 'DEBITO' ? p.valor : null,
      credito: p.tipo === 'CREDITO' ? p.valor : null,
      saldoAcumulado: saldo,
      origem: p.lancamento.origem as LinhaRazao['origem'],
    };
  });
}

export async function gerarDRE(filtro: FiltroDREInput, ctx: Ctx): Promise<DRE> {
  const partidas = await prisma.partidaLancamento.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(filtro.centroCustoId ? { centroCustoId: filtro.centroCustoId } : {}),
      lancamento: {
        data: { gte: filtro.dataInicio, lte: filtro.dataFim },
        status: { not: 'ESTORNADO' },
      },
    },
    include: {
      conta: { select: { codigo: true, natureza: true } },
    },
  });

  // Saldo líquido das partidas para um prefixo de código de conta
  function saldoPrefixo(prefixo: string): Prisma.Decimal {
    let s = new Prisma.Decimal(0);
    for (const p of partidas.filter((p) => p.conta.codigo.startsWith(prefixo))) {
      const isDevedora = p.conta.natureza === 'DEVEDORA';
      if (p.tipo === 'DEBITO') s = isDevedora ? s.plus(p.valor) : s.minus(p.valor);
      else s = isDevedora ? s.minus(p.valor) : s.plus(p.valor);
    }
    return s.abs(); // retornar valor absoluto — o sinal é interpretado pelo contexto DRE
  }

  const receitaBruta = saldoPrefixo('7');
  const deducoes = new Prisma.Decimal(0);
  const receitaLiquida = receitaBruta.minus(deducoes);
  const custoProdutosVendidos = saldoPrefixo('6.1');
  const lucroBruto = receitaLiquida.minus(custoProdutosVendidos);
  const despesasVendas = saldoPrefixo('6.2');
  const despesasAdministrativas = saldoPrefixo('6.3');
  const despesasGerais = saldoPrefixo('6.4').plus(saldoPrefixo('6.5')).plus(saldoPrefixo('6.6')).plus(saldoPrefixo('6.7'));
  const totalDespesasOperacionais = despesasVendas.plus(despesasAdministrativas).plus(despesasGerais);
  const lucroOperacional = lucroBruto.minus(totalDespesasOperacionais);
  const receitasFinanceiras = saldoPrefixo('7.8');
  const despesasFinanceiras = saldoPrefixo('6.8');
  const resultadoFinanceiro = receitasFinanceiras.minus(despesasFinanceiras);
  const lucroAntesImpostos = lucroOperacional.plus(resultadoFinanceiro);
  const impostos = saldoPrefixo('6.9');
  const lucroLiquido = lucroAntesImpostos.minus(impostos);

  return {
    dataInicio: filtro.dataInicio,
    dataFim: filtro.dataFim,
    centroCustoId: filtro.centroCustoId,
    receitaBruta, deducoes, receitaLiquida,
    custoProdutosVendidos, lucroBruto,
    despesasVendas, despesasAdministrativas, despesasGerais, totalDespesasOperacionais,
    lucroOperacional, receitasFinanceiras, despesasFinanceiras, resultadoFinanceiro,
    lucroAntesImpostos, impostos, lucroLiquido,
  };
}

// ---------------------------------------------------------------------------
// Banca
// ---------------------------------------------------------------------------

/** Valida que a conta PGC existe no tenant, é folha (aceitaLancamento) e da classe 1. */
async function validarContaContabilBancaria(contaContabilId: string, tenantId: string): Promise<void> {
  const contaPGC = await prisma.contaPGC.findFirst({
    where: { id: contaContabilId, tenantId, ativo: true },
    select: { aceitaLancamento: true, classe: true },
  });
  if (!contaPGC) throw new NotFoundError('Conta contabilística não encontrada');
  if (!contaPGC.aceitaLancamento || contaPGC.classe !== 'CLASSE_1') {
    throw new BusinessRuleError(
      'CONTA_CONTABIL_INVALIDA',
      'A conta contabilística deve ser uma conta folha (aceita lançamentos) da classe 1',
    );
  }
}

export async function criarContaBancaria(input: CriarContaBancariaInput, ctx: Ctx): Promise<ContaBancaria> {
  await validarContaContabilBancaria(input.contaContabilId, ctx.tenantId);
  const existente = await prisma.contaBancaria.findFirst({
    where: { tenantId: ctx.tenantId, banco: input.banco, numeroConta: input.numeroConta },
    select: { id: true },
  });
  if (existente) {
    throw new BusinessRuleError(
      'CONTA_BANCARIA_DUPLICADA',
      `Já existe a conta ${input.numeroConta} no banco ${input.banco}`,
    );
  }
  // saldoAtual nunca é editável manualmente — derivado dos movimentos (append-only)
  return prisma.contaBancaria.create({
    data: { tenantId: ctx.tenantId, ...input, saldoAtual: new Prisma.Decimal(0) },
  }) as unknown as ContaBancaria;
}

export async function atualizarContaBancaria(input: AtualizarContaBancariaInput, ctx: Ctx): Promise<ContaBancaria> {
  const { id, ...data } = input;
  const cb = await prisma.contaBancaria.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!cb) throw new NotFoundError('Conta bancária não encontrada');
  if (data.contaContabilId && data.contaContabilId !== cb.contaContabilId) {
    await validarContaContabilBancaria(data.contaContabilId, ctx.tenantId);
  }
  // O schema Zod não expõe saldoAtual — permanece derivado (Requisito 1.3)
  return prisma.contaBancaria.update({ where: { id }, data }) as unknown as ContaBancaria;
}

export async function obterContaBancaria(id: string, ctx: Ctx): Promise<ContaBancaria | null> {
  return prisma.contaBancaria.findFirst({
    where: { id, tenantId: ctx.tenantId },
  }) as unknown as ContaBancaria | null;
}

export async function listarContasBancarias(ctx: Ctx): Promise<ContaBancaria[]> {
  return prisma.contaBancaria.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { banco: 'asc' },
  }) as unknown as ContaBancaria[];
}

/**
 * Saldo do razão da conta PGC até `ate` (agregação de partidas de lançamentos
 * LANCADO). Natureza DEVEDORA (classe 1): saldo = Σ débitos − Σ créditos.
 * `exclusivo: true` usa `< ate` (saldo de abertura); por omissão `<= ate`.
 */
export async function saldoContabilAte(
  contaId: string,
  ate: Date,
  ctx: Ctx,
  opts?: { exclusivo?: boolean; tx?: Prisma.TransactionClient },
): Promise<Prisma.Decimal> {
  const db = opts?.tx ?? prismaBase;
  const agg = await db.partidaLancamento.groupBy({
    by: ['tipo'],
    where: {
      tenantId: ctx.tenantId,
      contaId,
      lancamento: {
        status: 'LANCADO',
        data: opts?.exclusivo ? { lt: ate } : { lte: ate },
      },
    },
    _sum: { valor: true },
  });
  const debitos = agg.find((a) => a.tipo === 'DEBITO')?._sum.valor ?? new Prisma.Decimal(0);
  const creditos = agg.find((a) => a.tipo === 'CREDITO')?._sum.valor ?? new Prisma.Decimal(0);
  return debitos.minus(creditos);
}

/**
 * Geração idempotente de itens LANCAMENTO_CONTABIL: um item por partida da
 * conta contabilística no intervalo; lançamentos já representados na
 * reconciliação (mesmo lancamentoId) não são duplicados.
 */
async function gerarItensRazaoNoTx(
  tx: Prisma.TransactionClient,
  rec: { id: string; dataInicio: Date; dataFim: Date },
  contaContabilId: string,
  ctx: Ctx,
): Promise<number> {
  const partidas = await tx.partidaLancamento.findMany({
    where: {
      tenantId: ctx.tenantId,
      contaId: contaContabilId,
      lancamento: { status: 'LANCADO', data: { gte: rec.dataInicio, lte: rec.dataFim } },
    },
    select: {
      lancamentoId: true,
      tipo: true,
      valor: true,
      historico: true,
      lancamento: { select: { data: true, historico: true } },
    },
    orderBy: { lancamento: { data: 'asc' } },
  });

  const existentes = await tx.itemReconciliacaoBancaria.findMany({
    where: {
      tenantId: ctx.tenantId,
      reconciliacaoId: rec.id,
      tipo: 'LANCAMENTO_CONTABIL',
      lancamentoId: { not: null },
    },
    select: { lancamentoId: true },
  });
  const jaGerados = new Set(existentes.map((e) => e.lancamentoId));

  let criados = 0;
  for (const p of partidas) {
    if (jaGerados.has(p.lancamentoId)) continue;
    await tx.itemReconciliacaoBancaria.create({
      data: {
        tenantId: ctx.tenantId,
        reconciliacaoId: rec.id,
        tipo: 'LANCAMENTO_CONTABIL',
        data: p.lancamento.data,
        descricao: p.historico ?? p.lancamento.historico,
        valor: p.valor,
        tipoMovimento: p.tipo,
        lancamentoId: p.lancamentoId,
        conciliado: false,
      },
    });
    criados++;
  }
  return criados;
}

/** Recalcula a diferença não conciliada da reconciliação dentro da transacção. */
async function recalcularDiferencaNoTx(
  tx: Prisma.TransactionClient,
  rec: { id: string; saldoFinalBanco: Prisma.Decimal },
  saldoFinalContabil: Prisma.Decimal,
  ctx: Ctx,
): Promise<Prisma.Decimal> {
  const itens = await tx.itemReconciliacaoBancaria.findMany({
    where: { tenantId: ctx.tenantId, reconciliacaoId: rec.id },
    select: { tipo: true, tipoMovimento: true, valor: true, conciliado: true },
  });
  return calcularDiferencaNaoConciliada(rec.saldoFinalBanco, saldoFinalContabil, itens);
}

export async function iniciarReconciliacao(input: IniciarReconciliacaoInput, ctx: Ctx): Promise<ReconciliacaoBancaria> {
  return prismaBase.$transaction(async (tx) => {
    // W9/B1: validar que a conta bancária pertence ao tenant
    const cb = await tx.contaBancaria.findFirst({
      where: { id: input.contaBancariaId, tenantId: ctx.tenantId },
      select: { id: true, contaContabilId: true },
    });
    if (!cb) throw new NotFoundError('Conta bancária não encontrada');

    // Requisito 2.2: só uma reconciliação EM_ANDAMENTO por conta bancária
    const aberta = await tx.reconciliacaoBancaria.findFirst({
      where: { tenantId: ctx.tenantId, contaBancariaId: cb.id, status: 'EM_ANDAMENTO' },
      select: { id: true },
    });
    if (aberta) {
      throw new BusinessRuleError(
        'RECONCILIACAO_EM_ABERTO',
        'Já existe uma reconciliação em andamento para esta conta bancária',
      );
    }

    // Requisito 2.1: saldos contabilísticos reais a partir do razão
    const saldoInicialContabil = await saldoContabilAte(cb.contaContabilId, input.dataInicio, ctx, {
      exclusivo: true,
      tx,
    });
    const saldoFinalContabil = await saldoContabilAte(cb.contaContabilId, input.dataFim, ctx, { tx });
    const saldoFinalBanco = new Prisma.Decimal(input.saldoFinalBanco.toFixed(2));

    const rec = await tx.reconciliacaoBancaria.create({
      data: {
        tenantId: ctx.tenantId,
        contaBancariaId: cb.id,
        dataInicio: input.dataInicio,
        dataFim: input.dataFim,
        saldoInicialBanco: new Prisma.Decimal(input.saldoInicialBanco.toFixed(2)),
        saldoFinalBanco,
        saldoInicialContabil,
        saldoFinalContabil,
        diferencaNaoConciliada: saldoFinalBanco.minus(saldoFinalContabil),
        status: 'EM_ANDAMENTO',
        responsavelId: ctx.userId,
      },
    });

    // Requisito 3.1: gerar itens do razão na abertura
    await gerarItensRazaoNoTx(tx, rec, cb.contaContabilId, ctx);

    return rec as unknown as ReconciliacaoBancaria;
  });
}

export async function gerarItensRazao(reconciliacaoId: string, ctx: Ctx): Promise<{ criados: number }> {
  return prismaBase.$transaction(async (tx) => {
    const rec = await tx.reconciliacaoBancaria.findFirst({
      where: { id: reconciliacaoId, tenantId: ctx.tenantId },
      select: { id: true, dataInicio: true, dataFim: true, contaBancariaId: true, status: true },
    });
    if (!rec) throw new NotFoundError('Reconciliação não encontrada');
    if (rec.status !== 'EM_ANDAMENTO') {
      throw new BusinessRuleError('RECONCILIACAO_IMUTAVEL', 'Reconciliação concluída/cancelada é imutável');
    }
    const cb = await tx.contaBancaria.findFirst({
      where: { id: rec.contaBancariaId, tenantId: ctx.tenantId },
      select: { contaContabilId: true },
    });
    if (!cb) throw new NotFoundError('Conta bancária não encontrada');
    const criados = await gerarItensRazaoNoTx(tx, rec, cb.contaContabilId, ctx);
    return { criados };
  });
}

export async function importarExtrato(
  input: ImportarExtratoInput,
  ctx: Ctx,
): Promise<{ criados: number; ignorados: number }> {
  return prismaBase.$transaction(async (tx) => {
    const rec = await tx.reconciliacaoBancaria.findFirst({
      where: { id: input.reconciliacaoId, tenantId: ctx.tenantId },
      select: { id: true, status: true },
    });
    if (!rec) throw new NotFoundError('Reconciliação não encontrada');
    if (rec.status !== 'EM_ANDAMENTO') {
      throw new BusinessRuleError('RECONCILIACAO_IMUTAVEL', 'Reconciliação concluída/cancelada é imutável');
    }

    // Requisito 4.3: idempotência por [tenantId, reconciliacaoId, extratoReferencia]
    const existentes = await tx.itemReconciliacaoBancaria.findMany({
      where: {
        tenantId: ctx.tenantId,
        reconciliacaoId: rec.id,
        tipo: 'EXTRATO_BANCARIO',
        extratoReferencia: { in: input.linhas.map((l) => l.extratoReferencia) },
      },
      select: { extratoReferencia: true },
    });
    const jaImportadas = new Set(existentes.map((e) => e.extratoReferencia));
    const novas = input.linhas.filter((l) => !jaImportadas.has(l.extratoReferencia));

    // skipDuplicates cobre corridas concorrentes via @@unique de importação
    const res = await tx.itemReconciliacaoBancaria.createMany({
      data: novas.map((l) => ({
        tenantId: ctx.tenantId,
        reconciliacaoId: rec.id,
        tipo: 'EXTRATO_BANCARIO',
        data: l.data,
        descricao: l.descricao,
        valor: new Prisma.Decimal(l.valor.toFixed(2)),
        tipoMovimento: l.tipoMovimento,
        extratoReferencia: l.extratoReferencia,
        conciliado: false,
      })),
      skipDuplicates: true,
    });

    return { criados: res.count, ignorados: input.linhas.length - res.count };
  });
}

export async function sugerirMatches(input: AutoMatchInput, ctx: Ctx): Promise<MatchSugerido[]> {
  const rec = await prisma.reconciliacaoBancaria.findFirst({
    where: { id: input.reconciliacaoId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!rec) throw new NotFoundError('Reconciliação não encontrada');

  const itens = await prisma.itemReconciliacaoBancaria.findMany({
    where: { tenantId: ctx.tenantId, reconciliacaoId: rec.id, conciliado: false },
    select: { id: true, tipo: true, tipoMovimento: true, valor: true, data: true, conciliado: true },
  });
  return sugerirMatchesPuro(itens, input.janelaDias);
}

export async function marcarItemReconciliado(input: MarcarItemReconciliadoInput, ctx: Ctx): Promise<ReconciliacaoBancaria> {
  return prismaBase.$transaction(async (tx) => {
    // B1 (fecho do BLOCKER Wave 2): tudo filtrado por tenantId; cross-tenant → 404
    const rec = await tx.reconciliacaoBancaria.findFirst({
      where: { id: input.reconciliacaoId, tenantId: ctx.tenantId },
    });
    if (!rec) throw new NotFoundError('Reconciliação não encontrada');
    if (rec.status !== 'EM_ANDAMENTO') {
      throw new BusinessRuleError('RECONCILIACAO_IMUTAVEL', 'Reconciliação concluída/cancelada é imutável');
    }

    const item = await tx.itemReconciliacaoBancaria.findFirst({
      where: { id: input.itemId, tenantId: ctx.tenantId, reconciliacaoId: rec.id },
    });
    if (!item) throw new NotFoundError('Item de reconciliação não encontrado');

    let itemParId: string | null = null;
    if (input.conciliado && input.itemParId) {
      const par = await tx.itemReconciliacaoBancaria.findFirst({
        where: { id: input.itemParId, tenantId: ctx.tenantId, reconciliacaoId: rec.id },
      });
      if (!par) throw new NotFoundError('Item par não encontrado');
      if (par.tipo === item.tipo) {
        throw new BusinessRuleError('PAR_INVALIDO', 'O item par deve ser do lado oposto (razão ↔ extracto)');
      }
      await tx.itemReconciliacaoBancaria.updateMany({
        where: { id: par.id, tenantId: ctx.tenantId },
        data: { conciliado: true, itemParId: item.id },
      });
      itemParId = par.id;
    }

    await tx.itemReconciliacaoBancaria.updateMany({
      where: { id: item.id, tenantId: ctx.tenantId },
      data: {
        conciliado: input.conciliado,
        itemParId: input.conciliado ? itemParId : null,
        observacoes: input.observacoes ?? item.observacoes,
      },
    });

    // Desconciliar também o par previamente associado
    if (!input.conciliado && item.itemParId) {
      await tx.itemReconciliacaoBancaria.updateMany({
        where: { id: item.itemParId, tenantId: ctx.tenantId, reconciliacaoId: rec.id },
        data: { conciliado: false, itemParId: null },
      });
    }

    // Requisito 5.3: recálculo da diferença na mesma transacção
    const diferenca = await recalcularDiferencaNoTx(tx, rec, rec.saldoFinalContabil, ctx);
    return tx.reconciliacaoBancaria.update({
      where: { id: rec.id },
      data: { diferencaNaoConciliada: diferenca },
    }) as unknown as ReconciliacaoBancaria;
  });
}

export async function concluirReconciliacao(
  input: ConcluirReconciliacaoInput,
  ctx: Ctx,
): Promise<ReconciliacaoBancaria> {
  return prismaBase.$transaction(async (tx) => {
    const rec = await tx.reconciliacaoBancaria.findFirst({
      where: { id: input.id, tenantId: ctx.tenantId },
    });
    if (!rec) throw new NotFoundError('Reconciliação não encontrada');
    transitarReconciliacao(rec.status as StatusReconciliacao, 'CONCLUIDA');

    const cb = await tx.contaBancaria.findFirst({
      where: { id: rec.contaBancariaId, tenantId: ctx.tenantId },
      select: { contaContabilId: true },
    });
    if (!cb) throw new NotFoundError('Conta bancária não encontrada');

    // Requisito 6.1: recálculo de saldos e diferença no fecho
    const saldoInicialContabil = await saldoContabilAte(cb.contaContabilId, rec.dataInicio, ctx, {
      exclusivo: true,
      tx,
    });
    const saldoFinalContabil = await saldoContabilAte(cb.contaContabilId, rec.dataFim, ctx, { tx });
    const diferenca = await recalcularDiferencaNoTx(tx, rec, saldoFinalContabil, ctx);

    const observacoes = input.observacoes ?? rec.observacoes;
    if (!diferenca.isZero() && !observacoes) {
      throw new BusinessRuleError(
        'RECONCILIACAO_NAO_BALANCEADA',
        `Diferença não conciliada de ${diferenca.toFixed(2)} exige justificação (observações)`,
      );
    }

    return tx.reconciliacaoBancaria.update({
      where: { id: rec.id },
      data: {
        status: 'CONCLUIDA',
        saldoInicialContabil,
        saldoFinalContabil,
        diferencaNaoConciliada: diferenca,
        observacoes,
      },
    }) as unknown as ReconciliacaoBancaria;
  });
}

export async function cancelarReconciliacao(id: string, ctx: Ctx): Promise<ReconciliacaoBancaria> {
  const rec = await prisma.reconciliacaoBancaria.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!rec) throw new NotFoundError('Reconciliação não encontrada');
  transitarReconciliacao(rec.status as StatusReconciliacao, 'CANCELADA');
  return prisma.reconciliacaoBancaria.update({
    where: { id: rec.id },
    data: { status: 'CANCELADA' },
  }) as unknown as ReconciliacaoBancaria;
}

export async function obterReconciliacao(id: string, ctx: Ctx): Promise<ReconciliacaoDetalhe | null> {
  const rec = await prisma.reconciliacaoBancaria.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      contaBancaria: {
        select: { id: true, banco: true, agencia: true, numeroConta: true, contaContabilId: true },
      },
      itens: { orderBy: [{ data: 'asc' }, { createdAt: 'asc' }] },
    },
  });
  if (!rec) return null;
  const { itens, ...resto } = rec;
  return {
    ...resto,
    itensRazao: itens.filter((i) => i.tipo === 'LANCAMENTO_CONTABIL'),
    itensExtrato: itens.filter((i) => i.tipo === 'EXTRATO_BANCARIO'),
  } as unknown as ReconciliacaoDetalhe;
}

export async function listarReconciliacoes(ctx: Ctx): Promise<ReconciliacaoComConta[]> {
  return prisma.reconciliacaoBancaria.findMany({
    where: { tenantId: ctx.tenantId },
    include: { contaBancaria: { select: { id: true, banco: true, numeroConta: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  }) as unknown as ReconciliacaoComConta[];
}

// ---------------------------------------------------------------------------
// Contrato cross-domínio: registarLancamentoContabilistico
// Chamado por WS A, B, C dentro de $transaction.
// ---------------------------------------------------------------------------

export async function registarLancamentoContabilistico(
  tx: Prisma.TransactionClient,
  input: RegistarLancamentoContabilisticoInput,
  ctx: Ctx,
): Promise<Lancamento> {
  const diario = await tx.diario.findFirst({
    where: { tipo: input.diarioTipo, tenantId: ctx.tenantId, ativo: true },
  });
  if (!diario) {
    throw new NotFoundError(`Diário do tipo "${input.diarioTipo}" não encontrado`);
  }

  const periodo = periodoFiscalDe(input.data);
  const numero = await proximoNumeroLancamento(tx, diario.id, periodo, ctx.tenantId);

  // Invariante débito=crédito (Decimal exacto)
  let totalDebito = new Prisma.Decimal(0);
  let totalCredito = new Prisma.Decimal(0);
  for (const p of input.partidas) {
    const v = new Prisma.Decimal(String(p.valor));
    if (p.tipo === 'DEBITO') totalDebito = totalDebito.plus(v);
    else totalCredito = totalCredito.plus(v);
  }
  if (!totalDebito.equals(totalCredito)) {
    throw new BusinessRuleError(
      'PARTIDAS_DESEQUILIBRADAS',
      `Débitos (${totalDebito}) ≠ Créditos (${totalCredito})`,
    );
  }

  const lancamento = await tx.lancamento.create({
    data: {
      tenantId: ctx.tenantId,
      numero,
      data: input.data,
      tipo: 'AUTOMATICO',
      origem: input.origem,
      diarioId: diario.id,
      documentoOrigemId: input.documentoOrigemId,
      documentoOrigemTipo: input.documentoOrigemTipo,
      historico: input.historico,
      valorTotal: totalDebito,
      status: 'LANCADO', // automático → directo para LANCADO
      periodoFiscal: periodo,
      criadoPorId: ctx.userId,
    },
  });

  for (const p of input.partidas) {
    const conta = await resolverContaPorCodigo(tx, p.contaCodigo, ctx.tenantId);
    const ccId = p.centroCustoCodigo
      ? await resolverCentroCustoPorCodigo(tx, p.centroCustoCodigo, ctx.tenantId)
      : null;
    await tx.partidaLancamento.create({
      data: {
        tenantId: ctx.tenantId,
        lancamentoId: lancamento.id,
        contaId: conta.id,
        centroCustoId: ccId,
        tipo: p.tipo,
        valor: new Prisma.Decimal(String(p.valor)),
        historico: p.historico ?? null,
      },
    });
  }

  return lancamento as unknown as Lancamento;
}

// ---------------------------------------------------------------------------
// Verificação de conformidade com IContabilidadeService (NIT)
// ---------------------------------------------------------------------------

import type { IContabilidadeService } from './contabilidade.interface';

export const contabilidadeService = {
  criarConta,
  atualizarConta,
  desativarConta,
  obterConta,
  listarContas,
  arvoreContas,
  criarDiario,
  atualizarDiario,
  listarDiarios,
  criarCentroCusto,
  atualizarCentroCusto,
  listarCentrosCusto,
  criarLancamento,
  confirmarLancamento,
  estornarLancamento,
  obterLancamento,
  listarLancamentos,
  gerarBalancete,
  razaoConta,
  gerarDRE,
  criarContaBancaria,
  atualizarContaBancaria,
  listarContasBancarias,
  iniciarReconciliacao,
  gerarItensRazao,
  importarExtrato,
  sugerirMatches,
  marcarItemReconciliado,
  concluirReconciliacao,
  cancelarReconciliacao,
  obterReconciliacao,
  listarReconciliacoes,
  registarLancamentoContabilistico,
} satisfies IContabilidadeService;
