import type { PrismaClient } from '@prisma/client';

/**
 * Seed de Plataforma (WS G) — ConfiguracaoFiscal e Assinatura do tenant demo.
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

  // Assinatura (#429): sem ela o tenant fica fora de `listarTenantsComAcesso` e os crons
  // não correm. ATIVA/EMPRESARIAL é o acesso que o tenant já tinha sem Assinatura (aberto,
  // sem limites) — a mesma da migração 20261010120000_assinatura_tenants_anteriores.
  // `update: {}`: nunca reescreve uma Assinatura que já exista.
  await prisma.assinatura.upsert({
    where: { tenantId },
    update: {},
    create: {
      tenantId,
      estado: 'ATIVA',
      planoAssinatura: 'EMPRESARIAL',
      trialFim: new Date(),
      dataAtivacao: new Date(),
    },
  });

  console.log('ConfiguracaoFiscal e Assinatura do tenant demo criadas/actualizadas.');
}
