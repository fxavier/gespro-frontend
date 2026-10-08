/**
 * Sangria de caixa (#146) — Server Component. O formulário só aparece quando
 * `acoesSessaoCaixa` o permite (sessão ABERTA + permissão `caixa:sangria`); o servidor decide na mesma.
 */
import Link from 'next/link';
import { PageHeader, EmptyState } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { sessaoComAcoes } from '../_components/sessao-com-acoes';
import { MovimentoManualForm } from '../_components/movimento-manual-form';

export default async function SangriaCaixaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sessao, acoes } = await sessaoComAcoes(id);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Sangria de caixa"
        description="Retirar dinheiro da gaveta (ex.: para o cofre)"
        breadcrumbs={[
          { label: 'Caixa', href: '/caixa' },
          { label: sessao.numero, href: `/caixa/${sessao.id}` },
          { label: 'Sangria' },
        ]}
      />
      {acoes.sangria ? (
        <MovimentoManualForm sessaoId={sessao.id} tipo="sangria" />
      ) : (
        <EmptyState
          title="Não é possível registar a sangria nesta sessão"
          description="Só uma sessão aberta aceita movimentos, e é precisa a permissão para os registar."
          action={
            <Button variant="outline" asChild>
              <Link href={`/caixa/${sessao.id}`}>Voltar à sessão</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
