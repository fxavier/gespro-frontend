import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { seedRbac, SYSTEM_ROLES } from './rbac';
import { DEMO_USERS } from './demo-users';
import { seedPlataforma } from './plataforma';
import { seedInventario } from './inventario';
import { seedCompras } from './compras';
import { seedComercial } from './comercial';
import { seedFinancas } from './financas';
import { seedPessoasProjetos } from './pessoas-projetos';
import { seedPayroll } from './payroll';
import { seedOperacoes } from './operacoes';
import { seedRecrutamento } from './recrutamento';
import { PROVINCIAS_MOCAMBIQUE } from '../../src/lib/provincias-mocambique';

// Cliente próprio (fora de RSC) — não importa o client `server-only` da app.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// ---------------------------------------------------------------------------
// Seed de províncias (tabela de referência — sem tenant).
// ---------------------------------------------------------------------------
async function seedProvincias() {
  // As províncias são dados de referência sem modelo DB próprio na Wave 0.
  // São usadas via src/lib/provincias-mocambique.ts.
  // Quando o WS E (pessoas-projetos) precisar de persistência, cria a tabela.
  console.log(`Províncias disponíveis: ${PROVINCIAS_MOCAMBIQUE.length} (via lib, sem tabela DB na Wave 0)`);
}

// ---------------------------------------------------------------------------
// Seed principal
// ---------------------------------------------------------------------------
async function main() {
  // 1. Tenant demo
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: { nome: 'Empresa Demo, Lda', slug: 'demo', nuit: '400000000' },
  });
  console.log('Tenant:', tenant.slug);

  // 2. Catálogo de permissões + roles de sistema para o tenant
  const roles = await seedRbac(prisma, tenant.id);
  console.log('Roles de sistema criados:', roles.map((r) => r.nome).join(', '));

  // 3. Utilizadores demo por role — os `keycloakSub` são os `id` FIXOS dos
  //    utilizadores em infra/keycloak/realm-gespro.json (ADR-0013 §7). A
  //    palavra-passe (`demo1234`) vive só no ficheiro de realm: o ERP deixou
  //    de guardar credenciais. Um teste no pnpm check garante a concordância
  //    dos dois ficheiros (realm-demo-sync.test.ts).
  const rolesByNome = Object.fromEntries(roles.map((r) => [r.nome, r]));

  for (const def of DEMO_USERS) {
    const user = await prisma.user.upsert({
      where: { email: def.email },
      update: { keycloakSub: def.keycloakSub },
      create: {
        tenantId: tenant.id,
        keycloakSub: def.keycloakSub,
        nome: def.nome,
        email: def.email,
      },
    });

    const role = rolesByNome[def.roleNome];
    if (role) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
    }

    console.log(`Utilizador: ${user.email} → role ${def.roleNome}`);
  }

  // 4. ConfiguracaoFiscal — WS G Plataforma
  await seedPlataforma(prisma, tenant.id);

  // 5. Domínios (FKs cross-WS são escalares — ordem não causa violações).
  //    Financas antes de comercial/compras (ContaPGC/SerieDocumento disponíveis).
  await seedInventario(prisma, tenant.id);
  await seedFinancas(prisma, tenant.id);
  await seedCompras(prisma, tenant.id);
  await seedComercial(prisma, tenant.id);
  await seedPessoasProjetos(prisma, tenant.id);
  await seedPayroll(prisma, tenant.id); // Spec 06 — tabelas INSS/IRPS + folha demo
  await seedOperacoes(prisma, tenant.id);
  // Recrutamento (spec 07) — tabelas novas, seed após migrations
  try {
    await seedRecrutamento(prisma, tenant.id);
  } catch (e) {
    console.warn('  recrutamento seed ignorado (tabelas ainda não existem):', (e as Error).message?.slice(0, 80));
  }

  // 6. Províncias (referência, sem tabela DB na Wave 0)
  await seedProvincias();

  // 7. Log de credenciais demo (a palavra-passe vive no realm do Keycloak)
  console.log('\n=== Credenciais Demo (Keycloak — realm gespro) ===');
  for (const d of DEMO_USERS) {
    console.log(`  ${d.email} / demo1234 (${d.roleNome})`);
  }
  console.log('==================================================\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
