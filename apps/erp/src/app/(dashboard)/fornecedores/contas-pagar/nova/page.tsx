/**
 * Nova conta a pagar manual (#111) — Server Component (NUNCA 'use client').
 *
 * Rota própria (sem modais): recolhe fornecedor, conta contabilística de débito, descrição,
 * valor, emissão e vencimento. Grava pela `criarContaPagarAction` (ABERTA, número da série
 * CONTA_PAGAR e lançamento D conta escolhida / C 421). Exige `compras:conta-pagar:criar`.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { fornecedorService } from '@/server/services/compras/fornecedor.service';
import { listarContas } from '@/server/services/financas/contabilidade.service';
import { FilterFornecedorSchema } from '@/lib/validations/fornecedores';
import { PageHeader } from '@/components/patterns';
import { diaIsoMaputo } from '@/lib/format-date';
import { NovaContaPagarForm } from './_components/nova-conta-pagar-form';

export default async function NovaContaPagarPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId, permissions } = session.user;
  if (!permissions.includes('compras:conta-pagar:criar')) redirect('/fornecedores/contas-pagar');
  const ctx = { tenantId, userId };

  // Primeira página de cada lista para o ComboboxRemoto; o resto chega pela pesquisa no servidor.
  const [fornecedores, contas] = await runWithTenantContext(ctx, () =>
    Promise.all([
      fornecedorService.listar(FilterFornecedorSchema.parse({ take: 50 }), ctx),
      listarContas({ aceitaLancamento: true, ativo: true, take: 50 }, ctx),
    ]),
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova conta a pagar"
        description="Dívida a fornecedor registada à mão (renda, serviço, factura sem pedido de compra)"
        breadcrumbs={[
          { label: 'Fornecedores', href: '/fornecedores/lista' },
          { label: 'Contas a Pagar', href: '/fornecedores/contas-pagar' },
          { label: 'Nova' },
        ]}
      />

      <NovaContaPagarForm
        hoje={diaIsoMaputo()}
        fornecedoresIniciais={fornecedores.items.map((f) => ({ value: f.id, label: f.nuit ? `${f.nome} (${f.nuit})` : f.nome }))}
        contasIniciais={contas.items.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nome}` }))}
      />
    </div>
  );
}
