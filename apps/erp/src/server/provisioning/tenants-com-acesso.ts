import 'server-only';
import { prismaBase } from '@/server/db/client';

/**
 * Tenants em que os crons trabalham: não apagados pela GestPro (`Tenant.deletedAt`) e com a
 * `Assinatura` num estado que `estadoDeAcesso` (lib/state-machines.ts) trata como `aberto` ou
 * `leitura`. Ficam de fora os fechados (FECHADA, estados legados), os apagados e os que não
 * têm Assinatura (issue #198).
 *
 * A `Assinatura` liga-se ao `Tenant` por `tenantId` escalar, sem `@relation`
 * (regra de FK cross-domínio; está escrita no comentário de `tenant.prisma`).
 */
export async function listarTenantsComAcesso(): Promise<Array<{ id: string; slug: string }>> {
  const assinaturas = await prismaBase.assinatura.findMany({
    where: { estado: { in: ['TRIAL', 'ATIVA', 'LEITURA'] } },
    select: { tenantId: true },
  });

  return prismaBase.tenant.findMany({
    where: { deletedAt: null, id: { in: assinaturas.map((a) => a.tenantId) } },
    select: { id: true, slug: true },
  });
}
