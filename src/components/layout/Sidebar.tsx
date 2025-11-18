
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
  Building2,
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
  FileBarChart2,
  PackageSearch,
  History,
  LineChart
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
    title: 'Core Tenancy & Shared Kernel',
    icon: Building2,
    children: [{ title: 'Dashboard', href: '/core-tenancy', icon: LayoutDashboard }]
  },
  {
    title: 'CRM – Clientes',
    icon: Users,
    children: [
      { title: 'Dashboard', href: '/clientes/dashboard', icon: LayoutDashboard },
      { title: 'Clientes', href: '/clientes', icon: Users },
      { title: 'Segmentação', href: '/clientes/segmentacao', icon: PieChart },
      { title: 'Relatórios', href: '/clientes/relatorios', icon: FileText }
    ]
  },
  {
    title: 'Fornecedores & Procurement',
    icon: PackageSearch,
    children: [
      { title: 'Dashboard Procurement', href: '/procurement', icon: LayoutDashboard },
      { title: 'Dashboard Fornecedores', href: '/fornecedores/dashboard', icon: LayoutDashboard },
      { title: 'Fornecedores', href: '/fornecedores', icon: Building },
      { title: 'Requisições', href: '/procurement/requisicoes', icon: ClipboardList },
      { title: 'Cotações', href: '/procurement/cotacoes', icon: FileText },
      { title: 'Pedidos de Compra', href: '/procurement/pedidos', icon: FileCheck }
    ]
  },
  {
    title: 'Inventário & Ativos',
    icon: Factory,
    children: [
      { title: 'Dashboard', href: '/inventario', icon: LayoutDashboard },
      { title: 'Produtos', href: '/produtos', icon: Package },
      { title: 'Ativos', href: '/inventario/ativos', icon: Archive },
      { title: 'Movimentações', href: '/inventario/movimentacoes', icon: ArrowRightLeft },
      { title: 'Inventário Físico', href: '/inventario/fisico', icon: ClipboardList },
      { title: 'Manutenção', href: '/inventario/manutencao', icon: Wrench }
    ]
  },
  {
    title: 'Finanças & Contabilidade',
    icon: Landmark,
    children: [
      { title: 'Dashboard', href: '/contabilidade', icon: LayoutDashboard },
      { title: 'Plano de Contas', href: '/contabilidade/plano-contas', icon: BookOpen },
      { title: 'Lançamentos', href: '/contabilidade/lancamentos', icon: FileText },
      { title: 'Reconciliação', href: '/contabilidade/reconciliacao', icon: Landmark },
      { title: 'Faturação', href: '/faturacao/dashboard', icon: Receipt },
      { title: 'Relatórios', href: '/contabilidade/dre', icon: BarChart3 }
    ]
  },
  {
    title: 'Vendas & POS',
    icon: ShoppingCart,
    children: [
      { title: 'Dashboard Vendas', href: '/vendas/dashboard', icon: LayoutDashboard },
      { title: 'Pedidos', href: '/vendas/pedidos', icon: ShoppingCart },
      { title: 'POS', href: '/pos', icon: Store },
      { title: 'Vendedores', href: '/vendas/vendedores', icon: Users },
      { title: 'Comissões', href: '/vendas/comissoes', icon: DollarSign },
      { title: 'Histórico', href: '/vendas/historico', icon: History },
      { title: 'Devoluções', href: '/vendas/devolucoes', icon: RotateCcw }
    ]
  },
  {
    title: 'Projectos',
    icon: Briefcase,
    children: [
      { title: 'Dashboard', href: '/projetos', icon: LayoutDashboard },
      { title: 'Projetos', href: '/projetos/lista', icon: FolderKanban },
      { title: 'Tarefas', href: '/projetos/tarefas', icon: CheckSquare },
      { title: 'Timesheet', href: '/projetos/timesheet', icon: Clock },
      { title: 'Relatórios', href: '/projetos/relatorios', icon: FileSpreadsheet }
    ]
  },
  {
    title: 'Recursos Humanos & Payroll',
    icon: UserCog,
    children: [
      { title: 'Dashboard', href: '/rh', icon: LayoutDashboard },
      { title: 'Colaboradores', href: '/rh/colaboradores', icon: Users },
      { title: 'Payroll', href: '/rh/payroll', icon: DollarSign },
      { title: 'Férias', href: '/rh/ferias', icon: Calendar },
      { title: 'Recrutamento', href: '/rh/recrutamento', icon: Target }
    ]
  },
  {
    title: 'Serviços & Agendamentos',
    icon: Wrench,
    children: [
      { title: 'Dashboard', href: '/servicos', icon: LayoutDashboard },
      { title: 'Lista de Serviços', href: '/servicos/lista', icon: Wrench },
      { title: 'Agendamentos', href: '/servicos/agendamentos', icon: Calendar },
      { title: 'Contratos', href: '/servicos/contratos', icon: FileText },
      { title: 'Pacotes', href: '/servicos/pacotes', icon: Layers }
    ]
  },
  {
    title: 'Suporte & Tickets',
    icon: Ticket,
    children: [
      { title: 'Dashboard', href: '/tickets', icon: LayoutDashboard },
      { title: 'Tickets', href: '/tickets/lista', icon: Ticket },
      { title: 'Base de Conhecimento', href: '/tickets/base-conhecimento', icon: BookText },
      { title: 'Relatórios', href: '/tickets/relatorios', icon: FileSpreadsheet }
    ]
  },
  {
    title: 'Transporte & Logística',
    icon: Truck,
    children: [
      { title: 'Dashboard', href: '/transporte', icon: LayoutDashboard },
      { title: 'Veículos', href: '/transporte/veiculos', icon: Truck },
      { title: 'Rotas', href: '/transporte/rotas', icon: MapPin },
      { title: 'Manutenção', href: '/transporte/manutencao', icon: Wrench }
    ]
  },
  {
    title: 'Analytics',
    icon: LineChart,
    children: [{ title: 'Dashboard', href: '/analytics', icon: LayoutDashboard }]
  },
  {
    title: 'Produção Industrial',
    icon: Factory,
    children: [
      { title: 'Dashboard', href: '/producao', icon: LayoutDashboard },
      { title: 'Ordens de Produção', href: '/producao/ordens', icon: ClipboardList },
      { title: 'Planeamento', href: '/producao/planeamento', icon: CalcIcon },
      { title: 'Qualidade', href: '/producao/qualidade', icon: ShieldCheck },
      { title: 'Relatórios', href: '/producao/relatorios', icon: FileBarChart2 }
    ]
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
