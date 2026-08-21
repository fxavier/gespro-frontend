/**
 * `pnpm db:seed:volume` — gerador de dados sintéticos de escala realista
 * (ADR-0018 §2). NUNCA corre no arranque de desenvolvimento normal.
 *
 * Perfis (VOLUME_PROFILE):
 *   pme   (padrão) — 1 tenant PME com 2 anos de operação, volumes do ADR.
 *   multi          — 50 tenants na mesma BD (VOLUME_TENANTS/VOLUME_SCALE ajustam).
 *   ci             — subconjunto reduzido para o gate de regressão (ADR-0018 §6).
 *
 * Idempotente e re-executável: IDs determinísticos + ON CONFLICT DO NOTHING.
 * Escreve um manifesto (IDs/credenciais dos tenants de carga) para os cenários
 * k6 em perf/.generated/seed-manifest.json — NUNCA versionado.
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { resolverPerfil, volumesEscalados } from './config';
import { seedTenantBase, SENHA_PERF_EXPORT } from './base';
import { seedTenantBulk } from './bulk';
import { cuidLike, chave } from './id';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

interface ManifestTenant {
  indice: number;
  slug: string;
  tenantId: string;
  adminEmail: string;
  senha: string;
  adminUserId: string;
  sessaoCaixaId: string;
  sessaoPOSId: string;
  localizacaoLojaId: string;
  serieFaturaId: string;
  /** Amostras determinísticas para os cenários k6. */
  produtoIds: string[];
  clienteIds: string[];
  contaIds: string[];
  clienteExportId: string;
}

async function main() {
  const perfil = resolverPerfil();
  const volumes = volumesEscalados(perfil.scale);
  const t0 = Date.now();

  console.log(
    `Seed de volume — perfil=${perfil.nome} tenants=${perfil.tenants} scale=${perfil.scale}`,
  );
  console.log(
    `Volumes por tenant: vendas=${volumes.vendas} movimentos=${volumes.movimentosStock} ` +
      `lançamentos=${volumes.lancamentos} facturas=${volumes.faturas} auditoria=${volumes.auditoria}`,
  );

  const manifestTenants: ManifestTenant[] = [];

  // Concorrência por tenant (o perfil multi com 50 tenants seria proibitivo em
  // série): VOLUME_CONCURRENCY tenants em paralelo, cada um com a sua sequência
  // de INSERTs set-based. 4 é um bom valor numa máquina de desenvolvimento.
  const concorrencia = Math.max(1, Number(process.env.VOLUME_CONCURRENCY ?? (perfil.tenants > 1 ? 4 : 1)));
  const indices = Array.from({ length: perfil.tenants }, (_, k) => k + 1);

  async function seedUmTenant(i: number) {
    const tBase = Date.now();
    const base = await seedTenantBase(prisma, i, volumes.colaboradores);
    console.log(`  [${base.slug}] referência pronta (${((Date.now() - tBase) / 1000).toFixed(1)}s)`);
    await seedTenantBulk(prisma, base, volumes);
    console.log(`  [${base.slug}] concluído em ${((Date.now() - tBase) / 1000).toFixed(1)}s`);
    return base;
  }

  for (let lote = 0; lote < indices.length; lote += concorrencia) {
    const bases = await Promise.all(indices.slice(lote, lote + concorrencia).map(seedUmTenant));
    for (const base of bases) {
      manifestTenants.push({
        indice: Number(base.slug.replace('perf-', '')),
        slug: base.slug,
        tenantId: base.tenantId,
        adminEmail: base.adminEmail,
        senha: SENHA_PERF_EXPORT,
        adminUserId: base.adminUserId,
        sessaoCaixaId: base.sessaoCaixaId,
        sessaoPOSId: base.sessaoPOSId,
        localizacaoLojaId: base.localizacaoLojaId,
        serieFaturaId: base.serieFaturaId,
        produtoIds: Array.from({ length: 50 }, (_, k) => cuidLike(chave(base.slug, 'produto', k + 1))),
        clienteIds: Array.from({ length: 20 }, (_, k) => cuidLike(chave(base.slug, 'cliente', k + 1))),
        contaIds: Array.from({ length: 30 }, (_, k) => cuidLike(chave(base.slug, 'conta', k + 1))),
        clienteExportId: cuidLike(chave(base.slug, 'cliente', 1)),
      });
    }
  }

  // ANALYZE — planos de execução fiáveis logo a seguir ao seed.
  await prisma.$executeRawUnsafe('ANALYZE');

  const dir =
    process.env.PERF_MANIFEST_DIR ?? path.resolve(process.cwd(), '..', '..', 'perf', '.generated');
  mkdirSync(dir, { recursive: true });
  const manifestPath = path.join(dir, 'seed-manifest.json');
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        geradoEm: new Date().toISOString(),
        nota: 'Dados sintéticos de carga (ADR-0018). Medição LOCAL — grandeza relativa, não valores de produção (ADR-0026).',
        perfil: perfil.nome,
        tenants: perfil.tenants,
        scale: perfil.scale,
        volumesPorTenant: volumes,
        tenantsSeed: manifestTenants,
      },
      null,
      2,
    ),
  );

  console.log(`Manifesto: ${manifestPath}`);
  console.log(`Total: ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
