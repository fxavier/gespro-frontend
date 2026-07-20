/**
 * Seed de finanças (WS D):
 *  - ContaPGC: 504 contas PGC-NIRF (plano-contas-pgc.json)
 *  - Diários contabilísticos por tipo
 *  - SerieDocumento para cada TipoSerieDocumento
 *  - Fatura demo a partir de src/data/faturacao.ts
 *
 * Exporta seedFinancas(prisma, tenantId) — chamado por prisma/seed/index.ts.
 * NÃO modifica index.ts nem outros módulos.
 */
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import planoContas from './data/plano-contas-pgc.json';

// ---------------------------------------------------------------------------
// Tipos locais (o JSON não tem `tipo` → derivamos)
// ---------------------------------------------------------------------------

interface ContaJSON {
  codigo: string;
  codigoOriginal: string;
  nome: string;
  classe: number;
  nivel: number;
  contaPaiCodigo: string | null;
  aceitaLancamento: boolean;
  natureza: string;
}

function classeEnum(n: number): string {
  return `CLASSE_${n}`;
}

function derivarTipo(classe: number, natureza: string): string {
  if (classe === 5) return 'CAPITAL_PROPRIO';
  if (classe === 6) return 'GASTO';
  if (classe === 7) return 'RENDIMENTO';
  if (classe === 8) return 'RESULTADO';
  // Classes 1–4: natureza determina o tipo
  return natureza === 'DEVEDORA' ? 'ATIVO' : 'PASSIVO';
}

// ---------------------------------------------------------------------------
// Seed principal
// ---------------------------------------------------------------------------

export async function seedFinancas(prisma: PrismaClient, tenantId: string): Promise<void> {
  console.log('[WS-D] Seed financas iniciado...');

  await seedPlanoContas(prisma, tenantId);
  await seedDiarios(prisma, tenantId);
  await seedSeriesDocumento(prisma, tenantId);
  await seedFaturasDemo(prisma, tenantId);

  console.log('[WS-D] Seed financas concluído.');
}

// ---------------------------------------------------------------------------
// 1. Plano de Contas PGC-NIRF (504 contas)
// ---------------------------------------------------------------------------

async function seedPlanoContas(prisma: PrismaClient, tenantId: string): Promise<void> {
  const contas = planoContas as ContaJSON[];

  // Mapa: codigo → id gerado (para resolver contaPaiId)
  const codigoParaId = new Map<string, string>();

  // As contas no JSON estão ordenadas: classes → grupos → subgrupos → analíticas
  // Processar em ordem garante que o pai já existe quando o filho é criado.
  let criadas = 0;
  let ignoradas = 0;

  for (const conta of contas) {
    const existente = await prisma.contaPGC.findFirst({
      where: { tenantId, codigo: conta.codigo },
      select: { id: true },
    });

    if (existente) {
      codigoParaId.set(conta.codigo, existente.id);
      ignoradas++;
      continue;
    }

    const contaPaiId = conta.contaPaiCodigo ? (codigoParaId.get(conta.contaPaiCodigo) ?? null) : null;

    const nova = await prisma.contaPGC.create({
      data: {
        tenantId,
        codigo: conta.codigo,
        nome: conta.nome,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        classe: classeEnum(conta.classe) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tipo: derivarTipo(conta.classe, conta.natureza) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        natureza: conta.natureza as any,
        nivel: conta.nivel,
        contaPaiId,
        aceitaLancamento: conta.aceitaLancamento,
        ativo: true,
      },
      select: { id: true },
    });

    codigoParaId.set(conta.codigo, nova.id);
    criadas++;
  }

  console.log(`[WS-D] ContaPGC: ${criadas} criadas, ${ignoradas} já existiam.`);
}

// ---------------------------------------------------------------------------
// 2. Diários contabilísticos
// ---------------------------------------------------------------------------

const DIARIOS_INICIAIS = [
  { codigo: 'VD', nome: 'Diário de Vendas', tipo: 'VENDAS' },
  { codigo: 'CP', nome: 'Diário de Compras', tipo: 'COMPRAS' },
  { codigo: 'CX', nome: 'Diário de Caixa', tipo: 'CAIXA' },
  { codigo: 'BN', nome: 'Diário de Banco', tipo: 'BANCO' },
  { codigo: 'OP', nome: 'Diário de Operações', tipo: 'OPERACOES' },
  { codigo: 'SL', nome: 'Diário de Salários', tipo: 'SALARIOS' },
  { codigo: 'AB', nome: 'Diário de Abertura', tipo: 'ABERTURA' },
  { codigo: 'EN', nome: 'Diário de Encerramento', tipo: 'ENCERRAMENTO' },
  { codigo: 'OT', nome: 'Diário Outros', tipo: 'OUTROS' },
] as const;

async function seedDiarios(prisma: PrismaClient, tenantId: string): Promise<void> {
  let criados = 0;
  for (const d of DIARIOS_INICIAIS) {
    const existente = await prisma.diario.findFirst({
      where: { tenantId, codigo: d.codigo },
    });
    if (existente) continue;

    await prisma.diario.create({
      data: { tenantId, codigo: d.codigo, nome: d.nome, tipo: d.tipo },
    });
    criados++;
  }
  console.log(`[WS-D] Diários: ${criados} criados.`);
}

// ---------------------------------------------------------------------------
// 3. Séries de documento — uma por tipo para o ano corrente
// ---------------------------------------------------------------------------

const ANO = new Date().getFullYear();

const SERIES_INICIAIS: Array<{ tipo: string; prefixo: string }> = [
  { tipo: 'FATURA', prefixo: 'FAT' },
  { tipo: 'NOTA_CREDITO', prefixo: 'NC' },
  { tipo: 'NOTA_DEBITO', prefixo: 'ND' },
  { tipo: 'PROFORMA', prefixo: 'PRO' },
  { tipo: 'COTACAO_COMERCIAL', prefixo: 'COT' },
  { tipo: 'RECIBO', prefixo: 'REC' },
  { tipo: 'VENDA', prefixo: 'VND' },
  { tipo: 'SESSAO_CAIXA', prefixo: 'CXS' },
  { tipo: 'REQUISICAO_COMPRA', prefixo: 'REQ' },
  { tipo: 'COTACAO_RFQ', prefixo: 'RFQ' },
  { tipo: 'PEDIDO_COMPRA', prefixo: 'PC' },
  { tipo: 'CONTA_PAGAR', prefixo: 'CP' },
  { tipo: 'PAGAMENTO', prefixo: 'PAG' },
  { tipo: 'RECEBIMENTO', prefixo: 'RCB' },
  { tipo: 'ORDEM_PRODUCAO', prefixo: 'OP' },
  { tipo: 'ATIVIDADE', prefixo: 'ATI' },
  { tipo: 'TICKET', prefixo: 'TKT' },
  { tipo: 'ENTREGA', prefixo: 'ENT' },
];

async function seedSeriesDocumento(prisma: PrismaClient, tenantId: string): Promise<void> {
  let criadas = 0;
  for (const s of SERIES_INICIAIS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existente = await prisma.serieDocumento.findFirst({
      where: { tenantId, tipo: s.tipo as any, ano: ANO },
    });
    if (existente) continue;

    await prisma.serieDocumento.create({
      data: {
        tenantId,
        tipo: s.tipo as any,
        prefixo: s.prefixo,
        ano: ANO,
        formatoNumero: '{prefixo}/{ano}/{numero:06}',
        ativo: true,
        proximoNumero: 1,
      },
    });
    criadas++;
  }
  console.log(`[WS-D] SerieDocumento: ${criadas} criadas.`);
}

// ---------------------------------------------------------------------------
// 4. Faturas demo (a partir de src/data/faturacao.ts mock)
// ---------------------------------------------------------------------------

async function seedFaturasDemo(prisma: PrismaClient, tenantId: string): Promise<void> {
  // Verificar se já existem faturas demo
  const contaExistente = await prisma.fatura.count({ where: { tenantId } });
  if (contaExistente > 0) {
    console.log('[WS-D] Faturas demo: já existem, ignorando.');
    return;
  }

  // Obter série de fatura
  const serie = await prisma.serieDocumento.findFirst({
    where: { tenantId, tipo: 'FATURA', ativo: true },
  });
  if (!serie) {
    console.warn('[WS-D] Série FAT não encontrada; faturas demo ignoradas.');
    return;
  }

  // Faturas demo baseadas nos mocks (sem cliend real — clienteId fictício)
  const faturasDemo = [
    {
      numero: `FAT/${ANO}/000001`,
      clienteId: 'DEMO-CLIENTE-001',
      moeda: 'MZN',
      subtotal: new Prisma.Decimal('120000.00'),
      descontoTotal: new Prisma.Decimal('0.00'),
      baseIva: new Prisma.Decimal('120000.00'),
      ivaTotal: new Prisma.Decimal('19200.00'),
      total: new Prisma.Decimal('139200.00'),
      totalPago: new Prisma.Decimal('139200.00'),
      status: 'PAGA' as const,
      dataEmissao: new Date(`${ANO}-01-15`),
      dataVencimento: new Date(`${ANO}-01-30`),
      dataPagamento: new Date(`${ANO}-01-20`),
      observacoes: 'Computador Dell OptiPlex — pagamento via TPA',
      linhas: [
        {
          descricao: 'Computador Dell OptiPlex 3090',
          quantidade: new Prisma.Decimal('2'),
          precoUnitario: new Prisma.Decimal('60000.00'),
          desconto: new Prisma.Decimal('0.00'),
          taxaIva: new Prisma.Decimal('0.16'),
          subtotal: new Prisma.Decimal('120000.00'),
          ivaItem: new Prisma.Decimal('19200.00'),
          total: new Prisma.Decimal('139200.00'),
          ordemLinha: 0,
        },
      ],
    },
    {
      numero: `FAT/${ANO}/000002`,
      clienteId: 'DEMO-CLIENTE-002',
      moeda: 'MZN',
      subtotal: new Prisma.Decimal('33000.00'),
      descontoTotal: new Prisma.Decimal('2000.00'),
      baseIva: new Prisma.Decimal('33000.00'),
      ivaTotal: new Prisma.Decimal('5280.00'),
      total: new Prisma.Decimal('38280.00'),
      totalPago: new Prisma.Decimal('0.00'),
      status: 'EMITIDA' as const,
      dataEmissao: new Date(`${ANO}-02-01`),
      dataVencimento: new Date(`${ANO}-02-28`),
      dataPagamento: null,
      observacoes: 'Serviço de consultoria em TI',
      linhas: [
        {
          descricao: 'Serviço de consultoria (40h)',
          quantidade: new Prisma.Decimal('40'),
          precoUnitario: new Prisma.Decimal('875.00'),
          desconto: new Prisma.Decimal('2000.00'),
          taxaIva: new Prisma.Decimal('0.16'),
          subtotal: new Prisma.Decimal('33000.00'),
          ivaItem: new Prisma.Decimal('5280.00'),
          total: new Prisma.Decimal('38280.00'),
          ordemLinha: 0,
        },
      ],
    },
  ];

  // Conta demo para emissão (userId demo)
  const userDemo = await prisma.user.findFirst({ where: { tenantId } });
  if (!userDemo) {
    console.warn('[WS-D] Utilizador demo não encontrado; faturas demo ignoradas.');
    return;
  }

  let criadas = 0;
  for (const f of faturasDemo) {
    const { linhas, ...dadosFatura } = f;

    const fatura = await prisma.fatura.create({
      data: {
        tenantId,
        serieDocumentoId: serie.id,
        ...dadosFatura,
        emitidoPorId: userDemo.id,
      },
    });

    for (const l of linhas) {
      await prisma.linhaFatura.create({
        data: { tenantId, faturaId: fatura.id, ...l },
      });
    }

    // Actualizar proximoNumero da série
    await prisma.serieDocumento.update({
      where: { id: serie.id },
      data: { proximoNumero: { increment: 1 } },
    });

    criadas++;
  }

  console.log(`[WS-D] Faturas demo: ${criadas} criadas.`);
}
