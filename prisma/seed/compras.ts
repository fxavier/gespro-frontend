/**
 * Seed de Compras & Fornecedores — WS B (Wave 2)
 * Dados vindos de:
 *   - src/lib/storage/fornecedor-storage.ts  (getFornecedoresIniciais)
 *   - src/data/requisicoes-compras.ts         (requisicoesComprasMock)
 *   - src/data/cotacoes.ts                    (cotacoesMock)
 *
 * Idempotente — usa upsert/findFirst por chave natural.
 * Exporta seedCompras(prisma, tenantId) — chamado pelo orquestrador.
 */

// prisma as any — Prisma client não tem os modelos WS B ainda; Wave 3 remove
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPrisma = any;

// =====================================================================
// Dados estáticos dos fornecedores
// (extraídos de FornecedorStorage.getFornecedoresIniciais())
// =====================================================================

const FORNECEDORES = [
  {
    codigo: 'FOR-0001',
    nome: 'Distribuidora ABC Moçambique',
    tipo: 'PESSOA_JURIDICA',
    nuit: '123456789',
    email: 'vendas@distribuidoraabc.co.mz',
    telefone: '+258 21 123 456',
    status: 'ATIVO',
    classificacao: 'PREFERENCIAL',
    rating: 4.5,
    diasPagamento: 30,
    condicoesComerciaisDesconto: 5,
    endereco: { tipo: 'SEDE', rua: 'Avenida Julius Nyerere', numero: '123', bairro: 'Sommerschield', cidade: 'Maputo', provincia: 'Maputo' },
    contactos: [
      { nome: 'Pedro Neves', cargo: 'Gerente de Vendas', email: 'pedro.neves@distribuidoraabc.co.mz', telefone: '+258 84 111 2222', tipo: 'PRINCIPAL' },
      { nome: 'Ana Costa', cargo: 'Responsável Financeiro', email: 'ana.costa@distribuidoraabc.co.mz', telefone: '+258 84 333 4444', tipo: 'FINANCEIRO' },
    ],
    avaliacao: { qualidade: 5, prazo: 4, preco: 4, comunicacao: 5, observacoes: 'Excelente fornecedor' },
  },
  {
    codigo: 'FOR-0002',
    nome: 'Importadora XYZ Lda',
    tipo: 'PESSOA_JURIDICA',
    nuit: '987654321',
    email: 'contato@importadoraxyz.co.mz',
    telefone: '+258 84 321 654',
    status: 'ATIVO',
    classificacao: 'REGULAR',
    rating: 4.0,
    diasPagamento: 45,
    condicoesComerciaisDesconto: 3,
    endereco: { tipo: 'SEDE', rua: 'Avenida 24 de Julho', numero: '456', bairro: 'Polana', cidade: 'Maputo', provincia: 'Maputo' },
    contactos: [] as { nome: string; cargo: string; email: string; telefone: string; tipo: string }[],
    avaliacao: null as null | { qualidade: number; prazo: number; preco: number; comunicacao: number; observacoes: string },
  },
  {
    codigo: 'FOR-0003',
    nome: 'Fornecedor Local Maputo',
    tipo: 'PESSOA_FISICA',
    nuit: '456789123',
    email: 'fornecedor@local.co.mz',
    telefone: '+258 87 987 654',
    status: 'ATIVO',
    classificacao: 'NOVO',
    rating: 3.5,
    diasPagamento: 15,
    condicoesComerciaisDesconto: 0,
    endereco: { tipo: 'SEDE', rua: 'Rua da Resistência', numero: '789', bairro: 'Matola', cidade: 'Matola', provincia: 'Maputo' },
    contactos: [] as { nome: string; cargo: string; email: string; telefone: string; tipo: string }[],
    avaliacao: null as null | { qualidade: number; prazo: number; preco: number; comunicacao: number; observacoes: string },
  },
  {
    codigo: 'FOR-0004',
    nome: 'Empresa de Logística Beira',
    tipo: 'PESSOA_JURIDICA',
    nuit: '789123456',
    email: 'logistica@beira.co.mz',
    telefone: '+258 82 456 789',
    status: 'INATIVO',
    classificacao: 'REGULAR',
    rating: 2.5,
    diasPagamento: 30,
    condicoesComerciaisDesconto: 2,
    endereco: { tipo: 'SEDE', rua: 'Avenida Eduardo Mondlane', numero: '321', bairro: 'Centro', cidade: 'Beira', provincia: 'Sofala' },
    contactos: [] as { nome: string; cargo: string; email: string; telefone: string; tipo: string }[],
    avaliacao: null as null | { qualidade: number; prazo: number; preco: number; comunicacao: number; observacoes: string },
  },
  {
    codigo: 'FOR-0005',
    nome: 'Distribuidor Nampula',
    tipo: 'PESSOA_JURIDICA',
    nuit: '321654987',
    email: 'vendas@distribuidor-nampula.co.mz',
    telefone: '+258 84 321 654',
    status: 'ATIVO',
    classificacao: 'PREFERENCIAL',
    rating: 4.8,
    diasPagamento: 60,
    condicoesComerciaisDesconto: 8,
    endereco: { tipo: 'SEDE', rua: 'Avenida Samora Machel', numero: '654', bairro: 'Centro', cidade: 'Nampula', provincia: 'Nampula' },
    contactos: [] as { nome: string; cargo: string; email: string; telefone: string; tipo: string }[],
    avaliacao: null as null | { qualidade: number; prazo: number; preco: number; comunicacao: number; observacoes: string },
  },
];

// Requisições de compra (de requisicoesComprasMock)
// Valores de status e prioridade em SCREAMING_SNAKE conforme enums Prisma
const REQUISICOES = [
  {
    numero: 'REQ-2024-001',
    data: new Date('2024-01-15'),
    solicitanteNome: 'João Silva',
    departamento: 'TI',
    prioridade: 'ALTA',
    status: 'EM_APROVACAO',
    valorTotal: 45000,
    dataEntregaDesejada: new Date('2024-02-01'),
    justificativa: 'Atualização das licenças de software corporativo para suportar a expansão da equipa de desenvolvimento.',
  },
  {
    numero: 'REQ-2024-002',
    data: new Date('2024-01-14'),
    solicitanteNome: 'Maria Santos',
    departamento: 'Compras',
    prioridade: 'MEDIA',
    status: 'APROVADA',
    valorTotal: 12500,
    dataEntregaDesejada: new Date('2024-01-25'),
    justificativa: 'Reposição do stock mínimo de equipamentos de escritório para novas contratações.',
  },
  {
    numero: 'REQ-2024-003',
    data: new Date('2024-01-13'),
    solicitanteNome: 'Pedro Costa',
    departamento: 'Manutenção',
    prioridade: 'URGENTE',
    status: 'PENDENTE',
    valorTotal: 8900,
    dataEntregaDesejada: new Date('2024-01-20'),
    justificativa: 'Reposição imediata de peças críticas para evitar paralisação da linha de produção.',
  },
  {
    numero: 'REQ-2024-004',
    data: new Date('2024-01-12'),
    solicitanteNome: 'Ana Oliveira',
    departamento: 'Administrativo',
    prioridade: 'BAIXA',
    status: 'REJEITADA',
    valorTotal: 3200,
    dataEntregaDesejada: new Date('2024-02-10'),
    justificativa: 'Aquisição de mobiliário adicional para a sala de reuniões secundária.',
  },
  {
    numero: 'REQ-2024-005',
    data: new Date('2024-01-11'),
    solicitanteNome: 'Carlos Mendes',
    departamento: 'Produção',
    prioridade: 'ALTA',
    status: 'CONVERTIDA',
    valorTotal: 67800,
    dataEntregaDesejada: new Date('2024-01-30'),
    justificativa: 'Compra de matéria-prima para garantir a produção do novo lote de equipamentos.',
  },
];

// =====================================================================
// Função principal
// =====================================================================

export async function seedCompras(prisma: AnyPrisma, tenantId: string): Promise<void> {
  console.log('[seed:compras] A iniciar...');

  // 1. Fornecedores (upsert por [tenantId, nuit])
  const fornecedorIds: Record<string, string> = {};

  for (const f of FORNECEDORES) {
    const existing = await prisma.fornecedor.findUnique({
      where: { tenantId_nuit: { tenantId, nuit: f.nuit } },
    });

    let rec: { id: string };
    if (existing) {
      rec = await prisma.fornecedor.update({
        where: { id: existing.id },
        data: {
          nome: f.nome,
          email: f.email,
          rating: f.rating,
          status: f.status,
        },
      });
      console.log(`[seed:compras]   Fornecedor ${f.codigo} actualizado → ${rec.id}`);
    } else {
      rec = await prisma.fornecedor.create({
        data: {
          tenantId,
          codigo: f.codigo,
          nome: f.nome,
          tipo: f.tipo,
          nuit: f.nuit,
          email: f.email,
          telefone: f.telefone,
          status: f.status,
          classificacao: f.classificacao,
          rating: f.rating,
          diasPagamento: f.diasPagamento,
          condicoesComerciaisDesconto: f.condicoesComerciaisDesconto,
          enderecos: {
            create: [{
              tenantId,
              tipo: f.endereco.tipo,
              rua: f.endereco.rua,
              numero: f.endereco.numero,
              bairro: f.endereco.bairro,
              cidade: f.endereco.cidade,
              provincia: f.endereco.provincia,
              principal: true,
            }],
          },
        },
      });
      console.log(`[seed:compras]   Fornecedor ${f.codigo} criado → ${rec.id}`);
    }

    fornecedorIds[f.codigo] = rec.id;

    // 2. Contactos (só em create, idempotente por email)
    for (const c of f.contactos) {
      const existsC = await prisma.contactoFornecedor.findFirst({
        where: { tenantId, fornecedorId: rec.id, email: c.email },
      });
      if (!existsC) {
        await prisma.contactoFornecedor.create({
          data: {
            tenantId,
            fornecedorId: rec.id,
            nome: c.nome,
            cargo: c.cargo,
            email: c.email,
            telefone: c.telefone,
            tipo: c.tipo,
            ativo: true,
          },
        });
      }
    }

    // 3. Avaliação inicial (idempotente — apenas a primeira)
    if (f.avaliacao) {
      const existsAv = await prisma.avaliacaoFornecedor.findFirst({
        where: { tenantId, fornecedorId: rec.id },
      });
      if (!existsAv) {
        await prisma.avaliacaoFornecedor.create({
          data: {
            tenantId,
            fornecedorId: rec.id,
            avaliadorId: 'seed-user',
            qualidade: f.avaliacao.qualidade,
            prazo: f.avaliacao.prazo,
            preco: f.avaliacao.preco,
            comunicacao: f.avaliacao.comunicacao,
            observacoes: f.avaliacao.observacoes,
          },
        });
      }
    }
  }

  // 4. Requisições de compra (upsert por [tenantId, numero])
  for (const r of REQUISICOES) {
    const existing = await prisma.requisicaoCompra.findUnique({
      where: { tenantId_numero: { tenantId, numero: r.numero } },
    });
    if (!existing) {
      await prisma.requisicaoCompra.create({
        data: {
          tenantId,
          numero: r.numero,
          data: r.data,
          solicitanteId: 'seed-user',
          solicitanteNome: r.solicitanteNome,
          departamento: r.departamento,
          prioridade: r.prioridade,
          status: r.status,
          valorTotal: r.valorTotal,
          dataEntregaDesejada: r.dataEntregaDesejada,
          justificativa: r.justificativa,
        },
      });
      console.log(`[seed:compras]   Requisição ${r.numero} criada`);
    } else {
      console.log(`[seed:compras]   Requisição ${r.numero} já existe`);
    }
  }

  // 5. Cotação de exemplo (ligada ao FOR-0001 e FOR-0002)
  const cotNro = 'COT-2024-001';
  const existsCot = await prisma.cotacao.findUnique({
    where: { tenantId_numero: { tenantId, numero: cotNro } },
  });

  if (!existsCot && fornecedorIds['FOR-0001'] && fornecedorIds['FOR-0002']) {
    await prisma.cotacao.create({
      data: {
        tenantId,
        numero: cotNro,
        data: new Date('2024-01-15'),
        status: 'ENVIADA',
        dataValidade: new Date('2024-01-25'),
        observacoes: 'Cotação seed inicial',
        fornecedores: {
          create: [
            {
              tenantId,
              fornecedorId: fornecedorIds['FOR-0001'],
              status: 'RESPONDIDA',
              dataEnvio: new Date('2024-01-15'),
              dataResposta: new Date('2024-01-18'),
              valorTotal: 42000,
              prazoEntregaDias: 15,
              condicoesPagamento: '30 dias',
              observacoes: 'Inclui instalação e suporte por 6 meses',
            },
            {
              tenantId,
              fornecedorId: fornecedorIds['FOR-0002'],
              status: 'RESPONDIDA',
              dataEnvio: new Date('2024-01-15'),
              dataResposta: new Date('2024-01-19'),
              valorTotal: 41500,
              prazoEntregaDias: 12,
              condicoesPagamento: '30/60 dias',
            },
          ],
        },
      },
    });
    console.log(`[seed:compras]   Cotação ${cotNro} criada`);
  } else if (existsCot) {
    console.log(`[seed:compras]   Cotação ${cotNro} já existe`);
  }

  console.log('[seed:compras] Concluído: 5 fornecedores, 2 contactos, 1 avaliação, 5 requisições, 1 cotação.');
}
