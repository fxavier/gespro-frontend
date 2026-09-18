'use client';

/**
 * Converter cotação→proforma e proforma→factura. É o mesmo gesto duas vezes
 * (escolher a série de destino e confirmar), por isso é um componente só com
 * um ramo, e não duas cópias de noventa linhas.
 *
 * A série é uma escolha real: um tenant pode ter mais do que uma activa do
 * mesmo tipo, e é ela que fixa o número do documento que vai nascer.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Combobox, FormPage, FormSection } from '@/components/patterns';
import {
  converterCotacaoEmProforma,
  converterProformaEmFatura,
} from '@/server/actions/faturacao.actions';
import type { SerieOpcao } from '../_lib/series';

interface Props {
  tipo: 'cotacao' | 'proforma';
  documentoId: string;
  numero: string;
  series: SerieOpcao[];
  voltarHref: string;
}

const TEXTOS = {
  cotacao: {
    botao: 'Converter em proforma',
    aCorrer: 'A converter…',
    rotuloSerie: 'Série de proforma',
    titulo: 'Proforma a criar',
    descricao:
      'As linhas e os valores passam tal e qual. A proforma nasce em RASCUNHO e a cotação fica CONVERTIDA — não volta atrás.',
  },
  proforma: {
    botao: 'Converter em factura',
    aCorrer: 'A emitir…',
    rotuloSerie: 'Série de factura',
    titulo: 'Factura a emitir',
    descricao:
      'A factura nasce já EMITIDA, com vencimento a 30 dias, e a proforma fica CONVERTIDA. É um documento fiscal: não se apaga, corrige-se por nota de crédito.',
  },
} as const;

export function ConverterDocumentoForm({ tipo, documentoId, numero, series, voltarHref }: Props) {
  const router = useRouter();
  const [aCorrer, iniciarTransicao] = useTransition();
  const [serieId, setSerieId] = useState(series.length === 1 ? series[0].id : '');
  const t = TEXTOS[tipo];

  const confirmar = () => {
    if (!serieId) {
      toast.error('Escolha a série de destino.');
      return;
    }

    iniciarTransicao(async () => {
      const res =
        tipo === 'cotacao'
          ? await converterCotacaoEmProforma({ id: documentoId, serieProformaId: serieId })
          : await converterProformaEmFatura({ id: documentoId, serieDocumentoId: serieId });

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
            disabled={aCorrer || series.length === 0}
            onClick={confirmar}
          >
            <FileCheck className="h-4 w-4 mr-1.5" />
            {aCorrer ? t.aCorrer : t.botao}
          </Button>
        </>
      }
    >
      <FormSection title={t.titulo} description={t.descricao}>
        <div className="max-w-sm space-y-2">
          <Label htmlFor="serie-destino">{t.rotuloSerie} *</Label>
          <Combobox
            id="serie-destino"
            aria-label={t.rotuloSerie}
            value={serieId}
            disabled={series.length === 0 || aCorrer}
            onChange={setSerieId}
            placeholder="Seleccione a série"
            options={series.map((s) => ({ value: s.id, label: s.nome }))}
          />
          {series.length === 0 && (
            <p className="text-sm text-destructive">
              Sem séries activas deste tipo. Configure uma em Faturação → Séries antes de converter.
            </p>
          )}
        </div>
      </FormSection>
    </FormPage>
  );
}
