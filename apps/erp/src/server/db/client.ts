import 'server-only';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { tenantExtension } from './tenant-extension';
import { createAuditExtension } from './audit-extension';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const globalForPrisma = globalThis as unknown as {
  prismaBase?: PrismaClient;
};

// Cliente base (sem isolamento) — só para autenticação, reset de password e
// seed, onde o tenant ainda não está resolvido. Tudo o resto usa `prisma`.
export const prismaBase = globalForPrisma.prismaBase ?? new PrismaClient({ adapter });

// Cliente estendido: multi-tenant + auditoria.
// A ordem importa: tenantExtension injeta tenantId → auditExtension lê o contexto.
export const prisma = prismaBase
  .$extends(tenantExtension)
  .$extends(createAuditExtension(prismaBase));

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prismaBase = prismaBase;
}
