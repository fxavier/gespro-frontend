'use client';

/**
 * Transições da proforma, conforme o estado. Cancelar exige motivo e ainda não
 * tem rota própria — fica de fora até a ter, em vez de abrir um modal.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Check, FileCheck, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { aceitarProforma, enviarProforma } from '@/server/actions/faturacao.actions';

interface Props {
  id: string;
  numero: string;
  podeEnviar: boolean;
  podeAceitar: boolean;
  podeConverter: boolean;
}

export function AcoesProforma({ id, numero, podeEnviar, podeAceitar, podeConverter }: Props) {
  const router = useRouter();
  const [aCorrer, iniciarTransicao] = useTransition();

  const correr = (
    accao: (input: { id: string }) => Promise<{ ok: boolean; error?: { message?: string } }>,
    sucesso: string,
  ) =>
    iniciarTransicao(async () => {
      const res = await accao({ id });
      if (!res.ok) {
        toast.error(res.error?.message ?? 'Não foi possível concluir a operação.');
        return;
      }
      toast.success(sucesso);
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" asChild>
        <Link href="/faturacao/proforma">
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Voltar
        </Link>
      </Button>

      {podeEnviar && (
        <Button
          variant="outline"
          size="sm"
          disabled={aCorrer}
          onClick={() => correr(enviarProforma, `${numero} enviada ao cliente.`)}
        >
          <Send className="h-4 w-4 mr-1.5" />
          Enviar
        </Button>
      )}

      {podeAceitar && (
        <Button
          variant="outline"
          size="sm"
          disabled={aCorrer}
          onClick={() => correr(aceitarProforma, `${numero} aceite pelo cliente.`)}
        >
          <Check className="h-4 w-4 mr-1.5" />
          Aceitar
        </Button>
      )}

      {podeConverter && (
        <Button size="sm" asChild>
          <Link href={`/faturacao/proforma/${id}/converter`}>
            <FileCheck className="h-4 w-4 mr-1.5" />
            Converter em factura
          </Link>
        </Button>
      )}
    </div>
  );
}
