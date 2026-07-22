import type { PrismaClient } from '@prisma/client';

/**
 * Seed de Plataforma (WS G) — ConfiguracaoFiscal do tenant demo.
 * Idempotente: upsert por tenantId.
 *
 * Exporta seedPlataforma(prisma, tenantId) para ser chamado em seed/index.ts.
 */
export async function seedPlataforma(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  await prisma.configuracaoFiscal.upsert({
    where: { tenantId },
    update: {},
    create: {
      tenantId,
      planoAssinatura: 'PROFISSIONAL',
      regimeIva: 'NORMAL',
      // IVA como fracção (ADR-0003 §4): 0.16 = 16 %
      taxaIvaDefault: 0.16,
      moedaBase: 'MZN',
      timezone: 'Africa/Maputo',
      email: 'geral@demo.mz',
      telefone: '+258 21 000 000',
      endereco: 'Av. Julius Nyerere, 1234',
      cidade: 'Maputo',
      provincia: 'Maputo Cidade',
      statusAtivo: true,
    },
  });

  console.log('ConfiguracaoFiscal do tenant demo criada/actualizada.');
}
