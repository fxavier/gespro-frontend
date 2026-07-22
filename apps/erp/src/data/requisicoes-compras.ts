export type StatusRequisicaoCompra =
  | 'rascunho'
  | 'pendente'
  | 'em_aprovacao'
  | 'aprovada'
  | 'rejeitada'
  | 'cancelada'
  | 'convertida';

export type PrioridadeRequisicao = 'baixa' | 'media' | 'alta' | 'urgente';

export interface ItemRequisicaoDetalhado {
  id: string;
  descricao: string;
  quantidade: number;
  unidade: string;
  precoEstimado: number;
  subtotal: number;
  observacoes?: string;
}

export interface AprovacaoRequisicao {
  id: string;
  nivel: number;
  aprovador: string;
  cargo: string;
  status: 'pendente' | 'aprovado' | 'rejeitado';
  data?: string;
  observacoes?: string;
}

export interface RequisicaoComprasDetalhada {
  id: string;
  numero: string;
  data: string;
  solicitante: string;
  departamento: string;
  prioridade: PrioridadeRequisicao;
  status: StatusRequisicaoCompra;
  itens: number;
  valorTotal: number;
  dataEntregaDesejada: string;
  nivelAprovacao: number;
  totalNiveis: number;
  justificativa: string;
  observacoes?: string;
  centroCusto?: string;
  itensDetalhados: ItemRequisicaoDetalhado[];
  aprovacoes: AprovacaoRequisicao[];
}

export const requisicoesComprasMock: RequisicaoComprasDetalhada[] = [
  {
    id: 'REQ-001',
    numero: 'REQ-2024-001',
    data: '2024-01-15',
    solicitante: 'João Silva',
    departamento: 'TI',
    prioridade: 'alta',
    status: 'em_aprovacao',
    itens: 5,
    valorTotal: 45000,
    dataEntregaDesejada: '2024-02-01',
    nivelAprovacao: 2,
    totalNiveis: 3,
    justificativa:
      'Atualização das licenças de software corporativo para suportar a expansão da equipa de desenvolvimento.',
    observacoes: 'Prioridade para instalação até o final de janeiro.',
    centroCusto: 'TI-001',
    itensDetalhados: [
      {
        id: 'REQ-001-ITEM-1',
        descricao: 'Licenças Microsoft 365 Business',
        quantidade: 30,
        unidade: 'un',
        precoEstimado: 350,
        subtotal: 10500,
        observacoes: 'Plano Business Standard'
      },
      {
        id: 'REQ-001-ITEM-2',
        descricao: 'Assinaturas GitHub Enterprise',
        quantidade: 15,
        unidade: 'un',
        precoEstimado: 420,
        subtotal: 6300
      },
      {
        id: 'REQ-001-ITEM-3',
        descricao: 'Serviço de backup em nuvem',
        quantidade: 1,
        unidade: 'pacote',
        precoEstimado: 12000,
        subtotal: 12000,
        observacoes: 'Contrato anual'
      },
      {
        id: 'REQ-001-ITEM-4',
        descricao: 'Licenças Jira Software',
        quantidade: 20,
        unidade: 'un',
        precoEstimado: 280,
        subtotal: 5600
      },
      {
        id: 'REQ-001-ITEM-5',
        descricao: 'Serviço de suporte técnico',
        quantidade: 1,
        unidade: 'pacote',
        precoEstimado: 10600,
        subtotal: 10600
      }
    ],
    aprovacoes: [
      {
        id: 'REQ-001-APR-1',
        nivel: 1,
        aprovador: 'Carlos Pereira',
        cargo: 'Gestor de TI',
        status: 'aprovado',
        data: '2024-01-16',
        observacoes: 'Alinhado com o plano estratégico de TI.'
      },
      {
        id: 'REQ-001-APR-2',
        nivel: 2,
        aprovador: 'Helena Matos',
        cargo: 'Diretora Financeira',
        status: 'pendente'
      },
      {
        id: 'REQ-001-APR-3',
        nivel: 3,
        aprovador: 'Jorge Manjate',
        cargo: 'CEO',
        status: 'pendente'
      }
    ]
  },
  {
    id: 'REQ-002',
    numero: 'REQ-2024-002',
    data: '2024-01-14',
    solicitante: 'Maria Santos',
    departamento: 'Compras',
    prioridade: 'media',
    status: 'aprovada',
    itens: 3,
    valorTotal: 12500,
    dataEntregaDesejada: '2024-01-25',
    nivelAprovacao: 3,
    totalNiveis: 3,
    justificativa: 'Reposição do stock mínimo de equipamentos de escritório para novas contratações.',
    observacoes: 'Itens devem ser entregues no escritório central.',
    centroCusto: 'ADM-002',
    itensDetalhados: [
      {
        id: 'REQ-002-ITEM-1',
        descricao: 'Cadeiras ergonómicas',
        quantidade: 10,
        unidade: 'un',
        precoEstimado: 450,
        subtotal: 4500
      },
      {
        id: 'REQ-002-ITEM-2',
        descricao: 'Secretárias ajustáveis',
        quantidade: 5,
        unidade: 'un',
        precoEstimado: 850,
        subtotal: 4250
      },
      {
        id: 'REQ-002-ITEM-3',
        descricao: 'Monitores 27"',
        quantidade: 5,
        unidade: 'un',
        precoEstimado: 750,
        subtotal: 3750
      }
    ],
    aprovacoes: [
      {
        id: 'REQ-002-APR-1',
        nivel: 1,
        aprovador: 'André Timana',
        cargo: 'Coordenador Administrativo',
        status: 'aprovado',
        data: '2024-01-15'
      },
      {
        id: 'REQ-002-APR-2',
        nivel: 2,
        aprovador: 'Helena Matos',
        cargo: 'Diretora Financeira',
        status: 'aprovado',
        data: '2024-01-16'
      },
      {
        id: 'REQ-002-APR-3',
        nivel: 3,
        aprovador: 'Jorge Manjate',
        cargo: 'CEO',
        status: 'aprovado',
        data: '2024-01-17'
      }
    ]
  },
  {
    id: 'REQ-003',
    numero: 'REQ-2024-003',
    data: '2024-01-13',
    solicitante: 'Pedro Costa',
    departamento: 'Manutenção',
    prioridade: 'urgente',
    status: 'pendente',
    itens: 8,
    valorTotal: 8900,
    dataEntregaDesejada: '2024-01-20',
    nivelAprovacao: 0,
    totalNiveis: 2,
    justificativa:
      'Reposição imediata de peças críticas para evitar paralisação da linha de produção.',
    observacoes: 'Solicitar transporte expresso.',
    centroCusto: 'MAN-008',
    itensDetalhados: [
      {
        id: 'REQ-003-ITEM-1',
        descricao: 'Correias industriais',
        quantidade: 4,
        unidade: 'pc',
        precoEstimado: 650,
        subtotal: 2600
      },
      {
        id: 'REQ-003-ITEM-2',
        descricao: 'Sensores de temperatura',
        quantidade: 6,
        unidade: 'pc',
        precoEstimado: 450,
        subtotal: 2700
      },
      {
        id: 'REQ-003-ITEM-3',
        descricao: 'Kit de lubrificação',
        quantidade: 5,
        unidade: 'pc',
        precoEstimado: 300,
        subtotal: 1500
      },
      {
        id: 'REQ-003-ITEM-4',
        descricao: 'Rolamentos',
        quantidade: 10,
        unidade: 'pc',
        precoEstimado: 210,
        subtotal: 2100
      }
    ],
    aprovacoes: [
      {
        id: 'REQ-003-APR-1',
        nivel: 1,
        aprovador: 'Samuel Zimba',
        cargo: 'Supervisor de Manutenção',
        status: 'pendente'
      },
      {
        id: 'REQ-003-APR-2',
        nivel: 2,
        aprovador: 'Helena Matos',
        cargo: 'Diretora Financeira',
        status: 'pendente'
      }
    ]
  },
  {
    id: 'REQ-004',
    numero: 'REQ-2024-004',
    data: '2024-01-12',
    solicitante: 'Ana Oliveira',
    departamento: 'Administrativo',
    prioridade: 'baixa',
    status: 'rejeitada',
    itens: 2,
    valorTotal: 3200,
    dataEntregaDesejada: '2024-02-10',
    nivelAprovacao: 1,
    totalNiveis: 2,
    justificativa: 'Aquisição de mobiliário adicional para a sala de reuniões secundária.',
    observacoes: 'Pode ser reavaliado no próximo trimestre.',
    centroCusto: 'ADM-005',
    itensDetalhados: [
      {
        id: 'REQ-004-ITEM-1',
        descricao: 'Mesa de reuniões 10 lugares',
        quantidade: 1,
        unidade: 'un',
        precoEstimado: 2200,
        subtotal: 2200
      },
      {
        id: 'REQ-004-ITEM-2',
        descricao: 'Painel interativo 65"',
        quantidade: 1,
        unidade: 'un',
        precoEstimado: 1000,
        subtotal: 1000
      }
    ],
    aprovacoes: [
      {
        id: 'REQ-004-APR-1',
        nivel: 1,
        aprovador: 'André Timana',
        cargo: 'Coordenador Administrativo',
        status: 'rejeitado',
        data: '2024-01-13',
        observacoes: 'Priorizar investimentos em infraestrutura principal.'
      },
      {
        id: 'REQ-004-APR-2',
        nivel: 2,
        aprovador: 'Helena Matos',
        cargo: 'Diretora Financeira',
        status: 'pendente'
      }
    ]
  },
  {
    id: 'REQ-005',
    numero: 'REQ-2024-005',
    data: '2024-01-11',
    solicitante: 'Carlos Mendes',
    departamento: 'Produção',
    prioridade: 'alta',
    status: 'convertida',
    itens: 12,
    valorTotal: 67800,
    dataEntregaDesejada: '2024-01-30',
    nivelAprovacao: 3,
    totalNiveis: 3,
    justificativa:
      'Compra de matéria-prima para garantir a produção do novo lote de equipamentos.',
    observacoes: 'Pedido já convertido em ordem de compra #PO-2024-087.',
    centroCusto: 'PRO-004',
    itensDetalhados: [
      {
        id: 'REQ-005-ITEM-1',
        descricao: 'Bobinas de aço galvanizado',
        quantidade: 20,
        unidade: 'ton',
        precoEstimado: 1500,
        subtotal: 30000
      },
      {
        id: 'REQ-005-ITEM-2',
        descricao: 'Componentes eletrónicos diversos',
        quantidade: 50,
        unidade: 'caixa',
        precoEstimado: 250,
        subtotal: 12500
      },
      {
        id: 'REQ-005-ITEM-3',
        descricao: 'Cablagem industrial',
        quantidade: 100,
        unidade: 'rolo',
        precoEstimado: 110,
        subtotal: 11000
      },
      {
        id: 'REQ-005-ITEM-4',
        descricao: 'Serviços de transporte especializado',
        quantidade: 1,
        unidade: 'pacote',
        precoEstimado: 14300,
        subtotal: 14300
      }
    ],
    aprovacoes: [
      {
        id: 'REQ-005-APR-1',
        nivel: 1,
        aprovador: 'Samuel Zimba',
        cargo: 'Supervisor de Produção',
        status: 'aprovado',
        data: '2024-01-12'
      },
      {
        id: 'REQ-005-APR-2',
        nivel: 2,
        aprovador: 'Helena Matos',
        cargo: 'Diretora Financeira',
        status: 'aprovado',
        data: '2024-01-13'
      },
      {
        id: 'REQ-005-APR-3',
        nivel: 3,
        aprovador: 'Jorge Manjate',
        cargo: 'CEO',
        status: 'aprovado',
        data: '2024-01-14'
      }
    ]
  }
];
