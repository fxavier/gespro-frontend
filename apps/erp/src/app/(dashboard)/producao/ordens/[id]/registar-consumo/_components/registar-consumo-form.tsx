'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { PackageMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { ComboboxRemoto, FormSection, type ComboboxOption } from '@/components/patterns';
import {
  procurarMateriaisConsumoAction,
  registarConsumoOrdemAction,
} from '@/server/actions/producao.actions';

export interface MaterialConsumo {
  id: string;
  sku: string;
  nome: string;
  unidadeMedida: string;
  precoCompra: string;
}

const Schema = z.object({
  produtoId: z.string().min(1, 'Escolha o material'),
  quantidade: z
    .string()
    .refine((v) => Number(v) > 0, 'Indique uma quantidade maior do que zero'),
});
type Dados = z.infer<typeof Schema>;

const opcao = (m: MaterialConsumo): ComboboxOption => ({ value: m.id, label: `${m.sku} — ${m.nome}` });

/**
 * #164 — material + quantidade. O código, nome, unidade e custo unitário do `RegistarConsumoSchema`
 * vêm do produto escolhido (custo = preço de compra). A action baixa o stock de `MP` e recusa
 * `STOCK_INSUFICIENTE` / `LOCALIZACAO_NAO_CONFIGURADA` sem gravar nada.
 */
export function RegistarConsumoForm({ id, materiais }: { id: string; materiais: MaterialConsumo[] }) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();
  const detalhe = `/producao/ordens/${id}`;

  // Todos os materiais já vistos (primeira página + resultados de pesquisa), por id.
  const [conhecidos, setConhecidos] = useState(() => new Map(materiais.map((m) => [m.id, m])));

  const form = useForm<Dados>({
    resolver: zodResolver(Schema),
    defaultValues: { produtoId: '', quantidade: '' },
  });

  const procurar = async (q: string): Promise<ComboboxOption[] | null> => {
    const r = await procurarMateriaisConsumoAction({ q });
    if (!r.ok) return null;
    const encontrados: MaterialConsumo[] = r.data.map((m) => ({ ...m, precoCompra: String(m.precoCompra) }));
    setConhecidos((antes) => {
      const depois = new Map(antes);
      for (const m of encontrados) depois.set(m.id, m);
      return depois;
    });
    return encontrados.map(opcao);
  };

  const onSubmit = form.handleSubmit(({ produtoId, quantidade }) => {
    const material = conhecidos.get(produtoId);
    if (!material) {
      form.setError('produtoId', { type: 'manual', message: 'Escolha o material' });
      return;
    }
    const qtd = Number(quantidade);
    iniciar(async () => {
      const r = await registarConsumoOrdemAction({
        ordemProducaoId: id,
        produtoId: material.id,
        codigoProduto: material.sku,
        nomeProduto: material.nome,
        quantidadePrevista: qtd,
        quantidadeReal: qtd,
        unidadeMedida: material.unidadeMedida,
        custoUnitario: Number(material.precoCompra) || 0,
      });
      if (!r.ok) {
        if (r.error.code === 'STOCK_INSUFICIENTE') {
          form.setError('quantidade', { type: 'server', message: r.error.message });
        } else {
          toast.error(r.error.message ?? 'Não foi possível registar o consumo.');
        }
        return;
      }
      toast.success(`Consumo de ${material.nome} registado.`);
      router.push(detalhe);
    });
  });

  const unidade = conhecidos.get(useWatch({ control: form.control, name: 'produtoId' }))?.unidadeMedida;

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <FormSection
          title="Material consumido"
          description="A quantidade sai já do armazém de matérias-primas (MP)."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="produtoId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Material</FormLabel>
                  <FormControl>
                    <ComboboxRemoto
                      opcoesIniciais={materiais.map(opcao)}
                      procurar={procurar}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Escolha o material"
                      emptyText="Nenhum produto encontrado"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quantidade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantidade{unidade ? ` (${unidade})` : ''}</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} step="any" inputMode="decimal" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href={detalhe}>Voltar</Link>
          </Button>
          <Button type="submit" size="sm" disabled={aCorrer}>
            <PackageMinus className="h-4 w-4 mr-1.5" aria-hidden="true" />
            {aCorrer ? 'A registar…' : 'Registar consumo'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
