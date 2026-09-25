/**
 * Seed de finanças (WS D):
 *  - ContaPGC: 504 contas PGC-NIRF (plano-contas-pgc.json)
 *  - Diários contabilísticos por tipo
 *  - SerieDocumento para cada TipoSerieDocumento
 *  - ContaBancaria: as contas do tenant demo, ligadas ao PGC
 *  - RegraSugestaoLancamento: comissões e encargos bancários → 6981 (ADR-0038, RF §9)
 *  - Fatura demo a partir de src/data/faturacao.ts
 *
 * Exporta seedFinancas(prisma, tenantId) — chamado por prisma/seed/index.ts.
 * NÃO modifica index.ts nem outros módulos.
 */
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import {
  bootstrapPlanoContas,
  bootstrapDiarios,
  bootstrapSeriesDocumento,
  bootstrapContasNaturezaNotaDebito,
  semearRubricasFluxo,
} from '../../src/server/provisioning/tenant-bootstrap';

const ANO = new Date().getFullYear();

// ---------------------------------------------------------------------------
// Seed principal
// ---------------------------------------------------------------------------

export async function seedFinancas(prisma: PrismaClient, tenantId: string): Promise<void> {
  console.log('[WS-D] Seed financas iniciado...');

  await seedPlanoContas(prisma, tenantId);
  await seedDiarios(prisma, tenantId);
  await seedSeriesDocumento(prisma, tenantId);
  await seedContasBancarias(prisma, tenantId);
  await seedRegrasSugestao(prisma, tenantId);
  await seedFaturasDemo(prisma, tenantId);

  console.log('[WS-D] Seed financas concluído.');
}

// ---------------------------------------------------------------------------
// Contas PGC-NIRF, diários e séries: delegados ao bootstrap partilhado
// (src/server/provisioning/tenant-bootstrap.ts, spec 19) — uma única definição,
// chamável tanto por este script como pelo provisionamento self-service.
// ---------------------------------------------------------------------------

async function seedPlanoContas(prisma: PrismaClient, tenantId: string): Promise<void> {
  const criadas = await bootstrapPlanoContas(prisma, tenantId);
  console.log(`[WS-D] ContaPGC: ${criadas} criadas (restantes já existiam).`);
  const naturezas = await bootstrapContasNaturezaNotaDebito(prisma, tenantId);
  console.log(`[WS-D] ContaNaturezaNotaDebito: ${naturezas} criadas.`);
  // DFC (spec 22 WS-2, ADR-0037 §3): rubricas SISTEMA + mapeamento de todas as
  // folhas + versão 1. Tenant que já tem versão não é tocado: o mapeamento é
  // dele, e a 2.ª corrida do seed não escreve nada.
  const dfc = await semearRubricasFluxo(prisma, tenantId);
  console.log(
    dfc.versaoCriada
      ? `[WS-D] DFC: ${dfc.rubricas} rubricas e ${dfc.mapeamentos} mapeamentos criados; versão 1 do mapeamento criada.`
      : '[WS-D] DFC: o tenant já tem versão do mapeamento — nada escrito.',
  );
}

async function seedDiarios(prisma: PrismaClient, tenantId: string): Promise<void> {
  const criados = await bootstrapDiarios(prisma, tenantId);
  console.log(`[WS-D] Diários: ${criados} criados.`);
}

async function seedSeriesDocumento(prisma: PrismaClient, tenantId: string): Promise<void> {
  const criadas = await bootstrapSeriesDocumento(prisma, tenantId);
  console.log(`[WS-D] SerieDocumento: ${criadas} criadas.`);
}

// ---------------------------------------------------------------------------
// 4. Contas bancárias do tenant demo
//
// Ao contrário do plano de contas, dos diários e das séries, uma conta bancária
// NÃO é bootstrap de tenant — é dado do cliente. Por isso vive aqui e não em
// tenant-bootstrap.ts.
//
// `saldoAtual` fica a zero de propósito: é derivado dos movimentos (append-only)
// e o serviço recusa-se a aceitá-lo como entrada. Semear um saldo era inventar
// um número que o razão não confirma.
//
// A conta contabilística tem de ser folha da classe 1 (`validarContaContabilBancaria`).
// Idempotente pela chave natural @@unique([tenantId, banco, numeroConta]).
// ---------------------------------------------------------------------------

const CONTAS_BANCARIAS = [
  {
    banco: 'Millennium bim',
    agencia: 'Sede — Av. 25 de Setembro',
    numeroConta: '178903456',
    tipoConta: 'CORRENTE',
    moeda: 'MZN',
    contaPgc: '121',
  },
  {
    banco: 'BCI',
    agencia: 'Maputo Baixa',
    numeroConta: '48920174501',
    tipoConta: 'CORRENTE',
    moeda: 'MZN',
    contaPgc: '121',
  },
  {
    banco: 'Standard Bank',
    agencia: 'Matola',
    numeroConta: '0103331290004',
    tipoConta: 'DEPOSITO_PRAZO',
    moeda: 'MZN',
    contaPgc: '123',
  },
  {
    banco: 'M-Pesa',
    agencia: 'Vodacom',
    numeroConta: '841234567',
    tipoConta: 'CARTEIRA_MOVEL',
    moeda: 'MZN',
    contaPgc: '121',
  },
] as const;

async function seedContasBancarias(prisma: PrismaClient, tenantId: string): Promise<void> {
  let criadas = 0;

  for (const def of CONTAS_BANCARIAS) {
    const conta = await prisma.contaPGC.findFirst({
      where: { tenantId, codigo: def.contaPgc },
      select: { id: true },
    });
    if (!conta) throw new Error(`[WS-D] ContaPGC ${def.contaPgc} em falta — plano de contas não semeado.`);

    const existente = await prisma.contaBancaria.findFirst({
      where: { tenantId, banco: def.banco, numeroConta: def.numeroConta },
      select: { id: true },
    });
    if (existente) continue;

    await prisma.contaBancaria.create({
      data: {
        tenantId,
        banco: def.banco,
        agencia: def.agencia,
        numeroConta: def.numeroConta,
        tipoConta: def.tipoConta,
        moeda: def.moeda,
        contaContabilId: conta.id,
        saldoAtual: new Prisma.Decimal(0),
      },
    });
    criadas += 1;
  }

  console.log(`[WS-D] ContaBancaria: ${criadas} criadas (restantes já existiam).`);
}

// ---------------------------------------------------------------------------
// 4-bis. Regras de sugestão de lançamento (ADR-0038, RF §9)
//
// Uma regra por omissão: saídas bancárias cuja descrição fale de comissão,
// encargo, taxa, imposto de selo ou manutenção sugerem 6981 Serviços bancários.
// Só SUGERE — criar o lançamento é sempre acto do utilizador. Idempotente por
// contagem: se o tenant já tem regras (suas ou esta), não se mexe.
// ---------------------------------------------------------------------------

async function seedRegrasSugestao(prisma: PrismaClient, tenantId: string): Promise<void> {
  if ((await prisma.regraSugestaoLancamento.count({ where: { tenantId } })) > 0) return;
  const servicosBancarios = await prisma.contaPGC.findFirst({
    where: { tenantId, codigo: '6981' },
    select: { id: true },
  });
  if (!servicosBancarios) throw new Error('[WS-D] ContaPGC 6981 em falta — plano de contas não semeado.');
  await prisma.regraSugestaoLancamento.create({
    data: {
      tenantId,
      padrao: 'COMISSAO|ENCARGO|TAXA|IMPOSTO DE SELO|MANUTENCAO',
      natureza: 'CREDITO',
      contaContrapartidaId: servicosBancarios.id,
      descricao: 'Comissões e encargos bancários',
      prioridade: 100,
    },
  });
  console.log('[WS-D] RegraSugestaoLancamento: regra por omissão criada.');
}

// ---------------------------------------------------------------------------
// 5. Faturas demo (a partir de src/data/faturacao.ts mock)
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
