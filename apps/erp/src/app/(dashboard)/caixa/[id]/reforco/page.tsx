/**
 * Reforço de caixa (#146) — Server Component. O formulário só aparece quando
 * `acoesSessaoCaixa` o permite (sessão ABERTA + permissão `caixa:reforco`); o servidor decide na mesma.
 */
import Link from 'next/link';
import { PageHeader, EmptyState } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { sessaoComAcoes } from '../_components/sessao-com-acoes';
import { MovimentoManualForm } from '../_components/movimento-manual-form';

export default async function ReforcoCaixaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sessao, acoes } = await sessaoComAcoes(id);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Reforço de caixa"
        description="Acrescentar dinheiro à gaveta (ex.: troco)"
        breadcrumbs={[
          { label: 'Caixa', href: '/caixa' },
          { label: sessao.numero, href: `/caixa/${sessao.id}` },
          { label: 'Reforço' },
        ]}
      />
      {acoes.reforco ? (
        <MovimentoManualForm sessaoId={sessao.id} tipo="reforco" />
      ) : (
        <EmptyState
          title="Não é possível registar o reforço nesta sessão"
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
