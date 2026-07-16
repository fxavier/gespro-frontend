'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Building,
  FileText,
  Receipt,
  BarChart3,
  ClipboardList,
  Landmark,
  Truck,
  UserCog,
  Ticket,
  Factory,
  Briefcase,
  Store,
  BookOpen,
  Wrench,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
}

const NAV_ITEMS: NavItem[] = [
  // Dashboard
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, group: 'Início' },

  // Compras
  { label: 'Requisições de Compra', href: '/compras/requisicoes', icon: ClipboardList, group: 'Compras' },
  { label: 'Cotações (RFQ)', href: '/compras/cotacoes', icon: FileText, group: 'Compras' },
  { label: 'Pedidos de Compra', href: '/compras/pedidos', icon: ShoppingCart, group: 'Compras' },
  { label: 'Fornecedores', href: '/fornecedores', icon: Building, group: 'Compras' },
  { label: 'Contas a Pagar', href: '/fornecedores/contas-pagar', icon: Receipt, group: 'Compras' },

  // Inventário
  { label: 'Produtos', href: '/produtos', icon: Package, group: 'Inventário' },
  { label: 'Inventário', href: '/inventario', icon: Factory, group: 'Inventário' },
  { label: 'Movimentações', href: '/inventario/movimentacoes', icon: BarChart3, group: 'Inventário' },

  // Vendas
  { label: 'POS — Ponto de Venda', href: '/pos', icon: Store, group: 'Vendas' },
  { label: 'Pedidos de Venda', href: '/vendas/pedidos', icon: ShoppingCart, group: 'Vendas' },
  { label: 'Clientes', href: '/clientes', icon: Users, group: 'Vendas' },
  { label: 'Faturação', href: '/faturacao/dashboard', icon: Receipt, group: 'Vendas' },

  // Finanças
  { label: 'Contabilidade', href: '/contabilidade', icon: Landmark, group: 'Finanças' },
  { label: 'Plano de Contas', href: '/contabilidade/plano-contas', icon: BookOpen, group: 'Finanças' },
  { label: 'Lançamentos', href: '/contabilidade/lancamentos', icon: FileText, group: 'Finanças' },
  { label: 'Caixa', href: '/caixa', icon: Receipt, group: 'Finanças' },

  // RH
  { label: 'Colaboradores', href: '/rh/colaboradores', icon: Users, group: 'Recursos Humanos' },
  { label: 'Payroll', href: '/rh/payroll', icon: UserCog, group: 'Recursos Humanos' },

  // Projectos
  { label: 'Projectos', href: '/projetos/lista', icon: Briefcase, group: 'Projectos' },
  { label: 'Tarefas', href: '/projetos/tarefas', icon: ClipboardList, group: 'Projectos' },

  // Operações
  { label: 'Transporte', href: '/transporte', icon: Truck, group: 'Operações' },
  { label: 'Tickets de Suporte', href: '/tickets/lista', icon: Ticket, group: 'Operações' },
  { label: 'Serviços', href: '/servicos/lista', icon: Wrench, group: 'Operações' },

  // Analytics
  { label: 'Analytics', href: '/analytics', icon: BarChart3, group: 'Analytics' },
];

// Agrupar por grupo
const GROUPS = NAV_ITEMS.reduce<Record<string, NavItem[]>>((acc, item) => {
  if (!acc[item.group]) acc[item.group] = [];
  acc[item.group]!.push(item);
  return acc;
}, {});

interface CommandPaletteProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Paleta de comandos global (Cmd+K).
 * Navegação para qualquer página por pesquisa de texto.
 */
export function CommandPalette({ open: externalOpen, onOpenChange }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const isControlled = externalOpen !== undefined;
  const isOpen = isControlled ? externalOpen : open;

  const setIsOpen = useCallback(
    (value: boolean) => {
      if (!isControlled) setOpen(value);
      onOpenChange?.(value);
    },
    [isControlled, onOpenChange]
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen(!isOpen);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [isOpen, setIsOpen]);

  const handleSelect = (href: string) => {
    setIsOpen(false);
    router.push(href);
  };

  return (
    <CommandDialog open={isOpen} onOpenChange={setIsOpen}>
      <CommandInput placeholder="Pesquisar páginas, módulos..." aria-label="Pesquisar" />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>

        {Object.entries(GROUPS).map(([group, items], index) => (
          <span key={group}>
            {index > 0 && <CommandSeparator />}
            <CommandGroup heading={group}>
              {items.map((item) => (
                <CommandItem
                  key={item.href}
                  value={`${group} ${item.label}`}
                  onSelect={() => handleSelect(item.href)}
                >
                  <item.icon className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </span>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
