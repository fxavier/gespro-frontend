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
import {
  bootstrapPlanoContas,
  bootstrapDiarios,
  bootstrapSeriesDocumento,
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
