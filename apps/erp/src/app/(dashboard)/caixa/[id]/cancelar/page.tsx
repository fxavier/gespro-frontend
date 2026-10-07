/**
 * Cancelar uma sessão de caixa (#146) — Server Component. O formulário (motivo + confirmação em
 * AlertDialog) só aparece quando `acoesSessaoCaixa` o permite: sessão ABERTA, só a abertura como
 * movimento e permissão `caixa:cancelar`. O servidor decide na mesma (CAIXA_COM_PENDENCIAS).
 */
import Link from 'next/link';
import { PageHeader, EmptyState } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { sessaoComAcoes } from '../_components/sessao-com-acoes';
import { CancelarSessaoForm } from '../_components/cancelar-sessao-form';

export default async function CancelarSessaoCaixaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sessao, acoes } = await sessaoComAcoes(id);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Cancelar sessão de caixa"
        description="Para uma sessão aberta por engano, sem movimentos além da abertura"
        breadcrumbs={[
          { label: 'Caixa', href: '/caixa' },
          { label: sessao.numero, href: `/caixa/${sessao.id}` },
          { label: 'Cancelar' },
        ]}
      />
      {acoes.cancelar ? (
        <CancelarSessaoForm sessaoId={sessao.id} numero={sessao.numero} />
      ) : (
        <EmptyState
          title="Esta sessão não pode ser cancelada"
          description="Só se cancela uma sessão aberta sem movimentos além da abertura, com a permissão para o fazer. Com movimentos, o caminho é o fecho."
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
