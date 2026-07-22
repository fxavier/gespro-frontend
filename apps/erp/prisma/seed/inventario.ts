// Seed de Inventário — WS A (Wave 2)
// Idempotente: usa upsert em todas as entidades; seguro para re-run.
// Exporta seedInventario(prisma, tenantId) — chamado pelo orquestrador em prisma/seed/index.ts.
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

// ─── Dados de referência ──────────────────────────────────────────────────────

const LOCALIZACOES = [
  { codigo: 'LOC-001', nome: 'Armazém Principal', tipo: 'ARMAZEM' as const },
  { codigo: 'LOC-002', nome: 'Escritório Central', tipo: 'ESCRITORIO' as const },
  { codigo: 'LOC-003', nome: 'Departamento de TI', tipo: 'DEPARTAMENTO' as const },
  { codigo: 'LOC-004', nome: 'Sala Diretoria', tipo: 'SALA' as const },
  { codigo: 'LOC-005', nome: 'Área Técnica', tipo: 'AREA_TECNICA' as const },
  { codigo: 'LOC-006', nome: 'Sala de Conferências', tipo: 'SALA' as const },
  // Armazéns de produção (WS E resolve por estes códigos: MP=matéria-prima, PA=produto acabado)
  { codigo: 'MP', nome: 'Armazém de Matéria-Prima', tipo: 'ARMAZEM' as const },
  { codigo: 'PA', nome: 'Armazém de Produto Acabado', tipo: 'ARMAZEM' as const },
];

const CATEGORIAS_PRODUTO = [
  { nome: 'Informática', cor: '#3b82f6', descricao: 'Equipamentos e acessórios de informática' },
  { nome: 'Mobiliário', cor: '#8b5cf6', descricao: 'Mobiliário de escritório' },
  { nome: 'Consumíveis', cor: '#10b981', descricao: 'Material de escritório e consumíveis' },
];

const CATEGORIAS_ATIVO = [
  { codigo: 'INF', nome: 'Informática', metodoAmortizacao: 'LINEAR' as const, vidaUtilAnos: 4, valorResidualPct: 0.1 },
  { codigo: 'VEI', nome: 'Veículos', metodoAmortizacao: 'LINEAR' as const, vidaUtilAnos: 10, valorResidualPct: 0.3 },
  { codigo: 'MOB', nome: 'Mobiliário', metodoAmortizacao: 'LINEAR' as const, vidaUtilAnos: 10, valorResidualPct: 0.05 },
  { codigo: 'EQP', nome: 'Equipamentos', metodoAmortizacao: 'LINEAR' as const, vidaUtilAnos: 5, valorResidualPct: 0.1 },
];

// Mapeamento de categorias mock → códigos DB
const CATEGORIA_MAP: Record<string, string> = {
  informatica: 'INF',
  transporte: 'VEI',
  mobiliario: 'MOB',
};

const ATIVOS_DATA = [
  { codigoInterno: 'PC-001', nome: 'Computador Dell OptiPlex 3090', categoriaCode: 'INF', localizacaoCode: 'LOC-003', valorCompra: 45000, valorResidual: 4500, vidaUtilAnos: 5, estado: 'EM_USO' as const, marca: 'Dell', modelo: 'OptiPlex 3090', numeroSerie: 'DL3090-12345', dataAquisicao: new Date('2023-01-15'), garantiaDataFim: new Date('2026-01-15') },
  { codigoInterno: 'PORT-001', nome: 'Portátil Lenovo ThinkPad E15', categoriaCode: 'INF', localizacaoCode: 'LOC-002', valorCompra: 55000, valorResidual: 5500, vidaUtilAnos: 4, estado: 'EM_USO' as const, marca: 'Lenovo', modelo: 'ThinkPad E15', numeroSerie: 'TP-E15-67890', dataAquisicao: new Date('2023-03-20') },
  { codigoInterno: 'VEI-001', nome: 'Toyota Hilux 2022', categoriaCode: 'VEI', localizacaoCode: 'LOC-001', valorCompra: 1250000, valorResidual: 375000, vidaUtilAnos: 10, estado: 'EM_USO' as const, marca: 'Toyota', modelo: 'Hilux 2.4 4x4', numeroSerie: 'TH2022-ABC123', dataAquisicao: new Date('2022-05-10'), garantiaDataFim: new Date('2025-05-10') },
  { codigoInterno: 'IMP-001', nome: 'Impressora HP LaserJet Pro', categoriaCode: 'INF', localizacaoCode: 'LOC-002', valorCompra: 25000, valorResidual: 2500, vidaUtilAnos: 5, estado: 'EM_MANUTENCAO' as const, marca: 'HP', modelo: 'LaserJet Pro MFP M428fdw', numeroSerie: 'HP-LJ-54321', dataAquisicao: new Date('2023-06-01'), garantiaDataFim: new Date('2025-06-01') },
];

const PRODUTOS_DATA = [
  { sku: 'TONER-001', nome: 'Toner HP LaserJet', unidadeMedida: 'UN', precoVenda: 3500, precoCompra: 2800, taxaIva: 0.16, stockMinimo: 5, categoria: 'Consumíveis' },
  { sku: 'CABO-001', nome: 'Cabo HDMI 2m', unidadeMedida: 'UN', precoVenda: 800, precoCompra: 500, taxaIva: 0.16, stockMinimo: 10, categoria: 'Informática' },
  { sku: 'PAPEL-A4', nome: 'Papel A4 (500 folhas)', unidadeMedida: 'RESMA', precoVenda: 650, precoCompra: 480, taxaIva: 0, stockMinimo: 20, categoria: 'Consumíveis' },
];

// ─── Seed principal ───────────────────────────────────────────────────────────

export async function seedInventario(prisma: PrismaClient, tenantId: string): Promise<void> {
  console.log(`[seed:inventario] tenant=${tenantId}`);

  // 1. Localizações
  const locMap: Record<string, string> = {};
  for (const l of LOCALIZACOES) {
    const loc = await prisma.localizacao.upsert({
      where: { tenantId_codigo: { tenantId, codigo: l.codigo } },
      create: { tenantId, codigo: l.codigo, nome: l.nome, tipo: l.tipo },
      update: { nome: l.nome },
      select: { id: true, codigo: true },
    });
    locMap[l.codigo] = loc.id;
  }
  console.log(`[seed:inventario] ${Object.keys(locMap).length} localizações`);

  // 2. Categorias de Produto
  const catProdMap: Record<string, string> = {};
  for (const c of CATEGORIAS_PRODUTO) {
    const cat = await prisma.categoriaProduto.upsert({
      where: { tenantId_nome: { tenantId, nome: c.nome } },
      create: { tenantId, nome: c.nome, cor: c.cor, descricao: c.descricao },
      update: { cor: c.cor },
      select: { id: true, nome: true },
    });
    catProdMap[c.nome] = cat.id;
  }

  // 3. Produtos
  for (const p of PRODUTOS_DATA) {
    const catId = catProdMap[p.categoria];
    if (!catId) continue;
    const margem = p.precoCompra > 0
      ? new Prisma.Decimal((p.precoVenda - p.precoCompra) / p.precoCompra)
      : new Prisma.Decimal(0);
    await prisma.produto.upsert({
      where: { tenantId_sku: { tenantId, sku: p.sku } },
      create: {
        tenantId, sku: p.sku, nome: p.nome, unidadeMedida: p.unidadeMedida,
        categoriaId: catId,
        precoVenda: new Prisma.Decimal(p.precoVenda),
        precoCompra: new Prisma.Decimal(p.precoCompra),
        margemLucro: margem,
        taxaIva: new Prisma.Decimal(p.taxaIva),
        stockMinimo: new Prisma.Decimal(p.stockMinimo),
      },
      update: { nome: p.nome, precoVenda: new Prisma.Decimal(p.precoVenda) },
    });
  }
  console.log(`[seed:inventario] ${PRODUTOS_DATA.length} produtos`);

  // 4. Categorias de Ativo
  const catAtivoMap: Record<string, string> = {};
  for (const c of CATEGORIAS_ATIVO) {
    const cat = await prisma.categoriaAtivo.upsert({
      where: { tenantId_codigo: { tenantId, codigo: c.codigo } },
      create: {
        tenantId, codigo: c.codigo, nome: c.nome,
        metodoAmortizacao: c.metodoAmortizacao,
        vidaUtilAnos: c.vidaUtilAnos,
        valorResidualPct: new Prisma.Decimal(c.valorResidualPct),
      },
      update: { nome: c.nome },
      select: { id: true, codigo: true },
    });
    catAtivoMap[c.codigo] = cat.id;
  }
  console.log(`[seed:inventario] ${Object.keys(catAtivoMap).length} categorias de ativo`);

  // 5. Ativos
  for (const a of ATIVOS_DATA) {
    const categoriaId = catAtivoMap[a.categoriaCode];
    const localizacaoId = locMap[a.localizacaoCode];
    if (!categoriaId || !localizacaoId) continue;

    await prisma.ativo.upsert({
      where: { tenantId_codigoInterno: { tenantId, codigoInterno: a.codigoInterno } },
      create: {
        tenantId,
        codigoInterno: a.codigoInterno,
        nome: a.nome,
        categoriaId,
        localizacaoId,
        valorCompra: new Prisma.Decimal(a.valorCompra),
        valorResidual: new Prisma.Decimal(a.valorResidual),
        vidaUtilAnos: a.vidaUtilAnos,
        estado: a.estado,
        dataAquisicao: a.dataAquisicao,
        marca: a.marca,
        modelo: a.modelo,
        numeroSerie: a.numeroSerie,
        garantiaDataFim: a.garantiaDataFim ?? null,
        criadoPor: 'seed',
      },
      update: { estado: a.estado },
    });
  }
  console.log(`[seed:inventario] ${ATIVOS_DATA.length} ativos`);

  // 6. Manutenções de exemplo (a partir de manutencoesMock)
  const ativos = await prisma.ativo.findMany({ where: { tenantId }, select: { id: true, codigoInterno: true } });
  const ativoByCode = Object.fromEntries(ativos.map((a) => [a.codigoInterno, a.id]));

  const manutencoesSeed = [
    {
      codigo: 'PC-001', tipo: 'PREVENTIVA' as const, status: 'AGENDADA' as const,
      titulo: 'Limpeza e actualização mensal',
      descricao: 'Limpeza interna, verificação de hardware e actualizações de software',
      dataAgendada: new Date('2025-02-15'),
    },
    {
      codigo: 'IMP-001', tipo: 'CORRETIVA' as const, status: 'EM_ANDAMENTO' as const,
      titulo: 'Reparo do sistema de alimentação de papel',
      descricao: 'Impressora com problema de encravamento de papel constante',
      dataAgendada: new Date('2025-01-20'),
      dataInicio: new Date('2025-01-20'),
    },
    {
      codigo: 'VEI-001', tipo: 'PREVENTIVA' as const, status: 'CONCLUIDA' as const,
      titulo: 'Revisão dos 15.000 km',
      descricao: 'Revisão programada conforme manual do fabricante',
      dataAgendada: new Date('2024-12-01'),
      dataInicio: new Date('2024-12-01'),
      dataConclusao: new Date('2024-12-01'),
    },
  ];

  for (const m of manutencoesSeed) {
    const ativoId = ativoByCode[m.codigo];
    if (!ativoId) continue;
    // Verifica se já existe (por ativo + titulo)
    const existe = await prisma.manutencaoAtivo.findFirst({
      where: { tenantId, ativoId, titulo: m.titulo },
    });
    if (existe) continue;
    await prisma.manutencaoAtivo.create({
      data: {
        tenantId, ativoId, tipo: m.tipo, status: m.status,
        titulo: m.titulo, descricao: m.descricao,
        dataAgendada: m.dataAgendada,
        dataInicio: m.dataInicio ?? null,
        dataConclusao: m.dataConclusao ?? null,
        criadoPor: 'seed',
      },
    });
  }
  console.log(`[seed:inventario] manutenções`);

  // 7. Inventário físico de exemplo
  const invExistente = await prisma.inventarioFisico.findFirst({
    where: { tenantId, codigo: 'INV-SEED-001' },
  });
  if (!invExistente) {
    await prisma.inventarioFisico.create({
      data: {
        tenantId,
        codigo: 'INV-SEED-001',
        titulo: 'Inventário Anual — Seed',
        descricao: 'Inventário de demonstração criado pelo seed',
        status: 'PLANEJADO',
        dataInicio: new Date('2026-01-15'),
        dataPrevistaConclusao: new Date('2026-02-15'),
        responsavelId: 'seed-admin',
        criadoPor: 'seed',
      },
    });
  }
  console.log(`[seed:inventario] inventário físico`);

  // 8. Contagem de stock de demonstração (Spec 05)
  // Só cria se já houver produtos e saldos no tenant (idempotente)
  const produtosSeed = await prisma.produto.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true },
    take: 1,
  });
  if (produtosSeed.length > 0) {
    const contagemExistente = await prisma.contagemStock.findFirst({
      where: { tenantId, numero: 'CNT-SEED-001' },
    });
    if (!contagemExistente) {
      // Obtém saldos existentes para snapshot
      const saldos = await prisma.saldoStock.findMany({
        where: { tenantId },
        select: { produtoId: true, localizacaoId: true, saldo: true },
        take: 5,
      });

      const contagem = await prisma.contagemStock.create({
        data: {
          tenantId,
          numero: 'CNT-SEED-001',
          status: 'EM_CONTAGEM',
          responsavelId: 'seed-admin',
          cega: false,
          observacoes: 'Contagem de demonstração — Spec 05',
        },
      });

      // Cria itens com saldoSistema snapshot e discrepâncias simuladas
      for (const s of saldos) {
        const saldoAtual = new Prisma.Decimal(s.saldo.toString());
        // Simula discrepância: conta como 90% do saldo real
        const qtdContada = saldoAtual.times('0.9').toDecimalPlaces(6);
        const diferenca = qtdContada.minus(saldoAtual);
        await prisma.itemContagemStock.upsert({
          where: {
            tenantId_contagemId_produtoId_localizacaoId: {
              tenantId,
              contagemId: contagem.id,
              produtoId: s.produtoId,
              localizacaoId: s.localizacaoId,
            },
          },
          create: {
            tenantId,
            contagemId: contagem.id,
            produtoId: s.produtoId,
            localizacaoId: s.localizacaoId,
            saldoSistema: saldoAtual,
            quantidadeContada: qtdContada,
            diferenca,
            status: 'CONTADO',
          },
          update: {},
        });
      }
      console.log(`[seed:inventario] contagem de stock demo (${saldos.length} itens)`);
    }
  }

  console.log('[seed:inventario] concluído');
}
