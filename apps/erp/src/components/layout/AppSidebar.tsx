'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, ShoppingCart, Package, Users, Building, Building2,
  FileText, Receipt, BarChart3, ChevronDown, ChevronRight, DollarSign,
  ArrowRightLeft, Store, Archive, Truck, Wrench, Briefcase,
  ClipboardList, FileCheck, BookOpen, Landmark,
  BookText, Tag, MapPin, Fuel, User, FolderKanban, CheckSquare,
  Clock, Wallet, Ticket, UserCog, Calendar,
  Award, GraduationCap, Factory, FileBarChart2, PackageSearch, LineChart,
  RotateCcw, AlertCircle, BookMarked as JournalIcon, CreditCard,
  PanelLeftClose, PanelLeftOpen, Settings, PercentCircle,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Logotipo, Simbolo } from './Logotipo';
import { COOKIE_BARRA_LATERAL, VALOR_RECOLHIDA } from '@/lib/barra-lateral';

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
      { title: 'Exercícios', href: '/contabilidade/exercicios', icon: Calendar },
      { title: 'Apuramento de IVA', href: '/contabilidade/iva', icon: PercentCircle },
      { title: 'Faturação', href: '/faturacao/dashboard', icon: Receipt },
      { title: 'Caixa', href: '/caixa', icon: Wallet },
      { title: 'Tesouraria', href: '/tesouraria', icon: LineChart },
      { title: 'Compromissos', href: '/tesouraria/compromissos', icon: ClipboardList },
      { title: 'Configurações', href: '/contabilidade/configuracoes', icon: Settings },
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
      // Spec 19 — subscrição SaaS (plano, trial, Checkout/Portal).
      {
        title: 'Subscrição',
        href: '/definicoes/faturacao',
        icon: CreditCard,
        permission: 'assinatura:ver',
      },
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

const CLASSES_ITEM =
  'w-full justify-start h-9 px-2.5 rounded-lg font-normal hover:bg-sidebar-foreground/10 hover:text-sidebar-primary transition-colors group';
const CLASSES_ITEM_CARRIL =
  'w-full justify-center h-10 px-0 rounded-lg hover:bg-sidebar-foreground/10 hover:text-sidebar-primary transition-colors';
const CLASSES_ACTIVO = 'bg-sidebar-accent text-sidebar-accent-foreground font-medium';

function SidebarContent({
  isCollapsed,
  userPermissions,
  onToggle,
}: {
  isCollapsed: boolean;
  userPermissions: string[];
  onToggle: () => void;
}) {
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
        // Menu flutuante ao clicar: funciona com rato, toque e teclado — o
        // tooltip com ligações que aqui estava só respondia ao rato.
        return (
          <DropdownMenu key={item.title}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={cn(CLASSES_ITEM_CARRIL, isParentItemActive && CLASSES_ACTIVO)}
                aria-label={item.title}
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" sideOffset={8} className="w-56">
              <DropdownMenuLabel>{item.title}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {item.children!.map((child) => (
                <DropdownMenuItem
                  key={child.title}
                  asChild
                  className={cn(child.href && isActive(child.href) && 'bg-accent text-primary')}
                >
                  <Link href={child.href!}>
                    <child.icon className="mr-2 h-4 w-4" aria-hidden="true" />
                    {child.title}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      }

      return (
        <div key={item.title}>
          <Button
            variant="ghost"
            className={cn(
              CLASSES_ITEM,
              level > 0 && 'ml-3 w-[calc(100%-0.75rem)]',
              (isParentItemActive || isExpanded) && 'text-sidebar-primary font-medium'
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
                className={cn(CLASSES_ITEM_CARRIL, isItemActive && CLASSES_ACTIVO)}
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
          CLASSES_ITEM,
          level > 0 && 'ml-3 w-[calc(100%-0.75rem)]',
          isItemActive && CLASSES_ACTIVO
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
          {isItemActive && (
            <span className="ml-auto size-1.5 rounded-full bg-sidebar-accent-foreground" aria-hidden="true" />
          )}
        </Link>
      </Button>
    );
  };

  const rotuloToggle = isCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral';

  return (
    <>
      {/* Logótipo + botão de recolher, no topo — onde toda a gente o procura */}
      <div
        className={cn(
          'flex flex-shrink-0 items-center border-b border-sidebar-border',
          isCollapsed ? 'h-auto flex-col gap-1 px-2 py-2' : 'h-14 justify-between px-3'
        )}
      >
        <Link
          href="/dashboard"
          className="rounded-md hover:opacity-80 transition-opacity"
          aria-label="GestPro ERP — Início"
        >
          {isCollapsed ? <Simbolo invertido /> : <Logotipo invertido />}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg text-sidebar-foreground hover:bg-sidebar-foreground/10 hover:text-sidebar-primary transition-colors"
          onClick={onToggle}
          aria-label={rotuloToggle}
          title={`${rotuloToggle} (⌘B)`}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </div>

      {/* Navegação */}
      <ScrollArea className="flex-1">
        <nav
          className="px-2 py-3 space-y-0.5"
          aria-label="Navegação principal"
        >
          {!isCollapsed && (
            <p className="px-2.5 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground">
              Módulos
            </p>
          )}
          {items.map((item) => renderMenuItem(item))}
        </nav>
      </ScrollArea>

      {/* Rodapé */}
      {!isCollapsed && (
        <div className="px-3 py-3 flex-shrink-0">
          <div className="flex items-center justify-between rounded-xl bg-sidebar-foreground/10 px-3 py-2">
            <span className="flex items-center gap-2 text-[11px] text-sidebar-foreground">
              <span className="size-2 rounded-full bg-sidebar-primary" aria-hidden="true" />
              Ligado ao GestPro
            </span>
            <span className="text-[11px] font-semibold text-sidebar-primary">v1.0</span>
          </div>
        </div>
      )}
    </>
  );
}

function escreverCookie(recolhida: boolean) {
  document.cookie = `${COOKIE_BARRA_LATERAL}=${recolhida ? VALOR_RECOLHIDA : 'expandida'}; path=/; max-age=31536000; SameSite=Lax`;
}

/**
 * Sidebar principal da aplicação — nunca desaparece por completo.
 *
 * Dois estados, em qualquer largura de ecrã: expandida (256px) ou recolhida
 * num carril de ícones (56px). Em ecrãs estreitos (< md) a barra expandida
 * abre POR CIMA do conteúdo, com um véu que a recolhe ao toque; o carril
 * continua no fluxo, por isso o conteúdo nunca fica sem os 56px. O painel
 * deslizante e o hambúrguer que existiam para o telemóvel saíram.
 *
 * O estado persiste num cookie lido pelos layouts (Server Components), que
 * passam `defaultCollapsed` — a página já nasce no estado certo, sem salto.
 *
 * @param userPermissions Lista de permissões do utilizador (session.user.permissions).
 *   Itens sem campo `permission` são sempre visíveis (ex.: Dashboard).
 */
const CONSULTA_ESTREITO = '(max-width: 767px)';

function subscreverEstreito(aoMudar: () => void) {
  const consulta = window.matchMedia(CONSULTA_ESTREITO);
  consulta.addEventListener('change', aoMudar);
  return () => consulta.removeEventListener('change', aoMudar);
}

/** `true` abaixo de md; `false` no servidor e na hidratação (sem salto). */
function useEstreito(): boolean {
  return useSyncExternalStore(
    subscreverEstreito,
    () => window.matchMedia(CONSULTA_ESTREITO).matches,
    () => false
  );
}

export function AppSidebar({
  userPermissions = [],
  defaultCollapsed = false,
}: {
  userPermissions?: string[];
  defaultCollapsed?: boolean;
}) {
  const estreito = useEstreito();
  // Preferência do desktop (persistida) e abertura temporária no ecrã estreito
  // (nunca persistida): em estreito a barra começa sempre recolhida, senão a
  // preferência «expandida» abria o véu logo ao carregar.
  const [preferenciaRecolhida, setPreferenciaRecolhida] = useState(defaultCollapsed);
  const [abertaEmEstreito, setAbertaEmEstreito] = useState(false);
  const isCollapsed = estreito ? !abertaEmEstreito : preferenciaRecolhida;

  const toggle = () => {
    if (estreito) {
      setAbertaEmEstreito((v) => !v);
      return;
    }
    setPreferenciaRecolhida((v) => {
      escreverCookie(!v);
      return !v;
    });
  };

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        if (estreito) {
          setAbertaEmEstreito((v) => !v);
        } else {
          setPreferenciaRecolhida((v) => {
            escreverCookie(!v);
            return !v;
          });
        }
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [estreito]);

  return (
    <>
      <aside
        className={cn(
          'flex h-screen flex-shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-in-out',
          isCollapsed ? 'w-14' : 'w-64',
          // Ecrã estreito: a barra expandida sobrepõe-se ao conteúdo.
          !isCollapsed && 'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:shadow-xl'
        )}
      >
        <SidebarContent
          isCollapsed={isCollapsed}
          userPermissions={userPermissions}
          onToggle={toggle}
        />
      </aside>

      {!isCollapsed && (
        <>
          {/* Mantém os 56px do carril no fluxo enquanto a barra flutua por cima. */}
          <div className="w-14 flex-shrink-0 md:hidden" aria-hidden="true" />
          <button
            type="button"
            className="fixed inset-0 z-30 bg-foreground/30 md:hidden"
            aria-label="Recolher barra lateral"
            onClick={toggle}
          />
        </>
      )}
    </>
  );
}
