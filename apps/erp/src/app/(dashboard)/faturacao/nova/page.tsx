/**
 * Nova Fatura — Server Component shell.
 * Carrega as séries de FATURA e os primeiros clientes para o formulário CC.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { clienteService } from '@/server/services/comercial/cliente.service';
import { PageHeader } from '@/components/patterns';
import { listarSeriesParaSelecao, type SerieOpcao } from '../_lib/series';
import { NovaFaturaForm, type ClienteOpcao } from './_components/nova-fatura-form';

export default async function NovaFaturaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let series: SerieOpcao[] = [];
  let clientes: ClienteOpcao[] = [];
  try {
    [series, clientes] = await runWithTenantContext(ctx, async () => {
      const [s, pagina] = await Promise.all([
        listarSeriesParaSelecao('FATURA', ctx),
        // Os primeiros por ordem alfabética; a partir daí a combobox pesquisa
        // no servidor (`procurarClientes`).
        clienteService.listar({ status: 'ATIVO', take: 20, orderBy: 'nome', order: 'asc' }, ctx),
      ]);
      return [s, pagina.items.map((c) => ({ id: c.id, codigo: c.codigo, nome: c.nome }))] as const;
    });
  } catch {
    // O formulário mostra as listas vazias e avisa.
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Fatura"
        description="Emissão de fatura fiscal"
        breadcrumbs={[
          { label: 'Faturação', href: '/faturacao' },
          { label: 'Nova Fatura' },
        ]}
      />
      <NovaFaturaForm series={series} clientesIniciais={clientes} />
    </div>
  );
}
