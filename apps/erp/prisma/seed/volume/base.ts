/**
 * Dados de referência por tenant de carga — criados via Prisma (poucas linhas),
 * com IDs determinísticos para que o gerador set-based (bulk.ts) e os cenários
 * k6 consigam calcular FKs sem consultas.
 *
 * Idempotente: upsert por chave natural em tudo.
 */
import type { PrismaClient } from '@prisma/client';
import { seedRbac } from '../rbac';
import {
  bootstrapPlanoContas,
  bootstrapDiarios,
  bootstrapSeriesDocumento,
  bootstrapContasNaturezaNotaDebito,
  semearRubricasFluxo,
} from '../../../src/server/provisioning/tenant-bootstrap';
import { cuidLike, chave } from './id';

export interface TenantBase {
  tenantId: string;
  slug: string;
  adminUserId: string;
  adminEmail: string;
  sessaoCaixaId: string;
  sessaoPOSId: string;
  localizacaoLojaId: string;
  localizacaoArmazemId: string;
  serieFaturaId: string;
}


/** Contas-folha do PGC usadas pelas partidas (30 contas, classes 1–7). */
const CONTAS_PERF: Array<{
  n: number;
  classe: 'CLASSE_1' | 'CLASSE_2' | 'CLASSE_3' | 'CLASSE_6' | 'CLASSE_7';
  tipo: 'ATIVO' | 'PASSIVO' | 'GASTO' | 'RENDIMENTO';
  natureza: 'DEVEDORA' | 'CREDORA';
}> = Array.from({ length: 30 }, (_, i) => {
  const n = i + 1;
  if (n <= 6) return { n, classe: 'CLASSE_1', tipo: 'ATIVO', natureza: 'DEVEDORA' };
  if (n <= 12) return { n, classe: 'CLASSE_2', tipo: 'PASSIVO', natureza: 'CREDORA' };
  if (n <= 18) return { n, classe: 'CLASSE_3', tipo: 'ATIVO', natureza: 'DEVEDORA' };
  if (n <= 24) return { n, classe: 'CLASSE_6', tipo: 'GASTO', natureza: 'DEVEDORA' };
  return { n, classe: 'CLASSE_7', tipo: 'RENDIMENTO', natureza: 'CREDORA' };
});

export async function seedTenantBase(
  prisma: PrismaClient,
  indice: number,
  colaboradores: number,
): Promise<TenantBase> {
  const slug = `perf-${String(indice).padStart(3, '0')}`;
  const nuit = String(410_000_000 + indice);

  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: {},
    create: { id: cuidLike(chave(slug, 'tenant', 0)), nome: `Perf Tenant ${indice}, Lda`, slug, nuit },
  });

  const roles = await seedRbac(prisma, tenant.id);
  const adminRole = roles.find((r) => r.nome === 'ADMIN');
  if (!adminRole) throw new Error('Role ADMIN não criada pelo seedRbac');

  const adminEmail = `admin@${slug}.mz`;
  // `keycloakSub` sintético e determinístico: estes utilizadores de carga NÃO
  // existem no Keycloak (por decisão — o gerador é set-based e local). O
  // cenário k6 de autenticação da re-medição pós-Keycloak usa os utilizadores
  // demo do realm, não estes. Ver handoff do w8-identidade.
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      id: cuidLike(chave(slug, 'user', 'admin')),
      tenantId: tenant.id,
      keycloakSub: `perf-${slug}-admin`,
      nome: `Admin ${slug}`,
      email: adminEmail,
      ativo: true,
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });

  // ── Localizações ──────────────────────────────────────────────────────────
  const loja = await prisma.localizacao.upsert({
    where: { tenantId_codigo: { tenantId: tenant.id, codigo: 'PERF-LOJA' } },
    update: {},
    create: {
      id: cuidLike(chave(slug, 'loc', 'loja')),
      tenantId: tenant.id,
      codigo: 'PERF-LOJA',
      nome: 'Loja Principal (perf)',
      tipo: 'FILIAL',
    },
  });
  const armazem = await prisma.localizacao.upsert({
    where: { tenantId_codigo: { tenantId: tenant.id, codigo: 'PERF-ARM' } },
    update: {},
    create: {
      id: cuidLike(chave(slug, 'loc', 'armazem')),
      tenantId: tenant.id,
      codigo: 'PERF-ARM',
      nome: 'Armazém Central (perf)',
      tipo: 'ARMAZEM',
    },
  });

  // ── Categorias de produto ─────────────────────────────────────────────────
  for (let n = 1; n <= 10; n++) {
    await prisma.categoriaProduto.upsert({
      where: { tenantId_nome: { tenantId: tenant.id, nome: `Categoria Perf ${n}` } },
      update: {},
      create: {
        id: cuidLike(chave(slug, 'catprod', n)),
        tenantId: tenant.id,
        nome: `Categoria Perf ${n}`,
      },
    });
  }

  // ── PGC-NIRF completo + diários + séries (bootstrap partilhado, spec 19) ──
  // Os fluxos reais (emitirFatura → lançamento na conta 411, payroll → diário
  // SALARIOS…) esperam o plano oficial — sem ele as actions falham.
  await bootstrapPlanoContas(prisma, tenant.id);
  await bootstrapDiarios(prisma, tenant.id);
  await bootstrapSeriesDocumento(prisma, tenant.id);
  await bootstrapContasNaturezaNotaDebito(prisma, tenant.id);
  // DFC (ADR-0037 §3): as contas `9.n` abaixo ficam de fora do mapeamento de
  // propósito — não são do plano canónico e a DFC dos tenants perf dirá isso
  // como impedimento, que é o comportamento correcto para contas do tenant.
  await semearRubricasFluxo(prisma, tenant.id);

  // ── PGC mínimo adicional (contas-folha determinísticas para as partidas) ──
  for (const c of CONTAS_PERF) {
    await prisma.contaPGC.upsert({
      where: { tenantId_codigo: { tenantId: tenant.id, codigo: `9.${c.n}` } },
      update: {},
      create: {
        id: cuidLike(chave(slug, 'conta', c.n)),
        tenantId: tenant.id,
        codigo: `9.${c.n}`,
        nome: `Conta Perf ${c.n}`,
        classe: c.classe,
        tipo: c.tipo,
        natureza: c.natureza,
        nivel: 4,
        aceitaLancamento: true,
      },
    });
  }

  // ── Diários ───────────────────────────────────────────────────────────────
  const diarios: Array<{ n: number; codigo: string; tipo: 'VENDAS' | 'CAIXA' | 'OPERACOES' | 'SALARIOS' }> = [
    { n: 1, codigo: 'PDV', tipo: 'VENDAS' },
    { n: 2, codigo: 'PCX', tipo: 'CAIXA' },
    { n: 3, codigo: 'POP', tipo: 'OPERACOES' },
    { n: 4, codigo: 'PSL', tipo: 'SALARIOS' },
  ];
  for (const d of diarios) {
    await prisma.diario.upsert({
      where: { tenantId_codigo: { tenantId: tenant.id, codigo: d.codigo } },
      update: {},
      create: {
        id: cuidLike(chave(slug, 'diario', d.n)),
        tenantId: tenant.id,
        codigo: d.codigo,
        nome: `Diário Perf ${d.codigo}`,
        tipo: d.tipo,
      },
    });
  }

  // ── Centros de custo ──────────────────────────────────────────────────────
  for (let n = 1; n <= 5; n++) {
    await prisma.centroCusto.upsert({
      where: { tenantId_codigo: { tenantId: tenant.id, codigo: `PCC-${n}` } },
      update: {},
      create: {
        id: cuidLike(chave(slug, 'cc', n)),
        tenantId: tenant.id,
        codigo: `PCC-${n}`,
        nome: `Centro de Custo Perf ${n}`,
        tipo: 'DEPARTAMENTO',
      },
    });
  }

  // ── Séries de documento (as que os fluxos medidos usam) ───────────────────
  const ano = new Date().getFullYear();
  const series: Array<{ tipo: 'FATURA' | 'VENDA' | 'SESSAO_CAIXA' | 'RECIBO' | 'NOTA_CREDITO'; prefixo: string }> = [
    { tipo: 'FATURA', prefixo: 'PFT' },
    { tipo: 'VENDA', prefixo: 'PVD' },
    { tipo: 'SESSAO_CAIXA', prefixo: 'PCX' },
    { tipo: 'RECIBO', prefixo: 'PRC' },
    { tipo: 'NOTA_CREDITO', prefixo: 'PNC' },
  ];
  // #149 (S1): uma só série activa por tipo+ano. As do bootstrap cedem o lugar
  // às de perf — antes, era o `ORDER BY createdAt DESC` do proximoNumeroSerie
  // que as escolhia em silêncio; agora o índice parcial recusaria as duas.
  await prisma.serieDocumento.updateMany({
    where: {
      tenantId: tenant.id,
      tipo: { in: series.map((s) => s.tipo) },
      ano,
      prefixo: { notIn: series.map((s) => s.prefixo) },
      ativo: true,
    },
    data: { ativo: false },
  });
  let serieFaturaId = '';
  for (const s of series) {
    const serie = await prisma.serieDocumento.upsert({
      where: {
        tenantId_tipo_ano_prefixo: { tenantId: tenant.id, tipo: s.tipo, ano, prefixo: s.prefixo },
      },
      update: {},
      // proximoNumero alto para não colidir com os números determinísticos do bulk.
      create: {
        id: cuidLike(chave(slug, 'serie', s.tipo)),
        tenantId: tenant.id,
        tipo: s.tipo,
        prefixo: s.prefixo,
        ano,
        proximoNumero: 5_000_000,
      },
    });
    if (s.tipo === 'FATURA') serieFaturaId = serie.id;
  }

  // ── Departamentos e cargos ────────────────────────────────────────────────
  for (let n = 1; n <= 5; n++) {
    await prisma.departamento.upsert({
      where: { tenantId_codigo: { tenantId: tenant.id, codigo: `PDEP-${n}` } },
      update: {},
      create: {
        id: cuidLike(chave(slug, 'dep', n)),
        tenantId: tenant.id,
        codigo: `PDEP-${n}`,
        nome: `Departamento Perf ${n}`,
      },
    });
  }
  for (let n = 1; n <= 8; n++) {
    await prisma.cargo.upsert({
      where: { tenantId_codigo: { tenantId: tenant.id, codigo: `PCRG-${n}` } },
      update: {},
      create: {
        id: cuidLike(chave(slug, 'cargo', n)),
        tenantId: tenant.id,
        codigo: `PCRG-${n}`,
        nome: `Cargo Perf ${n}`,
        departamentoId: cuidLike(chave(slug, 'dep', (n % 5) + 1)),
      },
    });
  }

  // ── Colaboradores (quadro de pessoal para o cenário de payroll) ───────────
  const colabRows = Array.from({ length: colaboradores }, (_, i) => {
    const n = i + 1;
    return {
      id: cuidLike(chave(slug, 'colab', n)),
      tenantId: tenant.id,
      codigo: `PCOL-${String(n).padStart(4, '0')}`,
      nome: `Colaborador Perf ${n}`,
      dataNascimento: new Date(1980, (n % 12), (n % 27) + 1),
      genero: (n % 2 === 0 ? 'FEMININO' : 'MASCULINO') as 'FEMININO' | 'MASCULINO',
      estadoCivil: 'SOLTEIRO' as const,
      nacionalidade: 'Moçambicana',
      naturalidadeProvincia: 'Maputo Cidade',
      naturalidadeDistrito: 'KaMpfumo',
      bi: `PERF${String(indice).padStart(3, '0')}${String(n).padStart(6, '0')}A`,
      nuit: String(700_000_000 + indice * 1000 + n),
      email: `colab${n}@${slug}.mz`,
      telefone: `+2588400${String(n).padStart(5, '0')}`,
      enderecoRua: 'Av. de Teste de Carga',
      enderecoNumero: String(n),
      enderecoBairro: 'Bairro Central',
      enderecoCidade: 'Maputo',
      enderecoProvincia: 'Maputo Cidade',
      emergenciaNome: 'Contacto Emergência',
      emergenciaParentesco: 'Irmão',
      emergenciaTelefone: '+258840000000',
      departamentoId: cuidLike(chave(slug, 'dep', (n % 5) + 1)),
      cargoId: cuidLike(chave(slug, 'cargo', (n % 8) + 1)),
      dataAdmissao: new Date(2023, (n % 12), 1),
      status: 'ACTIVO' as const,
      tipoContrato: 'EFECTIVO' as const,
      regimeTrabalho: 'TEMPO_INTEGRAL' as const,
      salarioBase: String(15000 + (n % 20) * 2500),
      subsidioAlimentacao: '2500',
      subsidioTransporte: '1500',
      nivelAcesso: 'USUARIO' as const,
    };
  });
  await prisma.colaborador.createMany({ data: colabRows, skipDuplicates: true });

  // ── Tabelas fiscais versionadas (INSS/IRPS) — cenário de payroll ──────────
  const vigencia = new Date(Date.UTC(2024, 0, 1));
  const inss = await prisma.tabelaINSS.findFirst({ where: { tenantId: tenant.id, vigenciaInicio: vigencia } });
  if (!inss) {
    await prisma.tabelaINSS.create({
      data: {
        tenantId: tenant.id,
        vigenciaInicio: vigencia,
        taxaTrabalhador: '0.03',
        taxaEntidade: '0.04',
        descricao: 'Perf — Lei 4/2007 + Decreto 51/2017',
      },
    });
  }
  const escaloes = [
    { ordem: 1, limiteInferior: '0.00', limiteSuperior: '3500.00', taxa: '0.10', parcelaAbater: '0.00' },
    { ordem: 2, limiteInferior: '3500.00', limiteSuperior: '14000.00', taxa: '0.15', parcelaAbater: '175.00' },
    { ordem: 3, limiteInferior: '14000.00', limiteSuperior: '42000.00', taxa: '0.20', parcelaAbater: '875.00' },
    { ordem: 4, limiteInferior: '42000.00', limiteSuperior: '126000.00', taxa: '0.25', parcelaAbater: '2975.00' },
    { ordem: 5, limiteInferior: '126000.00', limiteSuperior: null, taxa: '0.32', parcelaAbater: '11795.00' },
  ];
  for (const e of escaloes) {
    const existente = await prisma.escalaoIRPS.findFirst({
      where: { tenantId: tenant.id, vigenciaInicio: vigencia, ordem: e.ordem, numeroDependentes: 0 },
    });
    if (!existente) {
      await prisma.escalaoIRPS.create({
        data: {
          tenantId: tenant.id,
          vigenciaInicio: vigencia,
          ordem: e.ordem,
          limiteInferior: e.limiteInferior,
          limiteSuperior: e.limiteSuperior,
          taxa: e.taxa,
          parcelaAbater: e.parcelaAbater,
        },
      });
    }
  }

  // ── Sessão de caixa + sessão POS abertas (cenário POS) ────────────────────
  const sessaoCaixa = await prisma.sessaoCaixa.upsert({
    where: { tenantId_numero: { tenantId: tenant.id, numero: 'PERF-CX-001' } },
    update: { status: 'ABERTA', dataFechamento: null },
    create: {
      id: cuidLike(chave(slug, 'sescx', 1)),
      tenantId: tenant.id,
      responsavelId: admin.id,
      numero: 'PERF-CX-001',
      fundoInicial: '10000.00',
      status: 'ABERTA',
    },
  });
  const sessaoPOSId = cuidLike(chave(slug, 'sespos', 1));
  const sessaoPOS = await prisma.sessaoPOS.findFirst({ where: { id: sessaoPOSId } });
  if (!sessaoPOS) {
    await prisma.sessaoPOS.create({
      data: {
        id: sessaoPOSId,
        tenantId: tenant.id,
        vendedorId: admin.id,
        sessaoCaixaId: sessaoCaixa.id,
        status: 'ABERTA',
      },
    });
  } else if (sessaoPOS.status !== 'ABERTA') {
    await prisma.sessaoPOS.update({ where: { id: sessaoPOSId }, data: { status: 'ABERTA', fechadoEm: null } });
  }

  return {
    tenantId: tenant.id,
    slug,
    adminUserId: admin.id,
    adminEmail,
    sessaoCaixaId: sessaoCaixa.id,
    sessaoPOSId,
    localizacaoLojaId: loja.id,
    localizacaoArmazemId: armazem.id,
    serieFaturaId,
  };
}

// Desde o ADR-0013 os utilizadores de carga não têm palavra-passe local nem
// identidade no Keycloak: o campo `senha` do manifesto perde o significado.
// Mantém-se o export para o manifesto não mudar de forma; o valor assinala-o.
export const SENHA_PERF_EXPORT = 'sem-palavra-passe-local (ADR-0013)';
