/**
 * Contas dos meios de pagamento do POS (ADR-0041 §4) — Server Component.
 *
 * Para cada meio configurável (Cartão, Transferência, M-Pesa, e-Mola), a
 * ContaBancaria cuja conta contabilística a venda POS debita. Sem conta, 121.
 * Numerário debita sempre 111 e crédito 411 — não aparecem aqui.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { listarContasMeioPagamentoPOS } from '@/server/services/financas/meio-pagamento.service';
import { ROTULO_METODO_POS, TIPOS_CONTA_POR_METODO_POS } from '@/lib/meios-pagamento';
import { FormSection, PageHeader } from '@/components/patterns';
import { MeioPagamentoPOSForm, type OpcaoContaBancaria } from './_components/meio-pagamento-pos-form';

const TITULO = 'Contas dos meios de pagamento do POS';
const BREADCRUMBS = [
  { label: 'Contabilidade', href: '/contabilidade' },
  { label: 'Configurações', href: '/contabilidade/configuracoes' },
  { label: 'Meios de pagamento do POS' },
];

export default async function MeiosPagamentoPOSPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId, permissions } = session.user;

  if (!permissions.includes('financas:configurar')) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader title={TITULO} breadcrumbs={BREADCRUMBS} />
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm">
          <p className="font-medium text-destructive">Acesso não autorizado</p>
          <p className="mt-1 text-muted-foreground">
            Não tem permissão para configurar as contas dos meios de pagamento. Contacte o administrador do sistema.
          </p>
        </div>
      </div>
    );
  }

  const ctx = { tenantId, userId };
  const { configuracao, contas, contasPGC } = await runWithTenantContext(ctx, async () => ({
    configuracao: await listarContasMeioPagamentoPOS(ctx),
    contas: await contabilidadeService.listarContasBancarias(ctx),
    contasPGC: await contabilidadeService.listarContas({ classe: 'CLASSE_1', aceitaLancamento: true, take: 200 }, ctx),
  }));
  const pgcPorId = new Map(contasPGC.items.map((c) => [c.id, c.codigo]));
  const rotuloConta = (c: (typeof contas)[number]) =>
    `${c.banco} · ${c.numeroConta}${pgcPorId.has(c.contaContabilId) ? ` (${pgcPorId.get(c.contaContabilId)})` : ''}`;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={TITULO}
        description="Conta bancária que cada venda POS debita, por meio de pagamento"
        breadcrumbs={BREADCRUMBS}
      />
      <FormSection
        title="Conta a débito por meio"
        description="Numerário debita sempre 111 Caixa. Um meio sem conta debita 121 Depósitos à ordem. M-Pesa e e-Mola só aceitam carteiras móveis; cartão e transferência, contas bancárias."
      >
        <div className="space-y-6">
          {configuracao.map((linha) => {
            const tipos = TIPOS_CONTA_POR_METODO_POS[linha.metodo];
            const opcoes: OpcaoContaBancaria[] = contas
              .filter((c) => c.ativo && tipos.includes(c.tipoConta))
              .map((c) => ({ id: c.id, label: rotuloConta(c) }));
            // A conta configurada pode ter sido desactivada depois: mostra-a na mesma
            // (o aviso por linha vem de `contaBancariaInativa`, do serviço).
            if (linha.contaBancariaId && !opcoes.some((o) => o.id === linha.contaBancariaId)) {
              opcoes.push({
                id: linha.contaBancariaId,
                label: `${linha.contaBancariaDescricao ?? 'Conta bancária'}${linha.contaBancariaInativa ? ' (inactiva)' : ''}`,
              });
            }
            return (
              <MeioPagamentoPOSForm
                key={linha.metodo}
                metodo={linha.metodo}
                rotulo={ROTULO_METODO_POS[linha.metodo]}
                contaBancariaId={linha.contaBancariaId}
                contaBancariaInativa={linha.contaBancariaInativa}
                opcoes={opcoes}
              />
            );
          })}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Falta uma conta? Crie-a em{' '}
          <Link href="/contabilidade/contas-bancarias" className="text-primary underline-offset-4 hover:underline">
            Contas Bancárias
          </Link>
          .
        </p>
      </FormSection>
    </div>
  );
}
