/**
 * Histórico de Transacções por Cliente — Server Component.
 *
 * Materializa `HistoricoTransacao` via `clienteService.obterHistorico` (sem
 * mock). Selecção de cliente por URL (`?clienteId=`); exportação por Route
 * Handler (`/api/export/cliente-historico`). Leitura dentro de
 * `runWithTenantContext` (o serviço usa o cliente Prisma scoped).
 */
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { History, Download } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { clienteService } from '@/server/services/comercial/cliente.service';
import { PageHeader, StatusBadge, EmptyState } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const mt = (v: string) => `MT ${parseFloat(v).toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`;

export default async function HistoricoClientesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const sp = await searchParams;
  const clienteId = typeof sp.clienteId === 'string' ? sp.clienteId : undefined;

  // clienteId inválido/cross-tenant → NotFoundError do serviço → 404 (não error boundary).
  // Padrão de clientes/[id]/page.tsx.
  let resultado;
  try {
    resultado = await runWithTenantContext(ctx, async () => {
      const lista = await clienteService.listar({ take: 100, orderBy: 'nome', order: 'asc' }, ctx);
      if (!clienteId) return { clientes: lista.items, historico: null, clienteSelecionado: null };
      const [hist, cli] = await Promise.all([
        clienteService.obterHistorico(clienteId, { take: 100 }, ctx),
        clienteService.buscarPorId(clienteId, ctx),
      ]);
      return { clientes: lista.items, historico: hist.items, clienteSelecionado: cli };
    });
  } catch {
    notFound();
  }
  const { clientes, historico, clienteSelecionado } = resultado;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Histórico de Transacções"
        description="Compras, pagamentos e notas por cliente"
        breadcrumbs={[{ label: 'Clientes', href: '/clientes' }, { label: 'Histórico' }]}
        actions={
          clienteSelecionado ? (
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={`/api/export/cliente-historico?clienteId=${clienteId}&formato=csv`} download>
                  <Download className="h-4 w-4 mr-2" />
                  CSV
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={`/api/export/cliente-historico?clienteId=${clienteId}&formato=xlsx`} download>
                  <Download className="h-4 w-4 mr-2" />
                  XLSX
                </a>
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* Selector de cliente */}
        <aside className="space-y-1 rounded-lg border p-2 max-h-[70vh] overflow-auto">
          <p className="px-2 py-1 text-xs font-semibold uppercase text-muted-foreground">
            Clientes
          </p>
          {clientes.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">Sem clientes.</p>
          ) : (
            clientes.map((c) => (
              <Link
                key={c.id}
                href={`/clientes/historico?clienteId=${c.id}`}
                className={cn(
                  'block rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground',
                  c.id === clienteId && 'bg-accent text-accent-foreground font-medium',
                )}
              >
                <span className="block truncate">{c.nome}</span>
                <span className="block truncate text-xs text-muted-foreground">{c.codigo}</span>
              </Link>
            ))
          )}
        </aside>

        {/* Histórico */}
        <section>
          {!clienteSelecionado ? (
            <EmptyState
              icon={<History className="h-8 w-8" />}
              title="Seleccione um cliente"
              description="Escolha um cliente na lista à esquerda para consultar e exportar o histórico de transacções."
            />
          ) : historico && historico.length > 0 ? (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Data</th>
                    <th className="px-3 py-2 font-medium">Tipo</th>
                    <th className="px-3 py-2 font-medium">Referência</th>
                    <th className="px-3 py-2 font-medium">Descrição</th>
                    <th className="px-3 py-2 font-medium text-right">Valor</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {historico.map((h) => (
                    <tr key={h.id} className="border-t">
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                        {h.dataTransacao.toLocaleDateString('pt-PT')}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={h.tipo} />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{h.referencia}</td>
                      <td className="px-3 py-2">{h.descricao}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                        {mt(h.valor)}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={h.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={<History className="h-8 w-8" />}
              title="Sem transacções"
              description={`Não há transacções registadas para ${clienteSelecionado.nome}.`}
            />
          )}
        </section>
      </div>
    </div>
  );
}
