import {
  Building2,
  Users,
  Factory,
  PackageSearch,
  Landmark,
  ShoppingCart,
  Briefcase,
  UserCog,
  Wrench,
  Ticket,
  Truck,
  LineChart,
  LucideIcon
} from 'lucide-react';

export interface SystemModule {
  id: string;
  title: string;
  description: string;
  springModule: string;
  typescriptModels: string[];
  responsibilities: string[];
  dashboardPath: string;
  icon: LucideIcon;
  accentColor: string;
}

export const SYSTEM_MODULES: SystemModule[] = [
  {
    id: 'core-tenancy',
    title: 'Core Tenancy & Shared Kernel',
    description: 'Gestão multi-tenant, validações fiscais e utilitários partilhados.',
    springModule: 'core-tenancy-module, shared-kernel',
    typescriptModels: [
      'Tenant',
      'Usuario',
      'ConfiguracoesFiscais',
      'SerieDocumento',
      'validacao-bi.ts',
      'provincias-mocambique.ts'
    ],
    responsibilities: [
      'Gestão do tenantId e ciclo de vida dos utilizadores',
      'Configurações fiscais e séries documentais por tenant',
      'Validações de BI/NUIT e utilitários partilhados'
    ],
    dashboardPath: '/core-tenancy',
    icon: Building2,
    accentColor: 'bg-blue-600'
  },
  {
    id: 'crm-clientes',
    title: 'CRM – Clientes',
    description: 'Clientes, contactos, histórico de transações e dashboards segmentados.',
    springModule: 'crm-clientes-module',
    typescriptModels: [
      'Cliente',
      'EnderecoCliente',
      'ContactoCliente',
      'HistoricoTransacao',
      'DashboardClientes'
    ],
    responsibilities: [
      'Gestão do agregado Cliente e contactos',
      'Histórico e segmentação por valor e risco',
      'Dashboards e relatórios específicos de CRM'
    ],
    dashboardPath: '/clientes/dashboard',
    icon: Users,
    accentColor: 'bg-emerald-600'
  },
  {
    id: 'fornecedores-procurement',
    title: 'Fornecedores & Procurement',
    description: 'Abastecimento estratégico, requisições, cotações e workflows de aprovação.',
    springModule: 'fornecedores-procurement-module',
    typescriptModels: [
      'Fornecedor',
      'RequisicaoCompra',
      'Cotacao',
      'PedidoCompra',
      'WorkflowAprovacao'
    ],
    responsibilities: [
      'Registo e avaliação de fornecedores',
      'Gestão de requisições, cotações e pedidos',
      'Workflows de aprovação e relatórios de procurement'
    ],
    dashboardPath: '/procurement',
    icon: PackageSearch,
    accentColor: 'bg-purple-600'
  },
  {
    id: 'inventory-assets',
    title: 'Inventário & Ativos',
    description: 'Catálogo de produtos, movimentações de stock e gestão de ativos.',
    springModule: 'inventory-assets-module',
    typescriptModels: [
      'Produto',
      'VarianteProduto',
      'MovimentacaoStock',
      'Ativo',
      'InventarioFisico',
      'ManutencaoAtivo'
    ],
    responsibilities: [
      'Catálogo de produtos e variantes',
      'Movimentos de stock e inventários físicos',
      'Gestão de ativos fixos e manutenção preventiva'
    ],
    dashboardPath: '/inventario',
    icon: Factory,
    accentColor: 'bg-amber-500'
  },
  {
    id: 'finance-accounting',
    title: 'Finanças & Contabilidade',
    description: 'Plano de contas, lançamentos e integrações com vendas/procurement.',
    springModule: 'finance-accounting-module',
    typescriptModels: [
      'PlanoContas',
      'LancamentoContabil',
      'ReconciliacaoBancaria',
      'ContaBancaria',
      'DRE',
      'Balancete'
    ],
    responsibilities: [
      'Plano de contas e centros de custo',
      'Lançamentos e reconciliações bancárias',
      'Relatórios DRE, Balancete e automações contábeis'
    ],
    dashboardPath: '/contabilidade',
    icon: Landmark,
    accentColor: 'bg-indigo-600'
  },
  {
    id: 'sales-pos',
    title: 'Vendas & POS',
    description: 'Fluxos POS, pedidos, validação de stock e comissões.',
    springModule: 'sales-pos-module',
    typescriptModels: [
      'Pedido',
      'ItemPedido',
      'Venda',
      'ComissaoVendedor',
      'ValidacaoStock',
      'MetodoPagamento'
    ],
    responsibilities: [
      'Gestão de pedidos, vendas e POS',
      'Cálculo de comissões por vendedor',
      'Políticas de validação e reserva de stock'
    ],
    dashboardPath: '/vendas/dashboard',
    icon: ShoppingCart,
    accentColor: 'bg-rose-500'
  },
  {
    id: 'projects',
    title: 'Projectos',
    description: 'Portefólio de projectos, equipas, orçamentos e milestones.',
    springModule: 'projects-module',
    typescriptModels: [
      'Projeto',
      'Tarefa',
      'RegistroTempo',
      'OrcamentoProjeto',
      'DocumentoProjeto'
    ],
    responsibilities: [
      'Planeamento e execução de projectos',
      'Gestão de equipas, tarefas e tempos',
      'Orçamentos, documentos e relatórios de progresso'
    ],
    dashboardPath: '/projetos',
    icon: Briefcase,
    accentColor: 'bg-cyan-600'
  },
  {
    id: 'hr',
    title: 'Recursos Humanos & Payroll',
    description: 'Ciclo de vida do colaborador, ausências, formação e recrutamento.',
    springModule: 'hr-module',
    typescriptModels: [
      'Colaborador',
      'Ferias',
      'Payroll',
      'Avaliacao',
      'Formacao',
      'VagaEmprego'
    ],
    responsibilities: [
      'Gestão de colaboradores, férias e ausências',
      'Processamento salarial e benefícios',
      'Avaliações, formação e recrutamento'
    ],
    dashboardPath: '/rh',
    icon: UserCog,
    accentColor: 'bg-teal-600'
  },
  {
    id: 'services',
    title: 'Serviços & Agendamentos',
    description: 'Serviços, contratos, agendamentos e pacotes recorrentes.',
    springModule: 'services-module',
    typescriptModels: [
      'Servico',
      'AgendamentoServico',
      'ContratoServico',
      'PacoteServico',
      'DashboardServicos'
    ],
    responsibilities: [
      'Catálogo de serviços e pacotes',
      'Agendamentos e despacho de equipas',
      'Contratos, SLAs e dashboards de desempenho'
    ],
    dashboardPath: '/servicos',
    icon: Wrench,
    accentColor: 'bg-orange-500'
  },
  {
    id: 'support-tickets',
    title: 'Suporte & Tickets',
    description: 'Helpdesk omnicanal com SLAs, equipas e base de conhecimento.',
    springModule: 'support-tickets-module',
    typescriptModels: [
      'Ticket',
      'AnexoTicket',
      'EquipeSuporte',
      'BaseConhecimento',
      'DashboardTickets'
    ],
    responsibilities: [
      'Gestão de tickets, prioridades e SLAs',
      'Equipas de suporte e base de conhecimento',
      'Dashboards e KPIs de atendimento'
    ],
    dashboardPath: '/tickets',
    icon: Ticket,
    accentColor: 'bg-fuchsia-600'
  },
  {
    id: 'transport-logistics',
    title: 'Transporte & Logística',
    description: 'Frota, rotas, entregas e manutenção de veículos.',
    springModule: 'transport-logistics-module',
    typescriptModels: [
      'Veiculo',
      'Rota',
      'Entrega',
      'Abastecimento',
      'Manutencao'
    ],
    responsibilities: [
      'Gestão de frota, motoristas e rotas',
      'Planeamento de entregas e tracking',
      'Manutenção preventiva e abastecimentos'
    ],
    dashboardPath: '/transporte',
    icon: Truck,
    accentColor: 'bg-slate-600'
  },
  {
    id: 'analytics',
    title: 'Analytics',
    description: 'Projecção de dashboards e relatórios consumindo eventos de todos os módulos.',
    springModule: 'analytics-module',
    typescriptModels: ['Dashboard*', 'Relatorio*'],
    responsibilities: [
      'Ingestão de eventos e métricas de todos os módulos',
      'Construção de dashboards e relatórios executivos',
      'Alertas e insights pró-ativos sobre o negócio'
    ],
    dashboardPath: '/analytics',
    icon: LineChart,
    accentColor: 'bg-pink-600'
  }
];

export const getSystemModuleById = (id: string) =>
  SYSTEM_MODULES.find((module) => module.id === id);
