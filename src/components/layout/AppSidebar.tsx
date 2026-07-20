'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, ShoppingCart, Package, Users, Building, Building2,
  FileText, Receipt, BarChart3, ChevronDown, ChevronRight, DollarSign,
  ArrowRightLeft, Cog, Store, Archive, UserCheck, Truck, Wrench, Briefcase,
  ClipboardList, FileCheck, BookOpen, PieChart, Landmark, FileMinus,
  BookMarked, Layers, Tag, MapPin, Fuel, User, FolderKanban, CheckSquare,
  Clock, Wallet, FileSpreadsheet, Ticket, BookText, UserCog, Calendar,
  Award, GraduationCap, Heart, Target, Factory, Route, Gauge, ShieldCheck,
  FileBarChart2, PackageSearch, History, LineChart, RotateCcw, AlertCircle,
  Menu, X, Component, BookMarked as JournalIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Sheet, SheetContent } from '@/components/ui/sheet';

interface MenuItem {
  title: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  children?: MenuItem[];
  permission?: string;
}

/**
 * 7 domínios do spec 02, alinhados com os workstreams A–G.
 */
const menuItems: MenuItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  // WS B — Compras & Fornecedores
  {
    title: 'Compras & Procurement',
    icon: PackageSearch,
    children: [
      { title: 'Requisições', href: '/compras/requisicoes', icon: ClipboardList, permission: 'compras:requisicao:ver' },
      { title: 'Cotações (RFQ)', href: '/compras/cotacoes', icon: FileText, permission: 'compras:cotacao:ver' },
      { title: 'Pedidos de Compra', href: '/compras/pedidos', icon: FileCheck, permission: 'compras:pedido:ver' },
    ],
  },
  {
    title: 'Fornecedores',
    icon: Building,
    children: [
      { title: 'Lista de Fornecedores', href: '/fornecedores', icon: Building },
      { title: 'Contas a Pagar', href: '/fornecedores/contas-pagar', icon: Wallet },
      { title: 'Serviços', href: '/servicos/lista', icon: Wrench },
      { title: 'Agendamentos', href: '/servicos/agendamentos', icon: Calendar },
      { title: 'Contratos', href: '/servicos/contratos', icon: FileText },
    ],
  },
  // WS A — Inventário
  {
    title: 'Inventário & Activos',
    icon: Factory,
    children: [
      { title: 'Dashboard', href: '/inventario', icon: LayoutDashboard },
      { title: 'Produtos', href: '/produtos', icon: Package },
      { title: 'Categorias', href: '/inventario/categorias', icon: Tag },
      { title: 'Activos', href: '/inventario/ativos', icon: Archive },
      { title: 'Movimentações', href: '/inventario/movimentacoes', icon: ArrowRightLeft },
      { title: 'Inventário Físico', href: '/inventario/fisico', icon: ClipboardList },
      { title: 'Manutenção', href: '/inventario/manutencao', icon: Wrench },
    ],
  },
  // WS C — Comercial
  {
    title: 'Vendas & POS',
    icon: ShoppingCart,
    children: [
      { title: 'Dashboard', href: '/vendas/dashboard', icon: LayoutDashboard },
      { title: 'Pedidos', href: '/vendas/pedidos', icon: ShoppingCart },
      { title: 'POS', href: '/pos', icon: Store },
      { title: 'Faturas', href: '/vendas/faturas', icon: Receipt },
      { title: 'Notas de Crédito', href: '/vendas/notas-credito', icon: RotateCcw },
      { title: 'Clientes', href: '/clientes', icon: Users },
    ],
  },
  // WS D — Finanças
  {
    title: 'Finanças & Contabilidade',
    icon: Landmark,
    children: [
      { title: 'Dashboard', href: '/contabilidade', icon: LayoutDashboard },
      { title: 'Plano de Contas', href: '/contabilidade/plano-contas', icon: BookOpen },
      { title: 'Diários', href: '/contabilidade/diarios', icon: JournalIcon },
      { title: 'Lançamentos', href: '/contabilidade/lancamentos', icon: FileText },
      { title: 'Razão Geral', href: '/contabilidade/razao-geral', icon: BookText },
      { title: 'Balancete', href: '/contabilidade/balancete', icon: FileBarChart2 },
      { title: 'Reconciliação', href: '/contabilidade/reconciliacao', icon: Landmark },
      { title: 'Faturação', href: '/faturacao/dashboard', icon: Receipt },
      { title: 'Caixa', href: '/caixa', icon: Wallet },
    ],
  },
  // WS E — Pessoas & Projectos
  {
    title: 'Recursos Humanos',
    icon: UserCog,
    children: [
      { title: 'Dashboard', href: '/rh', icon: LayoutDashboard },
      { title: 'Colaboradores', href: '/rh/colaboradores', icon: Users },
      { title: 'Assiduidade', href: '/rh/assiduidade', icon: Clock },
      { title: 'Ausências', href: '/rh/ausencias', icon: AlertCircle },
      { title: 'Avaliações', href: '/rh/avaliacoes', icon: Award },
      { title: 'Payroll', href: '/rh/payroll', icon: DollarSign },
      { title: 'Férias', href: '/rh/ferias', icon: Calendar },
      { title: 'Formações', href: '/rh/formacoes', icon: GraduationCap },
    ],
  },
  {
    title: 'Projectos',
    icon: Briefcase,
    children: [
      { title: 'Dashboard', href: '/projetos', icon: LayoutDashboard },
      { title: 'Projectos', href: '/projetos/lista', icon: FolderKanban },
      { title: 'Tarefas', href: '/projetos/tarefas', icon: CheckSquare },
      { title: 'Timesheet', href: '/projetos/timesheet', icon: Clock },
      { title: 'Produção', href: '/producao', icon: Factory },
    ],
  },
  // WS F — Operações
  {
    title: 'Transporte & Logística',
    icon: Truck,
    children: [
      { title: 'Dashboard', href: '/transporte', icon: LayoutDashboard },
      { title: 'Viaturas', href: '/transporte/veiculos', icon: Truck },
      { title: 'Motoristas', href: '/transporte/motoristas', icon: User },
      { title: 'Rotas', href: '/transporte/rotas', icon: MapPin },
      { title: 'Combustível', href: '/transporte/combustivel', icon: Fuel },
    ],
  },
  {
    title: 'Suporte & Tickets',
    icon: Ticket,
    children: [
      { title: 'Dashboard', href: '/tickets', icon: LayoutDashboard },
      { title: 'Tickets', href: '/tickets/lista', icon: Ticket },
      { title: 'Base de Conhecimento', href: '/tickets/base-conhecimento', icon: BookText },
    ],
  },
  // WS G — Plataforma
  {
    title: 'Plataforma & Analytics',
    icon: LineChart,
    children: [
      { title: 'Analytics', href: '/analytics', icon: BarChart3 },
      { title: 'Core Tenancy', href: '/core-tenancy', icon: Building2 },
    ],
  },
];

/** Filtra items por permissões — recursivo para grupos com filhos. */
function filtrarPorPermissoes(items: MenuItem[], permissions: string[]): MenuItem[] {
  return items
    .map((item) => {
      if (item.children) {
        const filhos = filtrarPorPermissoes(item.children, permissions);
        return filhos.length > 0 ? { ...item, children: filhos } : null;
      }
      if (!item.permission) return item;
      return permissions.includes(item.permission) ? item : null;
    })
    .filter(Boolean) as MenuItem[];
}

function SidebarContent({ isCollapsed, userPermissions }: { isCollapsed: boolean; userPermissions: string[] }) {
  const pathname = usePathname();
  const items = filtrarPorPermissoes(menuItems, userPermissions);

  const [expandedItems, setExpandedItems] = useState<Set<string>>(
    () => {
      // Expandir o grupo que contém a rota actual
      const active = new Set<string>();
      items.forEach((item) => {
        if (item.children?.some((child) => child.href && pathname.startsWith(child.href))) {
          active.add(item.title);
        }
      });
      return active;
    }
  );

  const toggleExpanded = (title: string) => {
    if (isCollapsed) return;
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  };

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard' || pathname === '/';
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  const isParentActive = (children: MenuItem[]) =>
    children.some((child) => child.href && isActive(child.href));

  const renderMenuItem = (item: MenuItem, level = 0) => {
    const hasChildren = !!item.children?.length;
    const isExpanded = expandedItems.has(item.title);
    const isItemActive = item.href ? isActive(item.href) : false;
    const isParentItemActive = hasChildren ? isParentActive(item.children!) : false;

    if (hasChildren) {
      if (isCollapsed) {
        return (
          <TooltipProvider key={item.title} delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    'w-full justify-center h-10 px-0 hover:bg-primary/10 hover:text-primary transition-colors',
                    isParentItemActive && 'bg-primary/10 text-primary'
                  )}
                >
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">{item.title}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="flex flex-col gap-1 p-3">
                <p className="font-semibold text-sm">{item.title}</p>
                {item.children!.map((child) => (
                  <Link
                    key={child.title}
                    href={child.href!}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
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
              'w-full justify-start h-9 px-3 hover:bg-primary/10 hover:text-primary transition-colors group',
              level > 0 && 'ml-3 w-[calc(100%-0.75rem)]',
              (isParentItemActive || isExpanded) && 'bg-primary/5 text-primary'
            )}
            onClick={() => toggleExpanded(item.title)}
            aria-expanded={isExpanded}
          >
            <item.icon className="mr-2.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-0 text-left truncate text-sm">{item.title}</span>
            {item.badge && (
              <Badge variant="secondary" className="ml-auto mr-1 text-[10px] h-4 px-1 flex-shrink-0">
                {item.badge}
              </Badge>
            )}
            {isExpanded ? (
              <ChevronDown className="ml-1 h-3.5 w-3.5 flex-shrink-0 opacity-60" />
            ) : (
              <ChevronRight className="ml-1 h-3.5 w-3.5 flex-shrink-0 opacity-60" />
            )}
          </Button>

          {isExpanded && (
            <div className="mt-0.5 space-y-0.5 pl-1">
              {item.children!.map((child) => renderMenuItem(child, level + 1))}
            </div>
          )}
        </div>
      );
    }

    if (isCollapsed) {
      return (
        <TooltipProvider key={item.title} delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  'w-full justify-center h-10 px-0 hover:bg-primary/10 hover:text-primary transition-colors',
                  isItemActive && 'bg-primary/10 text-primary font-medium'
                )}
                asChild
              >
                <Link href={item.href!}>
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">{item.title}</span>
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p className="text-sm">{item.title}</p>
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
          'w-full justify-start h-9 px-3 hover:bg-primary/10 hover:text-primary transition-colors group',
          level > 0 && 'ml-3 w-[calc(100%-0.75rem)]',
          isItemActive && 'bg-primary/10 text-primary font-medium'
        )}
        asChild
      >
        <Link href={item.href!}>
          <item.icon className="mr-2.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-0 text-left truncate text-sm">{item.title}</span>
          {item.badge && (
            <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1 flex-shrink-0">
              {item.badge}
            </Badge>
          )}
        </Link>
      </Button>
    );
  };

  return (
    <>
      {/* Logo */}
      <div
        className={cn(
          'flex h-14 items-center border-b px-3 flex-shrink-0',
          isCollapsed ? 'justify-center' : 'justify-between'
        )}
      >
        {!isCollapsed && (
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-semibold text-foreground hover:opacity-80 transition-opacity"
          >
            <Store className="h-5 w-5 text-primary" aria-hidden="true" />
            <span className="text-base">GestPro ERP</span>
          </Link>
        )}
        {isCollapsed && (
          <Link href="/dashboard" aria-label="GestPro ERP — Início">
            <Store className="h-5 w-5 text-primary" />
          </Link>
        )}
      </div>

      {/* Navegação */}
      <ScrollArea className="flex-1">
        <nav
          className="px-2 py-3 space-y-0.5"
          aria-label="Navegação principal"
        >
          {items.map((item) => renderMenuItem(item))}
        </nav>
      </ScrollArea>

      {/* Rodapé */}
      {!isCollapsed && (
        <div className="border-t px-3 py-3 flex-shrink-0">
          <p className="text-xs text-muted-foreground text-center">
            GestPro ERP v1.0
          </p>
        </div>
      )}
    </>
  );
}

/**
 * Sidebar principal da aplicação.
 * Desktop: sidebar colapsável. Mobile: off-canvas via Sheet.
 *
 * @param userPermissions Lista de permissões do utilizador (session.user.permissions).
 *   Itens sem campo `permission` são sempre visíveis (ex.: Dashboard).
 */
export function AppSidebar({ userPermissions = [] }: { userPermissions?: string[] }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col h-screen border-r bg-sidebar text-sidebar-foreground transition-all duration-200 ease-in-out flex-shrink-0',
          isCollapsed ? 'w-14' : 'w-64'
        )}
      >
        <SidebarContent isCollapsed={isCollapsed} userPermissions={userPermissions} />

        {/* Botão colapsar */}
        <div className={cn('border-t p-2', isCollapsed && 'flex justify-center')}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-primary/10 hover:text-primary transition-colors"
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4 rotate-90" />
            )}
          </Button>
        </div>
      </aside>

      {/* Mobile: botão hambúrguer (incluído no header) e Sheet */}
      <div className="md:hidden fixed top-0 left-0 z-40 flex items-center h-14 px-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0 flex flex-col bg-sidebar text-sidebar-foreground">
          <div className="absolute right-3 top-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setMobileOpen(false)}
              aria-label="Fechar menu"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <SidebarContent isCollapsed={false} userPermissions={userPermissions} />
        </SheetContent>
      </Sheet>
    </>
  );
}
