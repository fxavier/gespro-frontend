
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Building,
  FileText,
  Receipt,
  BarChart3,
  Settings,
  ChevronDown,
  ChevronRight,
  DollarSign,
  ArrowRightLeft,
  Minus,
  RotateCcw,
  RefreshCw,
  Calculator,
  TrendingUp,
  FileBarChart,
  Cog,
  Store,
  CreditCard,
  Archive,
  UserCheck,
  Truck,
  Wrench,
  Briefcase,
  ShoppingBag,
  ClipboardList,
  FileCheck,
  BookOpen,
  PieChart,
  Landmark,
  ChevronLeft,
  Menu,
  FileMinus,
  BookMarked,
  Layers,
  PackageOpen,
  PackagePlus,
  MapPin,
  Fuel,
  User,
  UserX,
  FolderKanban,
  CheckSquare,
  Clock,
  GanttChart,
  Wallet,
  Paperclip,
  FileSpreadsheet,
  Ticket,
  Inbox,
  UserCircle,
  AlertCircle,
  CheckCircle,
  FolderOpen,
  BookText,
  MessageSquare,
  UserCog,
  Calendar,
  Award,
  GraduationCap,
  Heart,
  Target,
  Factory,
  Component,
  Route,
  Calculator as CalcIcon,
  Gauge,
  ShieldCheck,
  FileBarChart2
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface MenuItem {
  title: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  children?: MenuItem[];
}

const menuItems: MenuItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'POS',
    href: '/pos',
    icon: ShoppingCart,
    badge: 'Novo'
  },
  {
    title: 'Vendas',
    icon: TrendingUp,
    children: [
      { title: 'Dashboard', href: '/vendas', icon: LayoutDashboard },
      { title: 'Pedidos', href: '/vendas/pedidos', icon: ShoppingCart, badge: 'Novo' },
      { title: 'Vendedores', href: '/vendas/vendedores', icon: Users, badge: 'Novo' },
      { title: 'Comissões', href: '/vendas/comissoes', icon: DollarSign, badge: 'Novo' },
      { title: 'Histórico de Vendas', href: '/vendas/historico', icon: TrendingUp },
      { title: 'Devoluções', href: '/vendas/devolucoes', icon: RotateCcw },
      { title: 'Trocas', href: '/vendas/trocas', icon: RefreshCw }
    ]
  },
  {
    title: 'Compras',
    icon: ShoppingBag,
    children: [
      { title: 'Dashboard', href: '/compras', icon: LayoutDashboard },
      { title: 'Pedidos de Compra', href: '/compras/pedidos', icon: ShoppingCart },
      { title: 'Ordens de Compra', href: '/compras/ordens', icon: FileCheck }
    ]
  },
  {
    title: 'Stock',
    icon: Package,
    badge: 'Novo',
    children: [
      { title: 'Dashboard', href: '/stock', icon: LayoutDashboard },
      { title: 'Produtos', href: '/produtos', icon: Package },
      { title: 'Movimentação', href: '/stock/movimentacao', icon: PackageOpen },
      { title: 'Reposição', href: '/stock/reposicao', icon: PackagePlus }
    ]
  },
  {
    title: 'Clientes',
    icon: Users,
    children: [
      { title: 'Dashboard', href: '/clientes', icon: LayoutDashboard },
      { title: 'Lista de Clientes', href: '/clientes/lista', icon: Users }
    ]
  },
  {
    title: 'Fornecedores',
    icon: Building,
    children: [
      { title: 'Dashboard', href: '/fornecedores', icon: LayoutDashboard },
      { title: 'Lista de Fornecedores', href: '/fornecedores/lista', icon: Building },
      { title: 'Contas a Pagar', href: '/fornecedores/contas-pagar', icon: CreditCard }
    ]
  },
  {
    title: 'Procurement',
    icon: ShoppingBag,
    badge: 'Novo',
    children: [
      { title: 'Dashboard', href: '/procurement', icon: LayoutDashboard },
      { title: 'Requisições de Compra', href: '/procurement/requisicoes', icon: ClipboardList },
      { title: 'Cotações', href: '/procurement/cotacoes', icon: FileText },
      { title: 'Pedidos de Compra', href: '/procurement/pedidos', icon: FileCheck },
      { title: 'Recebimentos', href: '/procurement/recebimentos', icon: Truck },
      { title: 'Aprovações', href: '/procurement/aprovacoes', icon: UserCheck }
    ]
  },
  {
    title: 'Faturação',
    icon: FileText,
    children: [
      { title: 'Dashboard', href: '/faturacao/dashboard', icon: LayoutDashboard },
      { title: 'Faturas', href: '/faturacao', icon: Receipt },
      { title: 'Nova Fatura', href: '/faturacao/nova', icon: FileText },
      { title: 'Nota de Crédito', href: '/faturacao/nota-credito', icon: FileMinus },
      { title: 'Cotações', href: '/faturacao/cotacoes', icon: FileText },
      { title: 'Fatura Proforma', href: '/faturacao/proforma', icon: FileBarChart }
    ]
  },
  {
    title: 'Inventário',
    icon: Archive,
    badge: 'Novo',
    children: [
      { title: 'Dashboard', href: '/inventario', icon: LayoutDashboard },
      { title: 'Ativos', href: '/inventario/ativos', icon: Package, badge: 'Novo' },
      { title: 'Localizações', href: '/inventario/localizacoes', icon: MapPin, badge: 'Novo' },
      { title: 'Movimentações', href: '/inventario/movimentacoes', icon: ArrowRightLeft, badge: 'Novo' },
      { title: 'Categorias', href: '/inventario/categorias', icon: Layers, badge: 'Novo' },
      { title: 'Manutenção', href: '/inventario/manutencao', icon: Wrench, badge: 'Novo' },
      { title: 'Amortização', href: '/inventario/amortizacao', icon: Calculator, badge: 'Novo' },
      { title: 'Inventário Físico', href: '/inventario/fisico', icon: ClipboardList, badge: 'Novo' },
      { title: 'Relatórios', href: '/inventario/relatorios', icon: FileSpreadsheet, badge: 'Novo' },
      { title: 'Abate de Stock', href: '/inventario/abate', icon: Minus },
      { title: 'Transferências', href: '/inventario/transferencias', icon: ArrowRightLeft },
      { title: 'Reconciliação', href: '/inventario/reconciliacao', icon: RefreshCw }
    ]
  },
  {
    title: 'Transporte',
    icon: Truck,
    badge: 'Novo',
    children: [
      { title: 'Dashboard', href: '/transporte', icon: LayoutDashboard },
      { title: 'Veículos', href: '/transporte/veiculos', icon: Truck },
      { title: 'Motoristas', href: '/transporte/motoristas', icon: User },
      { title: 'Rotas', href: '/transporte/rotas', icon: MapPin },
      { title: 'Entregas', href: '/transporte/entregas', icon: Package },
      { title: 'Manutenção', href: '/transporte/manutencao', icon: Wrench },
      { title: 'Combustível', href: '/transporte/combustivel', icon: Fuel }
    ]
  },
  {
    title: 'Gestão de Projetos',
    icon: FolderKanban,
    badge: 'Novo',
    children: [
      { title: 'Dashboard', href: '/projetos', icon: LayoutDashboard },
      { title: 'Projetos', href: '/projetos/lista', icon: FolderKanban },
      { title: 'Tarefas', href: '/projetos/tarefas', icon: CheckSquare },
      { title: 'Equipes', href: '/projetos/equipes', icon: Users },
      { title: 'Timesheet', href: '/projetos/timesheet', icon: Clock },
      { title: 'Cronograma', href: '/projetos/cronograma', icon: GanttChart },
      { title: 'Orçamentos', href: '/projetos/orcamentos', icon: Wallet },
      { title: 'Documentos', href: '/projetos/documentos', icon: Paperclip },
      { title: 'Relatórios', href: '/projetos/relatorios', icon: FileSpreadsheet }
    ]
  },
  {
    title: 'Gestão de Tickets',
    icon: Ticket,
    badge: 'Novo',
    children: [
      { title: 'Dashboard', href: '/tickets', icon: LayoutDashboard },
      { title: 'Todos os Tickets', href: '/tickets/lista', icon: Ticket },
      { title: 'Caixa de Entrada', href: '/tickets/caixa-entrada', icon: Inbox },
      { title: 'Atribuídos a Mim', href: '/tickets/meus', icon: UserCircle },
      { title: 'Urgentes', href: '/tickets/urgentes', icon: AlertCircle },
      { title: 'Resolvidos', href: '/tickets/resolvidos', icon: CheckCircle },
      { title: 'Categorias', href: '/tickets/categorias', icon: FolderOpen },
      { title: 'Base de Conhecimento', href: '/tickets/base-conhecimento', icon: BookText },
      { title: 'Relatórios', href: '/tickets/relatorios', icon: FileSpreadsheet }
    ]
  },
  {
    title: 'Recursos Humanos',
    icon: UserCog,
    badge: 'Novo',
    children: [
      { title: 'Dashboard', href: '/rh', icon: LayoutDashboard },
      { title: 'Colaboradores', href: '/rh/colaboradores', icon: Users },
      { title: 'Payroll', href: '/rh/payroll', icon: DollarSign },
      { title: 'Plano de Férias', href: '/rh/ferias', icon: Calendar },
      { title: 'Ausências', href: '/rh/ausencias', icon: UserX },
      { title: 'Assiduidade', href: '/rh/assiduidade', icon: Clock },
      { title: 'Avaliações', href: '/rh/avaliacoes', icon: Award },
      { title: 'Formações', href: '/rh/formacoes', icon: GraduationCap },
      { title: 'Benefícios', href: '/rh/beneficios', icon: Heart },
      { title: 'Recrutamento', href: '/rh/recrutamento', icon: Target },
      { title: 'Documentos', href: '/rh/documentos', icon: FileText }
    ]
  },
  {
    title: 'Produção',
    icon: Factory,
    badge: 'Novo',
    children: [
      { title: 'Dashboard', href: '/producao', icon: LayoutDashboard },
      { title: 'Estrutura de Produto (BOM)', href: '/producao/estrutura', icon: Component },
      { title: 'Roteiros de Produção', href: '/producao/roteiros', icon: Route },
      { title: 'Ordens de Produção', href: '/producao/ordens', icon: ClipboardList },
      { title: 'Planeamento (MRP)', href: '/producao/planeamento', icon: CalcIcon },
      { title: 'Capacidade (CRP)', href: '/producao/capacidade', icon: Gauge },
      { title: 'Mão de Obra', href: '/producao/mao-obra', icon: Users },
      { title: 'Custos de Produção', href: '/producao/custos', icon: DollarSign },
      { title: 'Qualidade', href: '/producao/qualidade', icon: ShieldCheck },
      { title: 'Relatórios', href: '/producao/relatorios', icon: FileBarChart2 }
    ]
  },
  {
    title: 'Contabilidade',
    icon: BookOpen,
    badge: 'Novo',
    children: [
      { title: 'Dashboard', href: '/contabilidade', icon: LayoutDashboard },
      { title: 'Plano de Contas', href: '/contabilidade/plano-contas', icon: BookOpen },
      { title: 'Diários', href: '/contabilidade/diarios', icon: BookMarked },
      { title: 'Razão Geral', href: '/contabilidade/razao-geral', icon: Layers },
      { title: 'Lançamentos', href: '/contabilidade/lancamentos', icon: FileText },
      { title: 'Centros de Custo', href: '/contabilidade/centros-custo', icon: PieChart },
      { title: 'Reconciliação Bancária', href: '/contabilidade/reconciliacao', icon: Landmark },
      { title: 'DRE', href: '/contabilidade/dre', icon: BarChart3 },
      { title: 'Balancete', href: '/contabilidade/balancete', icon: FileBarChart },
      { title: 'Configurações', href: '/contabilidade/configuracoes', icon: Cog }
    ]
  },
  {
    title: 'Caixa',
    icon: DollarSign,
    children: [
      { title: 'Gestão de Caixa', href: '/caixa', icon: DollarSign },
      { title: 'Abertura de Caixa', href: '/caixa/abertura', icon: Calculator },
      { title: 'Fechamento de Caixa', href: '/caixa/fechamento', icon: CreditCard }
    ]
  },
  {
    title: 'Serviços',
    icon: Wrench,
    children: [
      { title: 'Lista de Serviços', href: '/servicos', icon: Wrench },
      { title: 'Categorias', href: '/servicos/categorias', icon: Layers },
      { title: 'Novo Serviço', href: '/servicos/novo', icon: FileText }
    ]
  },
  {
    title: 'Relatórios',
    href: '/relatorios',
    icon: BarChart3,
  },
  {
    title: 'Configurações',
    href: '/configuracoes',
    icon: Settings,
  }
];

export default function Sidebar() {
  const pathname = usePathname();
  const [expandedItems, setExpandedItems] = useState<string[]>(['Gestão']);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleExpanded = (title: string) => {
    if (isCollapsed) return;
    setExpandedItems(prev => 
      prev.includes(title) 
        ? prev.filter(item => item !== title)
        : [...prev, title]
    );
  };

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard' || pathname === '/';
    }
    return pathname.startsWith(href);
  };

  const isParentActive = (children: MenuItem[]) => {
    return children.some(child => child.href && isActive(child.href));
  };

  const renderMenuItem = (item: MenuItem, level = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.includes(item.title);
    const isItemActive = item.href ? isActive(item.href) : false;
    const isParentItemActive = hasChildren ? isParentActive(item.children!) : false;

    if (hasChildren) {
      if (isCollapsed) {
        return (
          <TooltipProvider key={item.title}>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    'w-full justify-center h-12 px-0 hover:bg-[#1877F2] hover:text-white transition-colors',
                    isParentItemActive && 'bg-[#1877F2]/20'
                  )}
                  onClick={() => toggleExpanded(item.title)}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="flex flex-col gap-1">
                <p className="font-semibold">{item.title}</p>
                {item.children!.map(child => (
                  <Link
                    key={child.title}
                    href={child.href!}
                    className="text-sm hover:underline"
                  >
                    {child.title}
                  </Link>
                ))}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }

      return (
        <div key={item.title}>
          <Button
            variant="ghost"
            className={cn(
              'w-full justify-start h-10 px-3 hover:bg-[#1877F2] hover:text-white transition-colors group',
              level > 0 && 'ml-4 w-[calc(100%-1rem)]',
              (isParentItemActive || isExpanded) && 'bg-[#1877F2]/20'
            )}
            onClick={() => toggleExpanded(item.title)}
          >
            <item.icon className="mr-3 h-4 w-4 flex-shrink-0" />
            <span className="flex-1 text-left truncate">{item.title}</span>
            {item.badge && (
              <Badge variant="secondary" className="ml-2 text-xs bg-[#1877F2]/30 border-0 group-hover:bg-white/20 flex-shrink-0">
                {item.badge}
              </Badge>
            )}
            {isExpanded ? (
              <ChevronDown className="ml-2 h-4 w-4 flex-shrink-0" />
            ) : (
              <ChevronRight className="ml-2 h-4 w-4 flex-shrink-0" />
            )}
          </Button>
          
          {isExpanded && (
            <div className="mt-1 space-y-1">
              {item.children!.map(child => renderMenuItem(child, level + 1))}
            </div>
          )}
        </div>
      );
    }

    if (isCollapsed) {
      return (
        <TooltipProvider key={item.title}>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  'w-full justify-center h-12 px-0 hover:bg-[#1877F2] hover:text-white transition-colors',
                  isItemActive && 'bg-[#1877F2]/20 font-medium'
                )}
                asChild
              >
                <Link href={item.href!}>
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>{item.title}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <Button
        key={item.title}
        variant="ghost"
        className={cn(
          'w-full justify-start h-10 px-3 hover:bg-[#1877F2] hover:text-white transition-colors group',
          level > 0 && 'ml-4 w-[calc(100%-1rem)]',
          isItemActive && 'bg-[#1877F2]/20 font-medium'
        )}
        asChild
      >
        <Link href={item.href!}>
          <item.icon className="mr-3 h-4 w-4 flex-shrink-0" />
          <span className="flex-1 text-left truncate">{item.title}</span>
          {item.badge && (
            <Badge variant="secondary" className="ml-2 text-xs bg-[#1877F2]/30 border-0 group-hover:bg-white/20 flex-shrink-0">
              {item.badge}
            </Badge>
          )}
        </Link>
      </Button>
    );
  };

  return (
    <div 
      className={cn(
        'flex h-full flex-col border-r border-border/50 backdrop-blur-md bg-background/30 transition-all duration-300',
        isCollapsed ? 'w-16' : 'w-72'
      )}
    >
      <div className="flex h-16 items-center border-b border-border/50 px-3 justify-between">
        {!isCollapsed && (
          <Link href="/dashboard" className="flex items-center space-x-2">
            <Store className="h-6 w-6" />
            <span className="text-lg font-semibold">Sistema ERP</span>
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hover:bg-[#1877F2] hover:text-white transition-colors"
        >
          {isCollapsed ? (
            <Menu className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2 py-4">
        <nav className="space-y-1">
          {menuItems.map(item => renderMenuItem(item))}
        </nav>
      </ScrollArea>

      {!isCollapsed && (
        <div className="border-t border-border/50 p-4">
          <div className="text-xs text-muted-foreground text-center">
            <p>Sistema ERP v1.0</p>
            <p>© 2024 Todos os direitos reservados</p>
          </div>
        </div>
      )}
    </div>
  );
}
