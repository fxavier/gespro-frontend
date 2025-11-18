import type { Cotacao } from '@/types/procurement';

export const cotacoesMock: Cotacao[] = [
  {
    id: 'COT-001',
    tenantId: 'tenant-001',
    numero: 'COT-2024-001',
    data: '2024-01-15T08:30:00.000Z',
    requisicaoCompraId: 'REQ-001',
    status: 'enviada',
    dataValidade: '2024-01-25T00:00:00.000Z',
    fornecedores: [
      {
        fornecedorId: 'FOR-001',
        fornecedorNome: 'Tecno Solutions',
        dataEnvio: '2024-01-15T09:00:00.000Z',
        dataResposta: '2024-01-18T14:00:00.000Z',
        status: 'respondida',
        valorTotal: 42000,
        prazoEntrega: 15,
        condicoesPagamento: '30 dias',
        observacoes: 'Inclui instalação e suporte por 6 meses'
      },
      {
        fornecedorId: 'FOR-002',
        fornecedorNome: 'Prime Hardware',
        dataEnvio: '2024-01-15T09:15:00.000Z',
        dataResposta: '2024-01-19T10:30:00.000Z',
        status: 'respondida',
        valorTotal: 41500,
        prazoEntrega: 12,
        condicoesPagamento: '30/60 dias',
        observacoes: 'Entrega expressa disponível'
      },
      {
        fornecedorId: 'FOR-003',
        fornecedorNome: 'Inovare Supplies',
        dataEnvio: '2024-01-15T09:30:00.000Z',
        status: 'pendente'
      }
    ],
    itens: [
      {
        id: 'COT-001-ITEM-1',
        descricao: 'Workstation para Design (32GB RAM / 1TB SSD)',
        quantidade: 5,
        unidadeMedida: 'UN',
        especificacoes: 'Processador i9, GPU RTX 4070',
        respostas: [
          {
            fornecedorId: 'FOR-001',
            precoUnitario: 8300,
            subtotal: 41500,
            prazoEntrega: 15,
            marca: 'Lenovo ThinkStation'
          },
          {
            fornecedorId: 'FOR-002',
            precoUnitario: 8200,
            subtotal: 41000,
            prazoEntrega: 12,
            marca: 'Dell Precision'
          }
        ]
      },
      {
        id: 'COT-001-ITEM-2',
        descricao: 'Monitor profissional 34" curvo',
        quantidade: 5,
        unidadeMedida: 'UN',
        especificacoes: 'Resolução 4K, 144hz',
        respostas: [
          {
            fornecedorId: 'FOR-001',
            precoUnitario: 500,
            subtotal: 2500,
            prazoEntrega: 15,
            marca: 'Samsung'
          },
          {
            fornecedorId: 'FOR-002',
            precoUnitario: 520,
            subtotal: 2600,
            prazoEntrega: 12,
            marca: 'LG'
          }
        ]
      }
    ],
    observacoes: 'Cotação priorizada para o novo laboratório de design.',
    vencedorId: undefined,
    dataCriacao: '2024-01-15T08:30:00.000Z',
    dataAtualizacao: '2024-01-18T15:00:00.000Z'
  },
  {
    id: 'COT-002',
    tenantId: 'tenant-001',
    numero: 'COT-2024-002',
    data: '2024-01-14T10:00:00.000Z',
    requisicaoCompraId: 'REQ-003',
    status: 'respondida',
    dataValidade: '2024-01-22T00:00:00.000Z',
    fornecedores: [
      {
        fornecedorId: 'FOR-004',
        fornecedorNome: 'Suprema Ferragens',
        dataEnvio: '2024-01-14T10:15:00.000Z',
        dataResposta: '2024-01-16T11:20:00.000Z',
        status: 'respondida',
        valorTotal: 7800,
        prazoEntrega: 7,
        condicoesPagamento: 'à vista com 5% de desconto'
      },
      {
        fornecedorId: 'FOR-005',
        fornecedorNome: 'Construmax',
        dataEnvio: '2024-01-14T10:20:00.000Z',
        dataResposta: '2024-01-17T16:45:00.000Z',
        status: 'respondida',
        valorTotal: 8200,
        prazoEntrega: 10,
        condicoesPagamento: '30 dias'
      }
    ],
    itens: [
      {
        id: 'COT-002-ITEM-1',
        descricao: 'Bombas hidráulicas industriais',
        quantidade: 3,
        unidadeMedida: 'UN',
        respostas: [
          {
            fornecedorId: 'FOR-004',
            precoUnitario: 2000,
            subtotal: 6000,
            prazoEntrega: 7
          },
          {
            fornecedorId: 'FOR-005',
            precoUnitario: 2200,
            subtotal: 6600,
            prazoEntrega: 10
          }
        ]
      },
      {
        id: 'COT-002-ITEM-2',
        descricao: 'Conjunto de válvulas de alta pressão',
        quantidade: 10,
        unidadeMedida: 'UN',
        respostas: [
          {
            fornecedorId: 'FOR-004',
            precoUnitario: 180,
            subtotal: 1800,
            prazoEntrega: 7
          },
          {
            fornecedorId: 'FOR-005',
            precoUnitario: 160,
            subtotal: 1600,
            prazoEntrega: 10
          }
        ]
      }
    ],
    observacoes: 'Projeto urgente para linha de produção.',
    vencedorId: 'FOR-004',
    dataCriacao: '2024-01-14T10:00:00.000Z',
    dataAtualizacao: '2024-01-17T17:00:00.000Z'
  },
  {
    id: 'COT-003',
    tenantId: 'tenant-001',
    numero: 'COT-2024-003',
    data: '2024-01-13T11:00:00.000Z',
    requisicaoCompraId: undefined,
    status: 'rascunho',
    dataValidade: '2024-01-28T00:00:00.000Z',
    fornecedores: [],
    itens: [
      {
        id: 'COT-003-ITEM-1',
        descricao: 'Serviço de consultoria em compliance',
        quantidade: 1,
        unidadeMedida: 'PACOTE',
        respostas: []
      }
    ],
    observacoes: 'Aguardando definição do escopo antes de enviar aos fornecedores.',
    vencedorId: undefined,
    dataCriacao: '2024-01-13T11:00:00.000Z',
    dataAtualizacao: '2024-01-13T11:00:00.000Z'
  },
  {
    id: 'COT-004',
    tenantId: 'tenant-001',
    numero: 'COT-2024-004',
    data: '2024-01-10T08:00:00.000Z',
    requisicaoCompraId: 'REQ-002',
    status: 'vencida',
    dataValidade: '2024-01-20T00:00:00.000Z',
    fornecedores: [
      {
        fornecedorId: 'FOR-006',
        fornecedorNome: 'Office Prime',
        dataEnvio: '2024-01-10T08:10:00.000Z',
        dataResposta: '2024-01-12T13:20:00.000Z',
        status: 'respondida',
        valorTotal: 13500,
        prazoEntrega: 5,
        condicoesPagamento: '45 dias'
      },
      {
        fornecedorId: 'FOR-007',
        fornecedorNome: 'Workspace Supplies',
        dataEnvio: '2024-01-10T08:20:00.000Z',
        status: 'pendente'
      }
    ],
    itens: [
      {
        id: 'COT-004-ITEM-1',
        descricao: 'Cadeiras ergonómicas premium',
        quantidade: 10,
        unidadeMedida: 'UN',
        respostas: [
          {
            fornecedorId: 'FOR-006',
            precoUnitario: 450,
            subtotal: 4500,
            prazoEntrega: 5
          }
        ]
      },
      {
        id: 'COT-004-ITEM-2',
        descricao: 'Mesas ajustáveis elétricas',
        quantidade: 5,
        unidadeMedida: 'UN',
        respostas: [
          {
            fornecedorId: 'FOR-006',
            precoUnitario: 900,
            subtotal: 4500,
            prazoEntrega: 5
          }
        ]
      }
    ],
    observacoes: 'Cotação vencida em 20/01/2024.',
    vencedorId: undefined,
    dataCriacao: '2024-01-10T08:00:00.000Z',
    dataAtualizacao: '2024-01-12T13:20:00.000Z'
  }
];
