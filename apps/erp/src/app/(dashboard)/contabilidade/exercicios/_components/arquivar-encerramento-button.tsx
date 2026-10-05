'use client';

/**
 * Repete o arquivo em PDF do encerramento em vigor (ADR-0035 §8, #365) quando falhou depois do
 * commit. Sem dados a recolher e sem destruir nada ⇒ botão directo. A linha muda de ramo com a
 * revalidação, por isso o resultado vai num toast e a página refresca de imediato.
 */
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { arquivarEncerramento } from '@/server/actions/contabilidade.actions';

export function ArquivarEncerramentoButton({ encerramentoId }: { encerramentoId: string }) {
  const router = useRouter();
  const [aCorrer, iniciarTransicao] = useTransition();

  const arquivar = () => {
    iniciarTransicao(async () => {
      const res = await arquivarEncerramento({ encerramentoId });
      if (!res.ok) {
        toast.error(res.error.message ?? 'Não foi possível arquivar os documentos do encerramento.');
        return;
      }
      toast.success('Documentos do encerramento arquivados.');
      router.refresh();
    });
  };

  return (
    <Button size="sm" variant="outline" onClick={arquivar} disabled={aCorrer}>
      <Archive className="h-3.5 w-3.5 mr-1.5" />
      {aCorrer ? 'A arquivar…' : 'Arquivar documentos'}
    </Button>
  );
}
