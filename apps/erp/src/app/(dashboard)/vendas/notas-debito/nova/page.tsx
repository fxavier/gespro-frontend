/**
 * Nova Nota de Débito — Server Component.
 * Pré-carrega os clientes para o formulário (sem Dialog). A série não se
 * escolhe (#93): é a activa de NOTA_DEBITO no ano da data de emissão.
 * A natureza escolhe a conta a crédito (ADR-0039 §1, #85): para cada natureza
 * passa a omissão do tenant e a primeira página da classe admitida, fundidas por id.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { clienteService } from '@/server/services/comercial/cliente.service';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { listarContasNaturezaNotaDebito } from '@/server/services/financas/natureza-nota-debito.service';
import { classeAdmitidaParaNatureza, rotuloContaPGC } from '@/lib/nota-debito';
import { PageHeader, type ComboboxOption } from '@/components/patterns';
import { NovaNotaDebitoForm } from './_components/nova-nota-debito-form';
import { diaIsoMaputo } from '@/lib/format-date';

export default async function NovaNotaDebitoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const filtroContas = { aceitaLancamento: true, ativo: true, take: 50 } as const;
  const { paginaClientes, configuracao, classe6, classe7 } = await runWithTenantContext(ctx, async () => ({
    paginaClientes: await clienteService.listar({ status: 'ATIVO', take: 200, orderBy: 'nome', order: 'asc' }, ctx),
    configuracao: await listarContasNaturezaNotaDebito(ctx),
    classe6: await contabilidadeService.listarContas({ ...filtroContas, classe: 'CLASSE_6' }, ctx),
    classe7: await contabilidadeService.listarContas({ ...filtroContas, classe: 'CLASSE_7' }, ctx),
  }));

  const clientes = paginaClientes.items.map((c) => ({ id: c.id, nome: c.nome }));
  const primeiraPagina = {
    CLASSE_6: classe6.items.map((c) => ({ value: c.id, label: rotuloContaPGC(c) })),
    CLASSE_7: classe7.items.map((c) => ({ value: c.id, label: rotuloContaPGC(c) })),
  };
  const contasPorNatureza = configuracao.map((linha) => {
    // A omissão pode estar fora da primeira página: funde-se por id.
    const opcoes = new Map<string, ComboboxOption>(
      primeiraPagina[classeAdmitidaParaNatureza(linha.natureza)].map((o) => [o.value, o]),
    );
    if (linha.contaId && linha.codigo && linha.nome) {
      opcoes.set(linha.contaId, { value: linha.contaId, label: rotuloContaPGC({ codigo: linha.codigo, nome: linha.nome }) });
    }
    return { natureza: linha.natureza, omissaoId: linha.contaId, opcoes: [...opcoes.values()] };
  });

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Nota de Débito"
        description="Registar valores adicionais a cobrar ao cliente"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Notas de Débito', href: '/vendas/notas-debito' },
          { label: 'Nova Nota de Débito' },
        ]}
      />
      <NovaNotaDebitoForm clientes={clientes} contasPorNatureza={contasPorNatureza} hoje={diaIsoMaputo()} />
    </div>
  );
}
