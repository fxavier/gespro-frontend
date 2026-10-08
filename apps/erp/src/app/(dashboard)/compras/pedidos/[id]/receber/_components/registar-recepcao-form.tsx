'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PackageCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox, FormPage, FormSection, UnsavedChangesGuard, type ComboboxOption } from '@/components/patterns';
import { registarRecebimentoAction } from '@/server/actions/compras.actions';
import { CreateRecebimentoCompraSchema } from '@/lib/validations/compras';
import { diaIsoParaData } from '@/lib/format-date';

export interface ItemPorReceber {
  id: string;
  descricao: string;
  unidadeMedida: string;
  comProduto: boolean;
  pedida: number;
  recebida: number;
  emFalta: number;
}

interface Props {
  pedidoCompraId: string;
  /** Dia civil de Maputo (`aaaa-mm-dd`), calculado no servidor. */
  hoje: string;
  itens: ItemPorReceber[];
  localizacoes: ComboboxOption[];
}

/**
 * Recepção de mercadoria (#111): uma localização de destino para a recepção e, por item ainda
 * por receber, a quantidade recebida. Itens a 0 não são enviados. A action trata da entrada de
 * stock e, quando o pedido fica recebido na totalidade, da conta a pagar.
 */
export function RegistarRecepcaoForm({ pedidoCompraId, hoje, itens, localizacoes }: Props) {
  const router = useRouter();
  const detalhe = `/compras/pedidos/${pedidoCompraId}`;
  const [aGravar, iniciar] = useTransition();
  const [localizacaoId, setLocalizacaoId] = useState('');
  const [data, setData] = useState(hoje);
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});
  const [erros, setErros] = useState<Record<string, string>>({});

  const sujo = Boolean(localizacaoId || numeroDocumento || Object.values(quantidades).some((q) => Number(q) > 0));

  const submeter = (e: React.FormEvent) => {
    e.preventDefault();
    const novosErros: Record<string, string> = {};
    const linhas = itens.flatMap((i) => {
      const q = Number(quantidades[i.id] ?? 0);
      if (!Number.isFinite(q) || q < 0) {
        novosErros[i.id] = 'Quantidade inválida.';
        return [];
      }
      if (q > i.emFalta + 0.0001) {
        novosErros[i.id] = `Só faltam receber ${i.emFalta} ${i.unidadeMedida}.`;
        return [];
      }
      return q > 0
        ? [{
            itemPedidoCompraId: i.id,
            localizacaoDestinoId: localizacaoId,
            quantidadeRecebida: q,
            quantidadeAceita: q,
            quantidadeRejeitada: 0,
          }]
        : [];
    });
    if (!localizacaoId) novosErros.localizacao = 'Escolha a localização de destino.';
    if (linhas.length === 0 && Object.keys(novosErros).length === 0) {
      novosErros.geral = 'Indique a quantidade recebida de pelo menos um item.';
    }
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;

    const input = {
      pedidoCompraId,
      data: diaIsoParaData(data),
      numeroDocumento: numeroDocumento.trim() || undefined,
      itens: linhas,
    };
    const validado = CreateRecebimentoCompraSchema.safeParse(input);
    if (!validado.success) {
      setErros({ geral: validado.error.issues[0]?.message ?? 'Dados inválidos.' });
      return;
    }

    iniciar(async () => {
      const r = await registarRecebimentoAction(validado.data);
      if (!r.ok) {
        toast.error(r.error.message ?? 'Não foi possível registar a recepção.');
        setErros({ geral: r.error.message ?? 'Não foi possível registar a recepção.' });
        return;
      }
      toast.success('Recepção registada.');
      router.push(detalhe);
    });
  };

  return (
    <form onSubmit={submeter} noValidate>
      <UnsavedChangesGuard isDirty={sujo && !aGravar} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => router.push(detalhe)}>
              <X className="mr-2 h-4 w-4" aria-hidden="true" /> Cancelar
            </Button>
            <Button type="submit" disabled={aGravar}>
              <PackageCheck className="mr-2 h-4 w-4" aria-hidden="true" />
              {aGravar ? 'A registar…' : 'Registar recepção'}
            </Button>
          </>
        }
      >
        <FormSection title="Recepção" description="Onde e quando a mercadoria deu entrada">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="localizacao">Localização de destino *</Label>
              <Combobox
                id="localizacao"
                aria-label="Localização de destino"
                options={localizacoes}
                value={localizacaoId}
                onChange={setLocalizacaoId}
                placeholder="Seleccionar localização…"
                emptyText="Sem localizações activas."
              />
              {erros.localizacao && <p className="text-sm text-destructive">{erros.localizacao}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="data">Data da recepção *</Label>
              <Input id="data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="numeroDocumento">Guia de remessa</Label>
              <Input
                id="numeroDocumento"
                value={numeroDocumento}
                maxLength={100}
                onChange={(e) => setNumeroDocumento(e.target.value)}
                placeholder="N.º da guia do fornecedor"
              />
            </div>
          </div>
        </FormSection>

        <FormSection title="Quantidades recebidas" description="Deixe a 0 os itens que não chegaram nesta entrega">
          {itens.length === 0 ? (
            <p className="text-sm text-muted-foreground">Não há itens por receber neste pedido.</p>
          ) : (
            <div className="space-y-4">
              {itens.map((i) => (
                <div key={i.id} className="grid gap-2 sm:grid-cols-[1fr_12rem] sm:items-center">
                  <div>
                    <p className="font-medium">{i.descricao}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Pedido {i.pedida} {i.unidadeMedida} · já recebido {i.recebida} · em falta {i.emFalta}
                      {i.comProduto ? '' : ' · sem produto (não entra em stock)'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      aria-label={`Quantidade recebida — ${i.descricao}`}
                      value={quantidades[i.id] ?? '0'}
                      onChange={(e) => setQuantidades((q) => ({ ...q, [i.id]: e.target.value }))}
                    />
                    {erros[i.id] && <p className="text-sm text-destructive">{erros[i.id]}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {erros.geral && <p className="mt-4 text-sm text-destructive">{erros.geral}</p>}
        </FormSection>
      </FormPage>
    </form>
  );
}
