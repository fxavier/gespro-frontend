/**
 * Seed de demonstração do funil comercial — catálogo, cotações, encomendas,
 * POS, vendas e facturação no tenant `demo`.
 *
 * Porquê existir: os seeds de domínio criam o *andaime* (3 produtos, 5 clientes,
 * séries, plano de contas) mas nenhum documento transaccional. O `demo` abria
 * com listagens vazias em vendas, POS, cotações e facturação — precisamente os
 * ecrãs que se mostram primeiro.
 *
 * Duas garantias que não são negociáveis num seed:
 *
 *  - **Numeração pela série.** Nada inventa `FAT/2026/000007`; os números são
 *    alocados a partir de `SerieDocumento.proximoNumero`, que fica avançado no
 *    fim. Sem isto, o primeiro documento criado pela UI colidia com o seed e
 *    rebentava no `@@unique([tenantId, numero])`.
 *  - **Stock que fecha.** Cada linha vendida gera um `MovimentoStock` de saída,
 *    e o `SaldoStock` final é a entrada inicial menos essas saídas. Um saldo
 *    que não bate com o livro de movimentos é pior do que saldo nenhum.
 *
 * Determinístico (gerador com semente fixa): duas execuções em bases limpas dão
 * exactamente os mesmos dados. Idempotente em duas metades — o catálogo é
 * sempre feito por `upsert`; o funil só corre se ainda não houver vendas.
 */
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

// ─── Utilitários ──────────────────────────────────────────────────────────────

/** mulberry32 — gerador com semente, para o seed ser reproduzível. */
function gerador(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const d = (v: number | string) => new Prisma.Decimal(v);
const r2 = (v: Prisma.Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

const HOJE = new Date();

/** Data a N dias de hoje, com hora útil estável (UTC — o servidor corre em UTC). */
function diasAtras(n: number): Date {
  const dt = new Date(HOJE.getTime());
  dt.setUTCDate(dt.getUTCDate() - n);
  dt.setUTCHours(8 + (n % 9), (n * 7) % 60, 0, 0);
  return dt;
}

function maisDias(base: Date, n: number): Date {
  const dt = new Date(base.getTime());
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt;
}

function escolher<T>(rnd: () => number, xs: readonly T[]): T {
  return xs[Math.floor(rnd() * xs.length)]!;
}

/** Distribui `total` itens pelos estados, na proporção dada. */
function distribuir<T extends string>(pares: ReadonlyArray<readonly [T, number]>): T[] {
  return pares.flatMap(([estado, quantas]) => Array.from({ length: quantas }, () => estado));
}

// ─── Catálogo ─────────────────────────────────────────────────────────────────

const CATEGORIAS = [
  { nome: 'Alimentar', cor: '#f59e0b', descricao: 'Géneros alimentares a granel e embalados' },
  { nome: 'Bebidas', cor: '#06b6d4', descricao: 'Águas, refrigerantes, sumos e cervejas' },
  { nome: 'Higiene e Limpeza', cor: '#14b8a6', descricao: 'Produtos de higiene e limpeza' },
  { nome: 'Ferramentas', cor: '#ef4444', descricao: 'Ferramenta manual e eléctrica' },
  { nome: 'Material Eléctrico', cor: '#eab308', descricao: 'Cabos, protecções e iluminação' },
  { nome: 'Vestuário e EPI', cor: '#f97316', descricao: 'Equipamento de protecção individual' },
  { nome: 'Papelaria', cor: '#a855f7', descricao: 'Material de escritório e papelaria' },
] as const;

/** [sku, nome, categoria, unidade, precoCompra, precoVenda, taxaIva, stockMinimo] */
const PRODUTOS: ReadonlyArray<readonly [string, string, string, string, number, number, number, number]> = [
  // Alimentar — os géneros de primeira necessidade são isentos de IVA em Moçambique.
  ['ALI-001', 'Arroz Agulha 25kg', 'Alimentar', 'SACO', 1850, 2250, 0, 40],
  ['ALI-002', 'Açúcar Branco 50kg', 'Alimentar', 'SACO', 2900, 3450, 0, 25],
  ['ALI-003', 'Óleo Alimentar 20L', 'Alimentar', 'BIDAO', 2100, 2650, 0, 30],
  ['ALI-004', 'Farinha de Milho 25kg', 'Alimentar', 'SACO', 1250, 1580, 0, 50],
  ['ALI-005', 'Feijão Manteiga 25kg', 'Alimentar', 'SACO', 2400, 2980, 0, 20],
  ['ALI-006', 'Massa Esparguete 500g (cx 20)', 'Alimentar', 'CAIXA', 780, 990, 0.16, 25],
  ['ALI-007', 'Sal Refinado 1kg (fardo 25)', 'Alimentar', 'FARDO', 420, 560, 0, 30],
  ['ALI-008', 'Atum em Lata 170g (cx 48)', 'Alimentar', 'CAIXA', 3200, 4100, 0.16, 15],
  ['ALI-009', 'Leite UHT 1L (cx 12)', 'Alimentar', 'CAIXA', 860, 1100, 0.16, 40],
  ['ALI-010', 'Chá Preto 100 saquetas', 'Alimentar', 'UN', 145, 210, 0.16, 60],
  // Bebidas
  ['BEB-001', 'Água Mineral 1,5L (fardo 6)', 'Bebidas', 'FARDO', 180, 260, 0.16, 80],
  ['BEB-002', 'Refrigerante Cola 2L (cx 6)', 'Bebidas', 'CAIXA', 520, 690, 0.16, 50],
  ['BEB-003', 'Sumo Natural 1L (cx 12)', 'Bebidas', 'CAIXA', 720, 940, 0.16, 30],
  ['BEB-004', 'Cerveja Nacional 550ml (grade 24)', 'Bebidas', 'GRADE', 1180, 1480, 0.16, 40],
  ['BEB-005', 'Água Tónica 330ml (cx 24)', 'Bebidas', 'CAIXA', 640, 850, 0.16, 20],
  // Higiene e Limpeza
  ['HIG-001', 'Detergente Multiusos 5L', 'Higiene e Limpeza', 'BIDAO', 380, 520, 0.16, 35],
  ['HIG-002', 'Lixívia 5L', 'Higiene e Limpeza', 'BIDAO', 260, 370, 0.16, 35],
  ['HIG-003', 'Sabão Azul 500g (fardo 20)', 'Higiene e Limpeza', 'FARDO', 540, 720, 0.16, 25],
  ['HIG-004', 'Papel Higiénico (fardo 48)', 'Higiene e Limpeza', 'FARDO', 980, 1290, 0.16, 20],
  ['HIG-005', 'Desinfectante de Mãos 500ml', 'Higiene e Limpeza', 'UN', 180, 265, 0.16, 50],
  ['HIG-006', 'Saco do Lixo 100L (rolo 10)', 'Higiene e Limpeza', 'ROLO', 120, 185, 0.16, 70],
  // Ferramentas
  ['FER-001', 'Berbequim de Percussão 750W', 'Ferramentas', 'UN', 4200, 5900, 0.16, 6],
  ['FER-002', 'Rebarbadora 115mm', 'Ferramentas', 'UN', 2650, 3750, 0.16, 8],
  ['FER-003', 'Jogo de Chaves 40 peças', 'Ferramentas', 'UN', 1450, 2100, 0.16, 10],
  ['FER-004', 'Martelo de Unha 500g', 'Ferramentas', 'UN', 320, 480, 0.16, 15],
  ['FER-005', 'Escadote de Alumínio 6 degraus', 'Ferramentas', 'UN', 3800, 5200, 0.16, 5],
  ['FER-006', 'Fita Métrica 5m', 'Ferramentas', 'UN', 145, 230, 0.16, 25],
  // Material Eléctrico
  ['ELE-001', 'Cabo Eléctrico 2,5mm (rolo 100m)', 'Material Eléctrico', 'ROLO', 4900, 6700, 0.16, 8],
  ['ELE-002', 'Disjuntor 32A', 'Material Eléctrico', 'UN', 380, 560, 0.16, 30],
  ['ELE-003', 'Lâmpada LED 12W (cx 10)', 'Material Eléctrico', 'CAIXA', 620, 880, 0.16, 25],
  ['ELE-004', 'Tomada Schuko de Embutir', 'Material Eléctrico', 'UN', 95, 160, 0.16, 60],
  ['ELE-005', 'Quadro Eléctrico 12 Módulos', 'Material Eléctrico', 'UN', 1250, 1790, 0.16, 10],
  ['ELE-006', 'Extensão Eléctrica 5m', 'Material Eléctrico', 'UN', 340, 490, 0.16, 20],
  // Vestuário e EPI
  ['EPI-001', 'Capacete de Protecção', 'Vestuário e EPI', 'UN', 420, 640, 0.16, 25],
  ['EPI-002', 'Botas com Biqueira de Aço', 'Vestuário e EPI', 'PAR', 1350, 1950, 0.16, 15],
  ['EPI-003', 'Luvas de Trabalho', 'Vestuário e EPI', 'PAR', 85, 140, 0.16, 80],
  ['EPI-004', 'Colete Reflector', 'Vestuário e EPI', 'UN', 190, 300, 0.16, 40],
  ['EPI-005', 'Óculos de Protecção', 'Vestuário e EPI', 'UN', 145, 235, 0.16, 40],
  ['EPI-006', 'Fato-macaco Azul', 'Vestuário e EPI', 'UN', 890, 1290, 0.16, 20],
  // Papelaria
  ['PAP-001', 'Caderno A4 Pautado (pack 10)', 'Papelaria', 'PACK', 480, 690, 0.16, 20],
  ['PAP-002', 'Esferográfica Azul (cx 50)', 'Papelaria', 'CAIXA', 320, 470, 0.16, 20],
  ['PAP-003', 'Pasta de Arquivo Lombada 8cm', 'Papelaria', 'UN', 145, 225, 0.16, 35],
  ['PAP-004', 'Agrafador Metálico', 'Papelaria', 'UN', 260, 395, 0.16, 15],
  ['PAP-005', 'Marcador Permanente (cx 12)', 'Papelaria', 'CAIXA', 290, 430, 0.16, 20],
  // Informática / Mobiliário / Consumíveis — categorias já criadas pelo seed de inventário
  ['INF-001', 'Rato Óptico USB', 'Informática', 'UN', 320, 520, 0.16, 30],
  ['INF-002', 'Teclado ABNT2 USB', 'Informática', 'UN', 480, 760, 0.16, 25],
  ['INF-003', 'Monitor 24" LED', 'Informática', 'UN', 9800, 13500, 0.16, 8],
  ['INF-004', 'Disco SSD 512GB', 'Informática', 'UN', 3900, 5600, 0.16, 15],
  ['INF-005', 'Router Wi-Fi Dual Band', 'Informática', 'UN', 2100, 3100, 0.16, 12],
  ['INF-006', 'Switch 8 Portas Gigabit', 'Informática', 'UN', 1850, 2700, 0.16, 10],
  ['INF-007', 'UPS 1200VA', 'Informática', 'UN', 6400, 8900, 0.16, 6],
  ['INF-008', 'Webcam HD 1080p', 'Informática', 'UN', 1250, 1850, 0.16, 15],
  ['INF-009', 'Cartucho de Tinteiro Preto', 'Informática', 'UN', 890, 1350, 0.16, 20],
  ['INF-010', 'Pen USB 64GB', 'Informática', 'UN', 450, 720, 0.16, 40],
  ['MOB-001', 'Secretária 1,20m', 'Mobiliário', 'UN', 5400, 7800, 0.16, 6],
  ['MOB-002', 'Cadeira Operativa com Rodas', 'Mobiliário', 'UN', 2900, 4200, 0.16, 12],
  ['MOB-003', 'Armário Metálico 2 Portas', 'Mobiliário', 'UN', 7200, 9900, 0.16, 5],
  ['MOB-004', 'Estante 5 Prateleiras', 'Mobiliário', 'UN', 3400, 4800, 0.16, 8],
  ['MOB-005', 'Mesa de Reunião 8 Lugares', 'Mobiliário', 'UN', 14500, 19800, 0.16, 3],
  ['CON-001', 'Toner Compatível HP 85A', 'Consumíveis', 'UN', 1450, 2200, 0.16, 15],
  ['CON-002', 'Fita Adesiva 48mm (pack 6)', 'Consumíveis', 'PACK', 180, 280, 0.16, 30],
];

/** [codigo, nome, tipo, nuit, email, telefone, categoria, segmento] */
const CLIENTES: ReadonlyArray<readonly [string, string, 'FISICA' | 'JURIDICA' | 'REVENDEDOR', string, string, string, 'VIP' | 'REGULAR' | 'NOVO', 'VAREJO' | 'GROSSISTA' | 'DISTRIBUIDOR' | 'CORPORATIVO' | 'GOVERNO']> = [
  ['CLI-0006', 'Supermercado Nhamba, Lda', 'JURIDICA', '401200101', 'compras@nhamba.co.mz', '+258 84 320 1101', 'VIP', 'GROSSISTA'],
  ['CLI-0007', 'Construções Zambeze, Lda', 'JURIDICA', '401200102', 'geral@zambeze.co.mz', '+258 82 445 7712', 'VIP', 'CORPORATIVO'],
  ['CLI-0008', 'Farmácia Central de Nampula', 'JURIDICA', '401200103', 'farmacia.central@mail.co.mz', '+258 86 771 2230', 'REGULAR', 'VAREJO'],
  ['CLI-0009', 'Ana Cumbe', 'FISICA', '401200104', 'ana.cumbe@gmail.com', '+258 84 118 9043', 'REGULAR', 'VAREJO'],
  ['CLI-0010', 'Distribuidora Índico, Lda', 'JURIDICA', '401200105', 'encomendas@indico.co.mz', '+258 84 990 3321', 'VIP', 'DISTRIBUIDOR'],
  ['CLI-0011', 'Escola Secundária da Matola', 'JURIDICA', '401200106', 'secretaria@esmatola.edu.mz', '+258 21 720 114', 'REGULAR', 'GOVERNO'],
  ['CLI-0012', 'Hotel Costa do Sol', 'JURIDICA', '401200107', 'compras@costadosol.co.mz', '+258 84 662 0077', 'VIP', 'CORPORATIVO'],
  ['CLI-0013', 'Paulo Macamo', 'FISICA', '401200108', 'paulo.macamo@outlook.com', '+258 87 334 5561', 'NOVO', 'VAREJO'],
  ['CLI-0014', 'Oficina Auto Beira, Lda', 'JURIDICA', '401200109', 'oficina@autobeira.co.mz', '+258 82 209 8814', 'REGULAR', 'VAREJO'],
  ['CLI-0015', 'Agro-Pecuária Limpopo, Lda', 'JURIDICA', '401200110', 'admin@agrolimpopo.co.mz', '+258 84 507 6690', 'REGULAR', 'GROSSISTA'],
];

// ─── Numeração ────────────────────────────────────────────────────────────────

/**
 * Reserva `quantidade` números na série e devolve-os já formatados.
 *
 * O `proximoNumero` é avançado de uma vez: o seed não compete com ninguém, e
 * deixar a série atrás dos documentos criados faria o primeiro documento da UI
 * colidir no `@@unique([tenantId, numero])`.
 */
async function reservarNumeros(
  prisma: PrismaClient,
  tenantId: string,
  tipo: string,
  quantidade: number,
): Promise<{ serieId: string; numeros: string[] }> {
  const serie = await prisma.serieDocumento.findFirst({
    where: { tenantId, tipo: tipo as never, ativo: true },
  });
  if (!serie) throw new Error(`[seed:demo-vendas] série ${tipo} activa não encontrada.`);

  const inicio = serie.proximoNumero;
  await prisma.serieDocumento.update({
    where: { id: serie.id },
    data: { proximoNumero: inicio + quantidade },
  });

  return {
    serieId: serie.id,
    numeros: Array.from(
      { length: quantidade },
      (_, k) => `${serie.prefixo}/${serie.ano}/${String(inicio + k).padStart(6, '0')}`,
    ),
  };
}

// ─── Linhas de documento ──────────────────────────────────────────────────────

interface ProdutoRef {
  id: string;
  sku: string;
  nome: string;
  precoVenda: Prisma.Decimal;
  taxaIva: Prisma.Decimal;
}

interface Linha {
  produto: ProdutoRef;
  quantidade: Prisma.Decimal;
  precoUnitario: Prisma.Decimal;
  desconto: Prisma.Decimal;
  taxaIva: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  ivaItem: Prisma.Decimal;
  total: Prisma.Decimal;
}

interface Totais {
  subtotal: Prisma.Decimal;
  descontoTotal: Prisma.Decimal;
  ivaTotal: Prisma.Decimal;
  total: Prisma.Decimal;
}

/** Gera 1..max linhas e os totais coerentes com elas. */
function gerarLinhas(
  rnd: () => number,
  produtos: ProdutoRef[],
  max: number,
): { linhas: Linha[]; totais: Totais } {
  const quantas = 1 + Math.floor(rnd() * max);
  const usados = new Set<string>();
  const linhas: Linha[] = [];

  for (let i = 0; i < quantas; i++) {
    const produto = escolher(rnd, produtos);
    if (usados.has(produto.id)) continue;
    usados.add(produto.id);

    const quantidade = d(1 + Math.floor(rnd() * 12));
    const precoUnitario = produto.precoVenda;
    const bruto = r2(quantidade.mul(precoUnitario));
    // Desconto comercial em ~1 linha em cada 4 — dá o que mostrar nas colunas
    // de desconto sem tornar o desconto a regra.
    const desconto = rnd() < 0.25 ? r2(bruto.mul(d(0.05))) : d(0);
    const subtotal = r2(bruto.sub(desconto));
    const ivaItem = r2(subtotal.mul(produto.taxaIva));

    linhas.push({
      produto,
      quantidade,
      precoUnitario,
      desconto,
      taxaIva: produto.taxaIva,
      subtotal,
      ivaItem,
      total: r2(subtotal.add(ivaItem)),
    });
  }

  const totais = linhas.reduce<Totais>(
    (acc, l) => ({
      subtotal: acc.subtotal.add(l.subtotal).add(l.desconto),
      descontoTotal: acc.descontoTotal.add(l.desconto),
      ivaTotal: acc.ivaTotal.add(l.ivaItem),
      total: acc.total.add(l.total),
    }),
    { subtotal: d(0), descontoTotal: d(0), ivaTotal: d(0), total: d(0) },
  );

  return {
    linhas,
    totais: {
      subtotal: r2(totais.subtotal),
      descontoTotal: r2(totais.descontoTotal),
      ivaTotal: r2(totais.ivaTotal),
      total: r2(totais.total),
    },
  };
}

// ─── Seed principal ───────────────────────────────────────────────────────────

export async function seedDemoVendas(
  prisma: PrismaClient,
  tenantId: string,
  adminUserId: string,
): Promise<void> {
  console.log('[seed:demo-vendas] catálogo e funil comercial...');

  const produtos = await seedCatalogo(prisma, tenantId);
  const clientes = await seedClientes(prisma, tenantId);
  const vendedores = await seedVendedores(prisma, tenantId, adminUserId);

  const armazem = await prisma.localizacao.findFirst({
    where: { tenantId, codigo: 'LOC-001' },
    select: { id: true },
  });
  if (!armazem) throw new Error('[seed:demo-vendas] armazém LOC-001 não encontrado.');

  // O funil é transaccional: re-executá-lo duplicaria documentos numerados.
  const jaTemVendas = await prisma.venda.count({ where: { tenantId } });
  if (jaTemVendas > 0) {
    console.log(`[seed:demo-vendas] funil já existe (${jaTemVendas} vendas) — ignorado.`);
    return;
  }

  await seedCotacoes(prisma, tenantId, adminUserId, produtos, clientes);
  await seedEncomendas(prisma, tenantId, produtos, clientes, vendedores);
  const saidas = await seedVendasEFaturas(
    prisma, tenantId, adminUserId, armazem.id, produtos, clientes, vendedores,
  );
  await seedStock(prisma, tenantId, adminUserId, armazem.id, produtos, saidas);
  await repararFaturasOrfas(prisma, tenantId, clientes);

  console.log('[seed:demo-vendas] concluído.');
}

// ─── 1. Catálogo ──────────────────────────────────────────────────────────────

async function seedCatalogo(prisma: PrismaClient, tenantId: string): Promise<ProdutoRef[]> {
  for (const c of CATEGORIAS) {
    await prisma.categoriaProduto.upsert({
      where: { tenantId_nome: { tenantId, nome: c.nome } },
      create: { tenantId, nome: c.nome, cor: c.cor, descricao: c.descricao },
      update: { cor: c.cor, descricao: c.descricao },
    });
  }

  const categorias = await prisma.categoriaProduto.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, nome: true },
  });
  const porNome = new Map(categorias.map((c) => [c.nome, c.id]));

  for (const [sku, nome, categoria, unidade, precoCompra, precoVenda, taxaIva, stockMinimo] of PRODUTOS) {
    const categoriaId = porNome.get(categoria);
    if (!categoriaId) throw new Error(`[seed:demo-vendas] categoria «${categoria}» em falta.`);

    await prisma.produto.upsert({
      where: { tenantId_sku: { tenantId, sku } },
      create: {
        tenantId,
        sku,
        nome,
        categoriaId,
        unidadeMedida: unidade,
        precoCompra: d(precoCompra),
        precoVenda: d(precoVenda),
        margemLucro: r2(d(precoVenda).sub(d(precoCompra)).div(d(precoCompra))),
        taxaIva: d(taxaIva),
        stockMinimo: d(stockMinimo),
        stockMaximo: d(stockMinimo * 10),
      },
      update: { nome, precoVenda: d(precoVenda), precoCompra: d(precoCompra), categoriaId },
    });
  }

  const todos = await prisma.produto.findMany({
    where: { tenantId, deletedAt: null, ativo: true },
    select: { id: true, sku: true, nome: true, precoVenda: true, taxaIva: true },
    orderBy: { sku: 'asc' },
  });
  console.log(
    `[seed:demo-vendas] catálogo: ${categorias.length} categorias, ${todos.length} produtos.`,
  );
  return todos;
}

// ─── 2. Clientes ──────────────────────────────────────────────────────────────

async function seedClientes(
  prisma: PrismaClient,
  tenantId: string,
): Promise<Array<{ id: string; nome: string }>> {
  for (const [codigo, nome, tipo, nuit, email, telefone, categoria, segmento] of CLIENTES) {
    const cliente = await prisma.cliente.upsert({
      where: { tenantId_codigo: { tenantId, codigo } },
      create: {
        tenantId,
        codigo,
        nome,
        tipo,
        nuit,
        email,
        telefone,
        categoria,
        diasPagamento: tipo === 'FISICA' ? 0 : 30,
        limiteCreditoMT: tipo === 'FISICA' ? d(0) : d(250000),
      },
      update: { nome, email, telefone, categoria },
      select: { id: true },
    });

    await prisma.segmentacaoCliente.upsert({
      where: { clienteId: cliente.id },
      create: { tenantId, clienteId: cliente.id, segmento },
      update: { segmento },
    });
  }

  const todos = await prisma.cliente.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, nome: true },
    orderBy: { codigo: 'asc' },
  });
  console.log(`[seed:demo-vendas] clientes: ${todos.length}.`);
  return todos;
}

// ─── 3. Vendedores ────────────────────────────────────────────────────────────

async function seedVendedores(
  prisma: PrismaClient,
  tenantId: string,
  adminUserId: string,
): Promise<Array<{ id: string; userId: string }>> {
  const users = await prisma.user.findMany({
    where: {
      tenantId,
      email: { in: ['admin@demo.mz', 'gestor@demo.mz', 'operador@demo.mz', 'financeiro@demo.mz'] },
    },
    select: { id: true, nome: true, email: true },
  });

  const alvo = users.length > 0 ? users : [{ id: adminUserId, nome: 'Administrador', email: null }];

  for (const u of alvo) {
    await prisma.vendedor.upsert({
      where: { tenantId_userId: { tenantId, userId: u.id } },
      create: {
        tenantId,
        userId: u.id,
        nome: u.nome,
        email: u.email,
        metaMensal: d(450000),
        status: 'ATIVO',
      },
      update: { nome: u.nome, status: 'ATIVO' },
    });
  }

  const todos = await prisma.vendedor.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, userId: true },
  });
  console.log(`[seed:demo-vendas] vendedores: ${todos.length}.`);
  return todos.filter((v): v is { id: string; userId: string } => v.userId !== null);
}

// ─── 4. Cotações comerciais ───────────────────────────────────────────────────

const ESTADOS_COTACAO = distribuir([
  ['RASCUNHO', 3],
  ['ENVIADA', 6],
  ['ACEITE', 5],
  ['CONVERTIDA', 6],
  ['REJEITADA', 2],
  ['EXPIRADA', 2],
] as const);

async function seedCotacoes(
  prisma: PrismaClient,
  tenantId: string,
  adminUserId: string,
  produtos: ProdutoRef[],
  clientes: Array<{ id: string }>,
): Promise<void> {
  const rnd = gerador(0xc07a);
  const { serieId, numeros } = await reservarNumeros(
    prisma,
    tenantId,
    'COTACAO_COMERCIAL',
    ESTADOS_COTACAO.length,
  );

  const cabecalhos = ESTADOS_COTACAO.map((status, i) => {
    const { linhas, totais } = gerarLinhas(rnd, produtos, 5);
    const dataEmissao = diasAtras(230 - i * 9);
    return {
      status,
      linhas,
      dados: {
        tenantId,
        serieDocumentoId: serieId,
        numero: numeros[i]!,
        clienteId: escolher(rnd, clientes).id,
        subtotal: totais.subtotal,
        descontoTotal: totais.descontoTotal,
        ivaTotal: totais.ivaTotal,
        total: totais.total,
        status,
        dataEmissao,
        // Uma cotação EXPIRADA tem de ter validade no passado, senão o estado
        // contradiz a data que a própria página mostra.
        dataValidade: status === 'EXPIRADA' ? maisDias(dataEmissao, 15) : maisDias(dataEmissao, 45),
        condicoesComerciais: 'Validade 45 dias · Entrega em 5 dias úteis · Pagamento a 30 dias',
        criadoPorId: adminUserId,
      },
    };
  });

  const criadas = await prisma.cotacaoComercial.createManyAndReturn({
    data: cabecalhos.map((c) => c.dados),
    select: { id: true, numero: true },
  });
  const porNumero = new Map(criadas.map((c) => [c.numero, c.id]));

  await prisma.linhaCotacaoComercial.createMany({
    data: cabecalhos.flatMap((c) =>
      c.linhas.map((l, ordem) => ({
        tenantId,
        cotacaoComercialId: porNumero.get(c.dados.numero)!,
        produtoId: l.produto.id,
        descricao: l.produto.nome,
        quantidade: l.quantidade,
        precoUnitario: l.precoUnitario,
        desconto: l.desconto,
        taxaIva: l.taxaIva,
        subtotal: l.subtotal,
        ivaItem: l.ivaItem,
        total: l.total,
        ordemLinha: ordem,
      })),
    ),
  });

  console.log(`[seed:demo-vendas] cotações: ${criadas.length}.`);
}

// ─── 5. Encomendas ────────────────────────────────────────────────────────────

const ESTADOS_ENCOMENDA = distribuir([
  ['RASCUNHO', 3],
  ['CONFIRMADA', 7],
  ['PARCIALMENTE_ENTREGUE', 3],
  ['CONCLUIDA', 6],
  ['CANCELADA', 1],
] as const);

async function seedEncomendas(
  prisma: PrismaClient,
  tenantId: string,
  produtos: ProdutoRef[],
  clientes: Array<{ id: string }>,
  vendedores: Array<{ id: string }>,
): Promise<void> {
  const rnd = gerador(0xe4c0);
  const { numeros } = await reservarNumeros(prisma, tenantId, 'ENCOMENDA', ESTADOS_ENCOMENDA.length);

  const cabecalhos = ESTADOS_ENCOMENDA.map((status, i) => {
    const { linhas, totais } = gerarLinhas(rnd, produtos, 4);
    const criadaEm = diasAtras(150 - i * 7);
    return {
      status,
      linhas,
      dados: {
        tenantId,
        numero: numeros[i]!,
        clienteId: escolher(rnd, clientes).id,
        vendedorId: vendedores.length > 0 ? escolher(rnd, vendedores).id : null,
        status,
        dataPrevista: maisDias(criadaEm, 10),
        subtotal: totais.subtotal,
        desconto: totais.descontoTotal,
        iva: totais.ivaTotal,
        total: totais.total,
        notas: status === 'CANCELADA' ? 'Cancelada a pedido do cliente.' : null,
        createdAt: criadaEm,
      },
    };
  });

  const criadas = await prisma.encomenda.createManyAndReturn({
    data: cabecalhos.map((c) => c.dados),
    select: { id: true, numero: true },
  });
  const porNumero = new Map(criadas.map((c) => [c.numero, c.id]));

  await prisma.itemEncomenda.createMany({
    data: cabecalhos.flatMap((c) =>
      c.linhas.map((l) => {
        // A quantidade entregue tem de ser coerente com o estado: uma encomenda
        // CONCLUIDA entregou tudo, uma PARCIALMENTE_ENTREGUE entregou parte.
        const entregue =
          c.status === 'CONCLUIDA'
            ? l.quantidade
            : c.status === 'PARCIALMENTE_ENTREGUE'
              ? r2(l.quantidade.div(2)).toDecimalPlaces(2)
              : d(0);
        return {
          tenantId,
          encomendaId: porNumero.get(c.dados.numero)!,
          produtoId: l.produto.id,
          nomeProduto: l.produto.nome,
          sku: l.produto.sku,
          quantidade: l.quantidade,
          precoUnitario: l.precoUnitario,
          desconto: l.desconto,
          taxaIva: l.taxaIva,
          subtotal: l.subtotal,
          ivaItem: l.ivaItem,
          total: l.total,
          quantidadeEntregue: entregue,
        };
      }),
    ),
  });

  console.log(`[seed:demo-vendas] encomendas: ${criadas.length}.`);
}

// ─── 6. POS, vendas e facturas ────────────────────────────────────────────────

const MESES_HISTORICO = 8;
const VENDAS_POR_MES = 22;

const METODOS = ['DINHEIRO', 'MPESA', 'CARTAO', 'TRANSFERENCIA', 'EMOLA'] as const;

/** Quantidade total vendida por produto — alimenta o saldo de stock. */
type Saidas = Map<string, Prisma.Decimal>;

async function seedVendasEFaturas(
  prisma: PrismaClient,
  tenantId: string,
  adminUserId: string,
  armazemId: string,
  produtos: ProdutoRef[],
  clientes: Array<{ id: string }>,
  vendedores: Array<{ id: string; userId: string }>,
): Promise<Saidas> {
  const rnd = gerador(0x5a1e);
  const utilizadores = vendedores.length > 0 ? vendedores.map((v) => v.userId) : [adminUserId];

  // 6a. Uma sessão de caixa + sessão de POS por mês. A do mês corrente fica
  //     ABERTA — é o estado que o ecrã do POS precisa de encontrar para abrir.
  const sessoes = await criarSessoes(prisma, tenantId, utilizadores, rnd);

  // 6b. Vendas.
  const saidas: Saidas = new Map();
  const cabecalhos: Array<{
    dados: Prisma.VendaCreateManyInput;
    linhas: Linha[];
    faturavel: boolean;
  }> = [];

  const totalVendas = MESES_HISTORICO * VENDAS_POR_MES;
  const { numeros } = await reservarNumeros(prisma, tenantId, 'VENDA', totalVendas);

  for (let i = 0; i < totalVendas; i++) {
    const mes = Math.floor(i / VENDAS_POR_MES); // 0 = mês mais antigo
    const sessao = sessoes[mes]!;
    const diaNoMes = i % VENDAS_POR_MES;
    const dataVenda = diasAtras((MESES_HISTORICO - 1 - mes) * 30 + (27 - diaNoMes));

    // Mistura de canais: o POS domina, encomenda e manual dão contraste.
    const sorteio = rnd();
    const origem = sorteio < 0.66 ? 'POS' : sorteio < 0.88 ? 'ENCOMENDA' : 'MANUAL';

    // Consumidor final anónimo só existe no POS.
    const anonimo = origem === 'POS' && rnd() < 0.45;
    const clienteId = anonimo ? null : escolher(rnd, clientes).id;

    // Uma venda em cada vinte fica por concluir (cancelada ou ainda pendente).
    const azar = rnd();
    const status =
      azar < 0.03 ? 'CANCELADA' : azar < 0.08 ? 'PENDENTE' : azar < 0.2 ? 'FATURADA' : 'CONCLUIDA';

    const { linhas, totais } = gerarLinhas(rnd, produtos, origem === 'POS' ? 4 : 6);
    const vendedorId = escolher(rnd, utilizadores);

    if (status !== 'CANCELADA') {
      for (const l of linhas) {
        saidas.set(l.produto.id, (saidas.get(l.produto.id) ?? d(0)).add(l.quantidade));
      }
    }

    cabecalhos.push({
      linhas,
      faturavel: clienteId !== null && (status === 'FATURADA' || status === 'CONCLUIDA'),
      dados: {
        tenantId,
        numero: numeros[i]!,
        origem,
        status,
        clienteId,
        vendedorId,
        sessaoPOSId: origem === 'POS' ? sessao.sessaoPOSId : null,
        sessaoCaixaId: origem === 'POS' ? sessao.sessaoCaixaId : null,
        dataEntregaPrevista: origem === 'ENCOMENDA' ? maisDias(dataVenda, 7) : null,
        subtotal: totais.subtotal,
        descontoTotal: totais.descontoTotal,
        ivaTotal: totais.ivaTotal,
        total: totais.total,
        dataVenda,
        createdAt: dataVenda,
      },
    });
  }

  const vendas = await prisma.venda.createManyAndReturn({
    data: cabecalhos.map((c) => c.dados),
    select: { id: true, numero: true },
  });
  const vendaPorNumero = new Map(vendas.map((v) => [v.numero, v.id]));

  await prisma.itemVenda.createMany({
    data: cabecalhos.flatMap((c) =>
      c.linhas.map((l) => ({
        tenantId,
        vendaId: vendaPorNumero.get(c.dados.numero)!,
        produtoId: l.produto.id,
        nomeProduto: l.produto.nome,
        sku: l.produto.sku,
        quantidade: l.quantidade,
        precoUnitario: l.precoUnitario,
        desconto: l.desconto,
        taxaIva: l.taxaIva,
        subtotal: l.subtotal,
        ivaItem: l.ivaItem,
        total: l.total,
        createdAt: c.dados.dataVenda as Date,
      })),
    ),
  });

  // Pagamentos — só o que está pago; PENDENTE e CANCELADA ficam sem pagamento.
  await prisma.pagamentoVenda.createMany({
    data: cabecalhos
      .filter((c) => c.dados.status === 'CONCLUIDA' || c.dados.status === 'FATURADA')
      .map((c) => ({
        tenantId,
        vendaId: vendaPorNumero.get(c.dados.numero)!,
        tipo: escolher(rnd, METODOS),
        valor: c.dados.total as Prisma.Decimal,
        createdAt: c.dados.dataVenda as Date,
      })),
  });

  await prisma.historicoEstadoVenda.createMany({
    data: cabecalhos.map((c) => ({
      tenantId,
      vendaId: vendaPorNumero.get(c.dados.numero)!,
      estadoAntes: 'PENDENTE' as const,
      estadoDepois: c.dados.status as Prisma.VendaCreateManyInput['status'] as never,
      userId: c.dados.vendedorId,
      createdAt: c.dados.dataVenda as Date,
    })),
  });

  console.log(`[seed:demo-vendas] vendas: ${vendas.length} (${sessoes.length} sessões de POS).`);

  // 6c. Movimentos de saída de stock, um por linha vendida.
  await prisma.movimentoStock.createMany({
    data: cabecalhos
      .filter((c) => c.dados.status !== 'CANCELADA')
      .flatMap((c) =>
        c.linhas.map((l) => ({
          tenantId,
          produtoId: l.produto.id,
          tipo: 'SAIDA' as const,
          quantidade: l.quantidade,
          localizacaoOrigemId: armazemId,
          documentoReferenciaId: vendaPorNumero.get(c.dados.numero)!,
          documentoReferenciaTipo: 'VENDA',
          motivo: `Venda ${c.dados.numero}`,
          criadoPor: c.dados.vendedorId,
          createdAt: c.dados.dataVenda as Date,
        })),
      ),
  });

  // 6d. Facturas — uma por venda facturável.
  await criarFaturas(prisma, tenantId, adminUserId, cabecalhos, vendaPorNumero, rnd);

  // 6e. Totais das sessões de POS, a partir das vendas que lhes pertencem.
  await actualizarTotaisSessoes(prisma, tenantId, sessoes);

  return saidas;
}

interface SessaoRef {
  sessaoCaixaId: string;
  sessaoPOSId: string;
}

async function criarSessoes(
  prisma: PrismaClient,
  tenantId: string,
  utilizadores: string[],
  rnd: () => number,
): Promise<SessaoRef[]> {
  const { numeros } = await reservarNumeros(prisma, tenantId, 'SESSAO_CAIXA', MESES_HISTORICO);

  const caixas = await prisma.sessaoCaixa.createManyAndReturn({
    data: Array.from({ length: MESES_HISTORICO }, (_, mes) => {
      const abertura = diasAtras((MESES_HISTORICO - 1 - mes) * 30 + 28);
      const corrente = mes === MESES_HISTORICO - 1;
      return {
        tenantId,
        responsavelId: escolher(rnd, utilizadores),
        numero: numeros[mes]!,
        dataAbertura: abertura,
        dataFechamento: corrente ? null : maisDias(abertura, 28),
        fundoInicial: d(5000),
        status: corrente ? ('ABERTA' as const) : ('FECHADA' as const),
        createdAt: abertura,
      };
    }),
    select: { id: true, numero: true, dataAbertura: true, status: true },
  });

  const pos = await prisma.sessaoPOS.createManyAndReturn({
    data: caixas.map((c) => ({
      tenantId,
      vendedorId: escolher(rnd, utilizadores),
      sessaoCaixaId: c.id,
      status: c.status === 'ABERTA' ? ('ABERTA' as const) : ('FECHADA' as const),
      abertoEm: c.dataAbertura,
      fechadoEm: c.status === 'ABERTA' ? null : maisDias(c.dataAbertura, 28),
      createdAt: c.dataAbertura,
    })),
    select: { id: true, sessaoCaixaId: true },
  });

  const posPorCaixa = new Map(pos.map((p) => [p.sessaoCaixaId, p.id]));
  return caixas.map((c) => ({ sessaoCaixaId: c.id, sessaoPOSId: posPorCaixa.get(c.id)! }));
}

async function actualizarTotaisSessoes(
  prisma: PrismaClient,
  tenantId: string,
  sessoes: SessaoRef[],
): Promise<void> {
  for (const s of sessoes) {
    const agg = await prisma.venda.aggregate({
      where: { tenantId, sessaoPOSId: s.sessaoPOSId, status: { not: 'CANCELADA' } },
      _sum: { total: true },
      _count: true,
    });
    await prisma.sessaoPOS.update({
      where: { id: s.sessaoPOSId },
      data: { totalVendas: agg._sum.total ?? d(0), numeroPedidos: agg._count },
    });
    await prisma.sessaoCaixa.update({
      where: { id: s.sessaoCaixaId },
      data: { totalEntradas: agg._sum.total ?? d(0) },
    });
  }
}

async function criarFaturas(
  prisma: PrismaClient,
  tenantId: string,
  adminUserId: string,
  cabecalhos: Array<{ dados: Prisma.VendaCreateManyInput; linhas: Linha[]; faturavel: boolean }>,
  vendaPorNumero: Map<string, string>,
  rnd: () => number,
): Promise<void> {
  const faturaveis = cabecalhos.filter((c) => c.faturavel);
  if (faturaveis.length === 0) return;

  const { serieId, numeros } = await reservarNumeros(prisma, tenantId, 'FATURA', faturaveis.length);

  const dados = faturaveis.map((c, i) => {
    const dataEmissao = c.dados.dataVenda as Date;
    const dataVencimento = maisDias(dataEmissao, 30);
    const total = c.dados.total as Prisma.Decimal;
    const subtotal = c.dados.subtotal as Prisma.Decimal;
    const descontoTotal = c.dados.descontoTotal as Prisma.Decimal;

    // Uma venda CONCLUIDA está paga. Uma FATURADA ainda não — e se o
    // vencimento já passou, o estado tem de o dizer, senão o mapa de
    // antiguidade de saldos vem vazio.
    const paga = c.dados.status === 'CONCLUIDA';
    const parcial = !paga && rnd() < 0.3;
    const vencida = !paga && !parcial && dataVencimento < HOJE;

    return {
      cabecalho: c,
      dados: {
        tenantId,
        serieDocumentoId: serieId,
        numero: numeros[i]!,
        clienteId: c.dados.clienteId!,
        vendaId: vendaPorNumero.get(c.dados.numero)!,
        subtotal,
        descontoTotal,
        baseIva: r2(subtotal.sub(descontoTotal)),
        ivaTotal: c.dados.ivaTotal as Prisma.Decimal,
        total,
        totalPago: paga ? total : parcial ? r2(total.div(2)) : d(0),
        status: paga
          ? ('PAGA' as const)
          : parcial
            ? ('PARCIALMENTE_PAGA' as const)
            : vencida
              ? ('VENCIDA' as const)
              : ('EMITIDA' as const),
        dataEmissao,
        dataVencimento,
        dataPagamento: paga ? dataEmissao : null,
        emitidoPorId: adminUserId,
        createdAt: dataEmissao,
      },
    };
  });

  const faturas = await prisma.fatura.createManyAndReturn({
    data: dados.map((f) => f.dados),
    select: { id: true, numero: true },
  });
  const porNumero = new Map(faturas.map((f) => [f.numero, f.id]));

  await prisma.linhaFatura.createMany({
    data: dados.flatMap((f) =>
      f.cabecalho.linhas.map((l, ordem) => ({
        tenantId,
        faturaId: porNumero.get(f.dados.numero)!,
        produtoId: l.produto.id,
        descricao: l.produto.nome,
        quantidade: l.quantidade,
        precoUnitario: l.precoUnitario,
        desconto: l.desconto,
        taxaIva: l.taxaIva,
        subtotal: l.subtotal,
        ivaItem: l.ivaItem,
        total: l.total,
        ordemLinha: ordem,
        createdAt: f.dados.dataEmissao,
      })),
    ),
  });

  // A venda passa a apontar para a sua factura (FK escalar cross-domínio).
  for (const f of dados) {
    await prisma.venda.update({
      where: { id: f.dados.vendaId },
      data: { faturaId: porNumero.get(f.dados.numero)! },
    });
  }

  // Histórico do cliente — é o que a ficha de cliente mostra.
  await prisma.historicoTransacao.createMany({
    data: dados.map((f) => ({
      tenantId,
      clienteId: f.dados.clienteId,
      tipo: 'VENDA' as const,
      referencia: f.dados.numero,
      descricao: `Factura ${f.dados.numero}`,
      valor: f.dados.total,
      dataTransacao: f.dados.dataEmissao,
      status: f.dados.status === 'PAGA' ? ('CONCLUIDO' as const) : ('PENDENTE' as const),
      userId: adminUserId,
      createdAt: f.dados.dataEmissao,
    })),
  });

  console.log(`[seed:demo-vendas] facturas: ${faturas.length}.`);
}

// ─── 7. Stock ─────────────────────────────────────────────────────────────────

/**
 * Entrada inicial e saldo por produto.
 *
 * O saldo **não** é inventado nem calculado à parte: é derivado do
 * `MovimentoStock` depois de a entrada inicial estar gravada. Calcular à parte
 * («entrada menos o que vendi») dava certo no papel e errado na base — ignora
 * movimentos que já lá estavam de testes manuais, e o resultado é uma página de
 * existências a contradizer a de movimentações. Derivar do livro é imune a isso.
 */
async function seedStock(
  prisma: PrismaClient,
  tenantId: string,
  adminUserId: string,
  armazemId: string,
  produtos: ProdutoRef[],
  saidas: Saidas,
): Promise<void> {
  const rnd = gerador(0x570c);
  const dataEntrada = diasAtras(MESES_HISTORICO * 30 + 5);

  await prisma.movimentoStock.createMany({
    data: produtos.map((p) => {
      const vendido = saidas.get(p.id) ?? d(0);
      // Folga sobre o vendido: um produto em cada seis fica abaixo do mínimo,
      // para os alertas de ruptura terem do que falar.
      const folga = rnd() < 0.17 ? d(2) : d(20 + Math.floor(rnd() * 120));
      return {
        tenantId,
        produtoId: p.id,
        tipo: 'ENTRADA' as const,
        quantidade: vendido.add(folga),
        localizacaoDestinoId: armazemId,
        motivo: 'Stock inicial de demonstração',
        criadoPor: adminUserId,
        createdAt: dataEntrada,
      };
    }),
  });

  // Saldo = soma do livro. AJUSTE conta como delta com sinal (é assim que o
  // stock.service o escreve — por `increment` de um valor já assinado).
  const porTipo = await prisma.movimentoStock.groupBy({
    by: ['produtoId', 'tipo'],
    where: { tenantId },
    _sum: { quantidade: true },
  });

  const saldoPorProduto = new Map<string, Prisma.Decimal>();
  for (const linha of porTipo) {
    const q = linha._sum.quantidade ?? d(0);
    const sinal =
      linha.tipo === 'SAIDA' || linha.tipo === 'TRANSFERENCIA_SAIDA' ? q.neg() : q;
    saldoPorProduto.set(
      linha.produtoId,
      (saldoPorProduto.get(linha.produtoId) ?? d(0)).add(sinal),
    );
  }

  for (const p of produtos) {
    const saldo = saldoPorProduto.get(p.id) ?? d(0);
    await prisma.saldoStock.upsert({
      where: {
        tenantId_produtoId_varianteProdutoId_localizacaoId: {
          tenantId,
          produtoId: p.id,
          varianteProdutoId: '',
          localizacaoId: armazemId,
        },
      },
      create: {
        tenantId,
        produtoId: p.id,
        varianteProdutoId: '',
        localizacaoId: armazemId,
        saldo,
      },
      update: { saldo },
    });
  }

  console.log(`[seed:demo-vendas] stock: ${produtos.length} produtos no armazém principal.`);
}

// ─── 8. Reparação ─────────────────────────────────────────────────────────────

/**
 * As duas facturas de demonstração antigas foram gravadas com
 * `clienteId: 'DEMO-CLIENTE-001'` — um identificador que nunca existiu, porque o
 * seed de finanças corre antes do de clientes. A ficha abria sem cliente.
 * Aponta-as a clientes reais.
 */
async function repararFaturasOrfas(
  prisma: PrismaClient,
  tenantId: string,
  clientes: Array<{ id: string }>,
): Promise<void> {
  if (clientes.length === 0) return;
  const validos = new Set(clientes.map((c) => c.id));

  const orfas = await prisma.fatura.findMany({
    where: { tenantId, clienteId: { notIn: [...validos] } },
    select: { id: true, numero: true },
  });
  if (orfas.length === 0) return;

  for (const [i, f] of orfas.entries()) {
    await prisma.fatura.update({
      where: { id: f.id },
      data: { clienteId: clientes[i % clientes.length]!.id },
    });
  }
  console.log(`[seed:demo-vendas] facturas órfãs reatribuídas: ${orfas.length}.`);
}
