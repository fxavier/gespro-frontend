'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  compras: 'Compras',
  requisicoes: 'Requisições',
  novo: 'Nova Requisição',
  editar: 'Editar',
  cotacoes: 'Cotações',
  pedidos: 'Pedidos',
  fornecedores: 'Fornecedores',
  inventario: 'Inventário',
  produtos: 'Produtos',
  ativos: 'Activos',
  movimentacoes: 'Movimentações',
  fisico: 'Inventário Físico',
  manutencao: 'Manutenção',
  categorias: 'Categorias',
  vendas: 'Vendas',
  pos: 'POS',
  clientes: 'Clientes',
  faturacao: 'Faturação',
  contabilidade: 'Contabilidade',
  lancamentos: 'Lançamentos',
  'plano-contas': 'Plano de Contas',
  'razao-geral': 'Razão Geral',
  diarios: 'Diários',
  balancete: 'Balancete',
  reconciliacao: 'Reconciliação',
  caixa: 'Caixa',
  abertura: 'Abertura',
  fechamento: 'Fechamento',
  rh: 'Recursos Humanos',
  colaboradores: 'Colaboradores',
  payroll: 'Payroll',
  ferias: 'Férias',
  assiduidade: 'Assiduidade',
  ausencias: 'Ausências',
  avaliacoes: 'Avaliações',
  formacoes: 'Formações',
  recrutamento: 'Recrutamento',
  projetos: 'Projectos',
  lista: 'Lista',
  tarefas: 'Tarefas',
  timesheet: 'Timesheet',
  producao: 'Produção',
  ordens: 'Ordens',
  planeamento: 'Planeamento',
  qualidade: 'Qualidade',
  transporte: 'Transporte',
  veiculos: 'Viaturas',
  motoristas: 'Motoristas',
  rotas: 'Rotas',
  combustivel: 'Combustível',
  atividades: 'Actividades',
  tickets: 'Tickets',
  servicos: 'Serviços',
  agendamentos: 'Agendamentos',
  contratos: 'Contratos',
  analytics: 'Analytics',
  'core-tenancy': 'Configurações de Plataforma',
  nova: 'Nova',
  procurement: 'Procurement',
  relatorios: 'Relatórios',
  historico: 'Histórico',
  'contas-pagar': 'Contas a Pagar',
  documentos: 'Documentos',
};

function isId(segment: string): boolean {
  // Heurística: strings longas com letras+números são IDs
  return /^[a-z0-9]{20,}$/i.test(segment) || /^[0-9a-f-]{36}$/i.test(segment);
}

function labelForSegment(segment: string, prevSegment?: string): string {
  if (isId(segment)) {
    const entity = prevSegment ? SEGMENT_LABELS[prevSegment] : undefined;
    return entity ? `Detalhe de ${entity}` : 'Detalhe';
  }
  return SEGMENT_LABELS[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1);
}

/**
 * Breadcrumbs dinâmicos gerados a partir do pathname.
 * Client Component (usa usePathname).
 */
export function Breadcrumbs() {
  const pathname = usePathname();

  // Ignorar grupos de rota (parênteses), slots paralelos (@)
  const segments = pathname
    .split('/')
    .filter((s) => s && !s.startsWith('(') && !s.startsWith('@'));

  if (segments.length === 0) return null;

  const crumbs: Array<{ label: string; href: string }> = [];
  let path = '';

  segments.forEach((segment, index) => {
    path += `/${segment}`;
    const prev = index > 0 ? segments[index - 1] : undefined;
    crumbs.push({
      label: labelForSegment(segment, prev),
      href: path,
    });
  });

  return (
    <nav
      aria-label="Navegação de fio de Ariadne"
      className="flex items-center gap-1 text-sm text-muted-foreground min-w-0"
    >
      <Link
        href="/dashboard"
        className="hover:text-foreground transition-colors flex-shrink-0"
        aria-label="Início"
      >
        <Home className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>

      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1 min-w-0">
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          {i === crumbs.length - 1 ? (
            <span className="text-foreground font-medium truncate max-w-[120px] md:max-w-[200px]">
              {crumb.label}
            </span>
          ) : (
            <Link
              href={crumb.href}
              className="hover:text-foreground transition-colors truncate max-w-[120px] md:max-w-[200px]"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
