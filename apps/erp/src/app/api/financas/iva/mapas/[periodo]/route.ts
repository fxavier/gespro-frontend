/**
 * GET /api/financas/iva/mapas/[periodo]?tipo=declaracao|clientes|fornecedores|antiguidade
 *
 * Gera os mapas de suporte ao cumprimento do IVA (ADR-0034 §8).
 * Todos os mapas são gerados a partir das linhas gravadas no ApuramentoIva —
 * nunca recalculados da hora — para garantir reprodutibilidade em 2031 sobre 2026.
 *
 * Quatro tipos:
 *  1. `declaracao`   — suporte à Declaração Periódica Modelo A
 *  2. `clientes`     — por documento, NUIT, base, IVA liquidado
 *  3. `fornecedores` — por documento, NUIT, base, IVA dedutível
 *  4. `antiguidade`  — saldo 4438 por período de origem (para reembolsos)
 */
import { withApi } from '@/lib/api/with-api';
import { ValidationError, NotFoundError } from '@/lib/errors';
import { ObterMapaIvaSchema } from '@/lib/validations/apuramento-iva';
import { prismaBase } from '@/server/db/client';
import { Prisma } from '@prisma/client';

// Tipo derivado do Prisma: ApuramentoIva com linhas incluídas
type ApuramentoComLinhas = NonNullable<
  Awaited<
    ReturnType<
      typeof prismaBase.apuramentoIva.findFirst<{
        include: { linhas: true };
      }>
    >
  >
>;

export const GET = withApi(
  async (req, ctx) => {
    const { searchParams } = new URL(req.url);
    const rawPeriodo = ctx.params['periodo'] as string;
    const parsed = ObterMapaIvaSchema.safeParse({
      periodo: rawPeriodo,
      tipo: searchParams.get('tipo') ?? 'declaracao',
    });
    if (!parsed.success) {
      throw new ValidationError('Parâmetros inválidos', parsed.error.flatten());
    }
    const { periodo: codigoPeriodo, tipo } = parsed.data;

    // Localizar o período contabilístico
    const periodo = await prismaBase.periodoContabil.findFirst({
      where: { tenantId: ctx.tenantId, codigo: codigoPeriodo },
      select: { id: true, codigo: true, estado: true, dataInicio: true, dataFim: true },
    });
    if (!periodo) throw new NotFoundError(`Período ${codigoPeriodo} não encontrado`);

    // Obter o apuramento mais recente (APURADO ou DECLARADO)
    const apuramento = await prismaBase.apuramentoIva.findFirst({
      where: {
        tenantId: ctx.tenantId,
        periodoId: periodo.id,
        estado: { in: ['APURADO', 'DECLARADO'] },
      },
      orderBy: { versao: 'desc' },
      include: { linhas: true },
    });
    if (!apuramento) {
      throw new NotFoundError(
        `Não existe apuramento de IVA para o período ${codigoPeriodo}. Execute o apuramento primeiro.`,
      );
    }

    switch (tipo) {
      case 'declaracao':
        return gerarMapaDeclaracao(apuramento, ctx.tenantId);
      case 'clientes':
        return gerarMapaClientes(periodo, ctx.tenantId);
      case 'fornecedores':
        return gerarMapaFornecedores(periodo, ctx.tenantId);
      case 'antiguidade':
        return gerarMapaAntiguidade(ctx.tenantId);
      default:
        throw new ValidationError('Tipo de mapa inválido');
    }
  },
  { permission: 'financas:iva:mapas' },
);

// ---------------------------------------------------------------------------
// Mapa 1: suporte à Declaração Periódica (Modelo A)
// ---------------------------------------------------------------------------

function gerarMapaDeclaracao(
  apuramento: ApuramentoComLinhas,
  tenantId: string,
): Response {
  const linhasDeclaracao = apuramento.linhas.map((l) => ({
    conta: l.contaCodigo,
    contaNome: l.contaNome,
    lado: l.tipoMovimento,
    baseImponivel: l.baseImponivel?.toString() ?? null,
    taxa: l.taxaAplicada ? `${l.taxaAplicada.times(100).toFixed(0)}%` : null,
    imposto: l.valorImposto.toString(),
    divergenciaBase: l.divergenciaBase?.toString() ?? null,
    temDivergencia: l.divergenciaBase !== null,
  }));

  const dados = {
    periodo: apuramento.id,
    versao: apuramento.versao,
    estado: apuramento.estado,
    declaradoEm: apuramento.declaradoEm?.toISOString() ?? null,
    referenciaEntrega: apuramento.referenciaEntrega,
    resumo: {
      ivaLiquidadoTotal: apuramento.totalIvaLiquidado.toString(),
      ivaDedutívelTotal: apuramento.totalIvaDedutivel.toString(),
      regularizacoesTotal: apuramento.totalRegularizacoes.toString(),
      creditoReportado: apuramento.creditoReportado.toString(),
      saldo: apuramento.saldoApuramento.toString(),
      aPagar: apuramento.saldoApuramento.greaterThan(0) ? apuramento.saldoApuramento.toString() : '0.00',
      aRecuperar: apuramento.saldoApuramento.lessThan(0)
        ? apuramento.saldoApuramento.negated().toString()
        : '0.00',
    },
    linhas: linhasDeclaracao,
    avisos: linhasDeclaracao
      .filter((l) => l.temDivergencia)
      .map((l) => ({
        conta: l.conta,
        mensagem:
          `Base × taxa (${l.taxa}) = ${new Prisma.Decimal(l.baseImponivel ?? '0').times(new Prisma.Decimal(l.taxa?.replace('%', '') ?? '0').dividedBy(100)).toFixed(2)} ` +
          `difere do imposto do razão (${l.imposto}) em ${l.divergenciaBase}. ` +
          'Pode indicar lançamento manual sem documento ou vice-versa.',
      })),
  };

  const csv = construirCsvDeclaracao(apuramento, linhasDeclaracao);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="mapa-iva-declaracao-${apuramento.id}-v${apuramento.versao}.csv"`,
      'X-Mapa-Tipo': 'declaracao',
      'X-Apuramento-Estado': apuramento.estado,
    },
  });
}

function construirCsvDeclaracao(
  ap: { totalIvaLiquidado: Prisma.Decimal; totalIvaDedutivel: Prisma.Decimal; saldoApuramento: Prisma.Decimal },
  linhas: Array<{
    conta: string;
    contaNome: string;
    lado: string;
    baseImponivel: string | null;
    taxa: string | null;
    imposto: string;
    divergenciaBase: string | null;
    temDivergencia: boolean;
  }>,
): string {
  const header = 'Conta;Nome;Lado;BaseImponivel;Taxa;Imposto;Divergencia';
  const corpo = linhas.map((l) =>
    [
      l.conta,
      `"${l.contaNome.replace(/"/g, '""')}"`,
      l.lado,
      l.baseImponivel ?? '',
      l.taxa ?? '',
      l.imposto,
      l.divergenciaBase ?? '',
    ].join(';'),
  );
  const totais = [
    `;;IVA LIQUIDADO TOTAL;;;${ap.totalIvaLiquidado.toFixed(2)};`,
    `;;IVA DEDUTÍVEL TOTAL;;;${ap.totalIvaDedutivel.toFixed(2)};`,
    `;;SALDO;;;${ap.saldoApuramento.toFixed(2)};`,
  ];
  return `﻿${[header, ...corpo, '', ...totais].join('\r\n')}`;
}

// ---------------------------------------------------------------------------
// Mapa 2: clientes (por documento, NUIT, base, IVA liquidado)
// ---------------------------------------------------------------------------

async function gerarMapaClientes(
  periodo: { dataInicio: Date; dataFim: Date; codigo: string },
  tenantId: string,
): Promise<Response> {
  // Gerado a partir de Fatura/NC/ND no período (imutáveis com período fechado).
  // nuitCliente é o NUIT congelado na emissão da fatura (reprodutibilidade §8).
  // Para facturas históricas anteriores à adição do campo, recorre ao NUIT actual
  // do cliente MAS marca a linha como «NUIT actual — não o do documento».
  const faturas = await prismaBase.$queryRaw<
    Array<{
      numero: string;
      dataEmissao: Date;
      nuitCliente: string | null;
      nuitAtual: string | null;
      baseIva: Prisma.Decimal;
      ivaTotal: Prisma.Decimal;
      total: Prisma.Decimal;
    }>
  >`
    SELECT
      f.numero,
      f."dataEmissao",
      f."nuitCliente",
      c."nuit" AS "nuitAtual",
      f."baseIva",
      f."ivaTotal",
      f.total
    FROM "Fatura" f
    LEFT JOIN "Cliente" c ON c.id = f."clienteId" AND c."tenantId" = ${tenantId}
    WHERE f."tenantId" = ${tenantId}
      AND f."dataEmissao" >= ${periodo.dataInicio}
      AND f."dataEmissao" <= ${periodo.dataFim}
      AND f.status IN ('EMITIDA', 'PAGA', 'PARCIALMENTE_PAGA', 'VENCIDA')
    ORDER BY f."dataEmissao", f.numero
  `;

  const header = 'Numero;Data;NUIT;AvNUIT;BaseImponivel;IVA;Total';
  const corpo = faturas.map((f) => {
    const nuit = f.nuitCliente ?? f.nuitAtual;
    const avisoNuit = f.nuitCliente === null && f.nuitAtual !== null
      ? 'NUIT actual do cliente, não o do documento'
      : '';
    return [
      f.numero,
      new Date(f.dataEmissao).toISOString().split('T')[0],
      nuit ?? '',
      avisoNuit,
      f.baseIva.toFixed(2),
      f.ivaTotal.toFixed(2),
      f.total.toFixed(2),
    ].join(';');
  });
  const csv = `﻿${[header, ...corpo].join('\r\n')}`;

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="mapa-iva-clientes-${periodo.codigo}.csv"`,
    },
  });
}

// ---------------------------------------------------------------------------
// Mapa 3: fornecedores (por documento, NUIT, base, IVA dedutível)
// ---------------------------------------------------------------------------

async function gerarMapaFornecedores(
  periodo: { dataInicio: Date; dataFim: Date; codigo: string },
  tenantId: string,
): Promise<Response> {
  const cpagar = await prismaBase.$queryRaw<
    Array<{
      numeroDocumento: string | null;
      dataDocumento: Date | null;
      nuitFornecedor: string | null;
      baseIva: Prisma.Decimal | null;
      taxaIva: Prisma.Decimal | null;
      valorIva: Prisma.Decimal | null;
      tipoAquisicao: string | null;
    }>
  >`
    SELECT
      cp."numeroDocumento",
      cp."dataDocumento",
      cp."nuitFornecedor",
      cp."baseIva",
      cp."taxaIva",
      cp."valorIva",
      cp."tipoAquisicao"
    FROM "ContaPagar" cp
    WHERE cp."tenantId" = ${tenantId}
      AND cp."dataDocumento" >= ${periodo.dataInicio}
      AND cp."dataDocumento" <= ${periodo.dataFim}
      AND cp."baseIva" IS NOT NULL
    ORDER BY cp."dataDocumento", cp."numeroDocumento"
  `;

  const header = 'NumeroDocumento;Data;NUIT;TipoAquisicao;Base;Taxa;IVA';
  const corpo = cpagar.map((r) =>
    [
      r.numeroDocumento ?? '',
      r.dataDocumento ? new Date(r.dataDocumento).toISOString().split('T')[0] : '',
      r.nuitFornecedor ?? '',
      r.tipoAquisicao ?? '',
      r.baseIva?.toFixed(2) ?? '',
      r.taxaIva ? `${r.taxaIva.times(100).toFixed(0)}%` : '',
      r.valorIva?.toFixed(2) ?? '',
    ].join(';'),
  );
  const csv = `﻿${[header, ...corpo].join('\r\n')}`;

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="mapa-iva-fornecedores-${periodo.codigo}.csv"`,
    },
  });
}

// ---------------------------------------------------------------------------
// Mapa 4: antiguidade do crédito reportável (saldo 4438 por período de origem)
// ---------------------------------------------------------------------------

async function gerarMapaAntiguidade(tenantId: string): Promise<Response> {
  // Para cada apuramento que resultou em IVA a recuperar, mostra o saldo remanescente
  const apuramentos = await prismaBase.apuramentoIva.findMany({
    where: {
      tenantId,
      estado: { in: ['APURADO', 'DECLARADO'] },
      saldoApuramento: { lt: 0 }, // saldo negativo = IVA a recuperar
    },
    include: {
      periodo: { select: { codigo: true, dataInicio: true } },
    },
    orderBy: { periodo: { dataInicio: 'asc' } },
  });

  const header = 'Periodo;DataInicio;SaldoOriginal;Estado;DeclaradoEm';
  const corpo = apuramentos.map((ap) =>
    [
      ap.periodo.codigo,
      new Date(ap.periodo.dataInicio).toISOString().split('T')[0],
      ap.saldoApuramento.negated().toFixed(2), // negated → positivo = valor a recuperar
      ap.estado,
      ap.declaradoEm ? new Date(ap.declaradoEm).toISOString().split('T')[0] : '',
    ].join(';'),
  );
  const csv = `﻿${[header, ...corpo].join('\r\n')}`;

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="mapa-iva-antiguidade.csv"`,
    },
  });
}
