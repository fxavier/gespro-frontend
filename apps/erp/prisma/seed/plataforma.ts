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

  // Os três planos de origem (#524), com os valores da migração 20261013150000_catalogo_planos:
  // sem eles a FK de `Assinatura.planoAssinatura` recusa o upsert abaixo (P2003). `skipDuplicates`
  // e nunca upsert com update: não pisa o que o administrador já editou no catálogo.
  await prisma.plano.createMany({
    data: [
      {
        codigo: 'BASICO',
        nome: 'Básico',
        descricao: 'Para empresas em arranque que precisam de facturação e stock.',
        precoMensalUsd: '29.00',
        precoAnualUsd: '290.00',
        limiteUtilizadores: 3,
        limiteArmazens: 1,
        suporte: 'Email (48h)',
        funcionalidades: ['Facturação', 'Gestão de stock'],
        ordem: 10,
        destaque: false,
      },
      {
        codigo: 'PROFISSIONAL',
        nome: 'Profissional',
        descricao: 'Contabilidade PGC-NIRF completa, compras e recursos humanos.',
        precoMensalUsd: '79.00',
        precoAnualUsd: '790.00',
        limiteUtilizadores: 15,
        limiteArmazens: 5,
        suporte: 'Email + telefone (24h)',
        funcionalidades: ['Contabilidade PGC-NIRF completa', 'Compras', 'Recursos humanos'],
        ordem: 20,
        destaque: true,
      },
      {
        codigo: 'EMPRESARIAL',
        nome: 'Empresarial',
        descricao: 'Multi-armazém, produção, projectos e apoio dedicado.',
        precoMensalUsd: '199.00',
        precoAnualUsd: '1990.00',
        limiteUtilizadores: -1,
        limiteArmazens: -1,
        suporte: 'Gestor de conta dedicado (4h)',
        funcionalidades: ['Multi-armazém', 'Produção', 'Projectos', 'Apoio dedicado'],
        ordem: 30,
        destaque: false,
      },
    ],
    skipDuplicates: true,
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
