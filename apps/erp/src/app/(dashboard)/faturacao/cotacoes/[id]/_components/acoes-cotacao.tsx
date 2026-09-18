'use client';

/**
 * Transições da cotação, conforme o estado. As que só precisam de confirmação
 * correm aqui; as que recolhem dados (motivo, série) são rotas próprias — a
 * regra sem-modais.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Check, FileCheck, Send, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  aceitarCotacaoComercial,
  enviarCotacaoComercial,
} from '@/server/actions/faturacao.actions';

interface Props {
  id: string;
  numero: string;
  podeEnviar: boolean;
  podeAceitar: boolean;
  podeRejeitar: boolean;
  podeConverter: boolean;
}

export function AcoesCotacao({ id, numero, podeEnviar, podeAceitar, podeRejeitar, podeConverter }: Props) {
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
        <Link href="/faturacao/cotacoes">
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Voltar
        </Link>
      </Button>

      {podeEnviar && (
        <Button
          variant="outline"
          size="sm"
          disabled={aCorrer}
          onClick={() => correr(enviarCotacaoComercial, `${numero} enviada ao cliente.`)}
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
          onClick={() => correr(aceitarCotacaoComercial, `${numero} aceite pelo cliente.`)}
        >
          <Check className="h-4 w-4 mr-1.5" />
          Aceitar
        </Button>
      )}

      {podeRejeitar && (
        <Button variant="outline" size="sm" asChild>
          <Link href={`/faturacao/cotacoes/${id}/rejeitar`}>
            <XCircle className="h-4 w-4 mr-1.5" />
            Rejeitar
          </Link>
        </Button>
      )}

      {podeConverter && (
        <Button size="sm" asChild>
          <Link href={`/faturacao/cotacoes/${id}/converter`}>
            <FileCheck className="h-4 w-4 mr-1.5" />
            Converter em proforma
          </Link>
        </Button>
      )}
    </div>
  );
}
