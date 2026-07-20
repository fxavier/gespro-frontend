// Seed do módulo de Operações (WS F)
// Idempotente: usa upsert por chave natural.
// Dados baseados em:
//   - src/lib/storage/ticket-storage.ts (CategoriaTicketStorage.getCategoriasIniciais)
//   - mocks inline de transporte (dados representativos para demo)
//
// Exporta: seedOperacoes(prisma, tenantId)

import type { PrismaClient } from '@prisma/client';

// ============================================================
// Categorias de Ticket (baseado no legado ticket-storage.ts)
// ============================================================

const CATEGORIAS_TICKET_INICIAIS = [
  {
    nome: 'Hardware',
    descricao: 'Problemas com equipamentos físicos',
    icone: 'Monitor',
    cor: '#3b82f6',
    subcategorias: ['Computador', 'Impressora', 'Periféricos'],
    slaTempoResposta: 120,  // 2h
    slaTempoResolucao: 1440, // 24h
  },
  {
    nome: 'Software',
    descricao: 'Problemas com aplicações e sistemas',
    icone: 'Code',
    cor: '#10b981',
    subcategorias: ['Sistema Operativo', 'Aplicações', 'Licenças'],
    slaTempoResposta: 240,  // 4h
    slaTempoResolucao: 2880, // 48h
  },
  {
    nome: 'Rede',
    descricao: 'Problemas de conectividade e rede',
    icone: 'Wifi',
    cor: '#f59e0b',
    subcategorias: ['Internet', 'Wi-Fi', 'VPN'],
    slaTempoResposta: 60,   // 1h
    slaTempoResolucao: 480,  // 8h
  },
  {
    nome: 'Acesso',
    descricao: 'Solicitações de acesso e permissões',
    icone: 'Key',
    cor: '#8b5cf6',
    subcategorias: ['Novo Utilizador', 'Redefinição de Senha', 'Permissões'],
    slaTempoResposta: 120,  // 2h
    slaTempoResolucao: 1440, // 24h
  },
  {
    nome: 'Transporte',
    descricao: 'Incidentes e problemas do módulo de transporte',
    icone: 'Truck',
    cor: '#ef4444',
    subcategorias: ['Viatura', 'Motorista', 'Rota', 'Entrega'],
    slaTempoResposta: 60,   // 1h
    slaTempoResolucao: 480,  // 8h
  },
] as const;

// ============================================================
// Viatura demo
// ============================================================

const VIATURAS_DEMO = [
  {
    matricula: 'MA-10-AB',
    marca: 'Toyota',
    modelo: 'Hilux',
    tipoViatura: 'LIGEIRO_MERCADORIAS' as const,
    capacidade: 1000,
    unidadeCapacidade: 'KG' as const,
    localActividade: 'Maputo',
    dataInicioActividade: new Date('2023-01-01'),
  },
  {
    matricula: 'MA-20-CD',
    marca: 'Isuzu',
    modelo: 'D-Max',
    tipoViatura: 'LIGEIRO_MERCADORIAS' as const,
    capacidade: 800,
    unidadeCapacidade: 'KG' as const,
    localActividade: 'Matola',
    dataInicioActividade: new Date('2023-06-01'),
  },
] as const;

// ============================================================
// Motorista demo
// ============================================================

const MOTORISTAS_DEMO = [
  {
    nomeCompleto: 'Manuel António Cossa',
    contacto: '+258841234567',
    numeroCarta: 'CC-2020-001234',
    categoriaCarta: ['B', 'C'],
    dataEmissaoCarta: new Date('2020-03-15'),
    validadeCarta: new Date('2030-03-15'),
    localActividade: 'Maputo',
  },
  {
    nomeCompleto: 'José Filipe Macuacua',
    contacto: '+258841234568',
    numeroCarta: 'CC-2019-005678',
    categoriaCarta: ['B'],
    dataEmissaoCarta: new Date('2019-07-20'),
    validadeCarta: new Date('2029-07-20'),
    localActividade: 'Matola',
  },
] as const;

// ============================================================
// Equipe de Suporte demo
// ============================================================

const EQUIPES_SUPORTE_DEMO = [
  {
    nome: 'Suporte TI',
    descricao: 'Equipe de suporte técnico de informática',
    categorias: [] as string[],
    horarioInicio: '08:00',
    horarioFim: '17:00',
    diasSemana: [1, 2, 3, 4, 5], // Segunda a Sexta
  },
] as const;

// ============================================================
// Artigo de Base de Conhecimento demo
// ============================================================

const ARTIGOS_BC_DEMO = [
  {
    titulo: 'Como reportar um problema de viatura',
    conteudo: `# Como reportar um problema de viatura

Ao identificar um problema numa viatura, siga estes passos:

1. Abra um ticket do tipo "Incidente" na categoria "Transporte"
2. Seleccione a subcategoria "Viatura"
3. Descreva o problema detalhadamente
4. Inclua a matrícula da viatura
5. Se possível, anexe fotografias do problema

A equipe de transporte responderá em até 1 hora em dias úteis.`,
    resumo: 'Guia para reportar problemas com viaturas através do sistema de tickets.',
    categoria: 'Transporte',
    tags: ['viatura', 'transporte', 'incidente'],
    visibilidade: 'PUBLICA' as const,
  },
] as const;

// ============================================================
// Função principal
// ============================================================

export async function seedOperacoes(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  console.log('  Seed operacoes: categorias de ticket...');

  // 1. Categorias de Ticket
  for (const cat of CATEGORIAS_TICKET_INICIAIS) {
    await prisma.categoriaTicket.upsert({
      where: { tenantId_nome: { tenantId, nome: cat.nome } },
      update: {
        descricao: cat.descricao,
        slaTempoResposta: cat.slaTempoResposta,
        slaTempoResolucao: cat.slaTempoResolucao,
      },
      create: {
        tenantId,
        nome: cat.nome,
        descricao: cat.descricao,
        icone: cat.icone,
        cor: cat.cor,
        subcategorias: [...cat.subcategorias],
        slaTempoResposta: cat.slaTempoResposta,
        slaTempoResolucao: cat.slaTempoResolucao,
        ativa: true,
      },
    });
  }

  console.log('  Seed operacoes: equipes de suporte...');

  // 2. Equipes de Suporte
  for (const equipe of EQUIPES_SUPORTE_DEMO) {
    await prisma.equipeSuporte.upsert({
      where: { tenantId_nome: { tenantId, nome: equipe.nome } },
      update: {},
      create: {
        tenantId,
        nome: equipe.nome,
        descricao: equipe.descricao,
        categorias: equipe.categorias,
        horarioInicio: equipe.horarioInicio,
        horarioFim: equipe.horarioFim,
        diasSemana: [...equipe.diasSemana],
        estado: 'ATIVA',
      },
    });
  }

  console.log('  Seed operacoes: viaturas demo...');

  // 3. Viaturas demo
  for (const viatura of VIATURAS_DEMO) {
    const existente = await prisma.viatura.findFirst({
      where: { tenantId, matricula: viatura.matricula },
    });

    if (!existente) {
      await prisma.viatura.create({
        data: {
          tenantId,
          ...viatura,
          observacoes: 'Viatura de demonstração',
        },
      });
    }
  }

  console.log('  Seed operacoes: motoristas demo...');

  // 4. Motoristas demo
  for (const motorista of MOTORISTAS_DEMO) {
    const existente = await prisma.motorista.findFirst({
      where: { tenantId, numeroCarta: motorista.numeroCarta },
    });

    if (!existente) {
      await prisma.motorista.create({
        data: {
          tenantId,
          ...motorista,
          categoriaCarta: [...motorista.categoriaCarta],
          observacoes: 'Motorista de demonstração',
          disponibilidade: {
            create: {
              tenantId,
              disponivel: true,
              fonte: 'SISTEMA',
            },
          },
        },
      });
    }
  }

  console.log('  Seed operacoes: base de conhecimento...');

  // 5. Artigos da Base de Conhecimento
  // Obter um utilizador do tenant para ser autor
  const autor = await prisma.user.findFirst({
    where: { tenantId },
    select: { id: true, nome: true },
  });

  if (autor) {
    for (const artigo of ARTIGOS_BC_DEMO) {
      const existente = await prisma.baseConhecimento.findFirst({
        where: { tenantId, titulo: artigo.titulo },
      });

      if (!existente) {
        await prisma.baseConhecimento.create({
          data: {
            tenantId,
            titulo: artigo.titulo,
            conteudo: artigo.conteudo,
            resumo: artigo.resumo,
            categoria: artigo.categoria,
            tags: [...artigo.tags],
            visibilidade: artigo.visibilidade,
            autorId: autor.id,
            autorNome: autor.nome,
            estado: 'PUBLICADO',
          },
        });
      }
    }
  }

  console.log('  Seed operacoes: concluído.');
}
