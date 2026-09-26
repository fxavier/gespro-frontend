'use client';

/**
 * Converter cotação→proforma e proforma→factura. É o mesmo gesto duas vezes
 * (confirmar), por isso é um componente só com um ramo, e não duas cópias.
 *
 * A série não se escolhe (#93): o documento que nasce é datado de hoje e
 * numerado na série activa do seu tipo no ano corrente (Maputo).
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormPage, FormSection } from '@/components/patterns';
import {
  converterCotacaoEmProforma,
  converterProformaEmFatura,
} from '@/server/actions/faturacao.actions';

interface Props {
  tipo: 'cotacao' | 'proforma';
  documentoId: string;
  numero: string;
  voltarHref: string;
}

const TEXTOS = {
  cotacao: {
    botao: 'Converter em proforma',
    aCorrer: 'A converter…',
    tipoDestino: 'proforma',
    titulo: 'Proforma a criar',
    descricao:
      'As linhas e os valores passam tal e qual. A proforma nasce em RASCUNHO e a cotação fica CONVERTIDA — não volta atrás.',
  },
  proforma: {
    botao: 'Converter em factura',
    aCorrer: 'A emitir…',
    tipoDestino: 'factura',
    titulo: 'Factura a emitir',
    descricao:
      'A factura nasce já EMITIDA, com vencimento a 30 dias, e a proforma fica CONVERTIDA. É um documento fiscal: não se apaga, corrige-se por nota de crédito.',
  },
} as const;

export function ConverterDocumentoForm({ tipo, documentoId, numero, voltarHref }: Props) {
  const router = useRouter();
  const [aCorrer, iniciarTransicao] = useTransition();
  const t = TEXTOS[tipo];

  const confirmar = () => {
    iniciarTransicao(async () => {
      const res =
        tipo === 'cotacao'
          ? await converterCotacaoEmProforma({ id: documentoId })
          : await converterProformaEmFatura({ id: documentoId });

      if (!res.ok) {
        toast.error(res.error.message ?? 'Não foi possível converter o documento.');
        return;
      }

      const destino =
        tipo === 'cotacao' ? `/faturacao/proforma/${res.data.id}` : `/faturacao/${res.data.id}`;
      toast.success(`${numero} convertido — ${res.data.numero}.`);
      router.push(destino);
      router.refresh();
    });
  };

  return (
    <FormPage
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={aCorrer}
            onClick={() => router.push(voltarHref)}
          >
            <X className="h-4 w-4 mr-1.5" />
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={aCorrer}
            onClick={confirmar}
          >
            <FileCheck className="h-4 w-4 mr-1.5" />
            {aCorrer ? t.aCorrer : t.botao}
          </Button>
        </>
      }
    >
      <FormSection title={t.titulo} description={t.descricao}>
        <p className="text-sm text-muted-foreground">
          Numerada na série activa de {t.tipoDestino} do ano da data de emissão (hoje).
        </p>
      </FormSection>
    </FormPage>
  );
}
