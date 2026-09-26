'use client';

/**
 * Contas de caixa e equivalentes (ADR-0037 E2). O conjunto gravado é EXACTO:
 * as contas que entram mapeiam à rubrica de caixa; as que saem ficam sem
 * mapeamento (impedimento na DFC até serem reatribuídas — nunca se adivinha
 * uma actividade). Schema do servidor: `DefinirContasCaixaSchema`.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { ComboboxRemoto, FormPage, FormSection, UnsavedChangesGuard, type ComboboxOption } from '@/components/patterns';
import { definirContasCaixaAction, procurarContasDFCAction } from '@/server/actions/fluxo-caixa.actions';
import { DefinirContasCaixaSchema, type DefinirContasCaixaInput } from '@/lib/validations/fluxo-caixa';
import { ROTA_RUBRICAS } from './rotulos';

export function ContasCaixaForm({
  actuais,
  contasIniciais,
  voltar,
}: {
  actuais: ComboboxOption[];
  contasIniciais: ComboboxOption[];
  voltar: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const destino = voltar ?? ROTA_RUBRICAS;
  const [rotulos, setRotulos] = useState(() => new Map(actuais.map((c) => [c.value, c.label])));
  const [aAcrescentar, setAAcrescentar] = useState<string | undefined>(undefined);
  const [opcoesVistas, setOpcoesVistas] = useState<Map<string, string>>(
    () => new Map(contasIniciais.map((c) => [c.value, c.label])),
  );

  const form = useForm<DefinirContasCaixaInput>({
    resolver: zodResolver(DefinirContasCaixaSchema),
    defaultValues: { contaIds: actuais.map((c) => c.value) },
  });
  const contaIds = useWatch({ control: form.control, name: 'contaIds' });
  const removidas = actuais.filter((c) => !contaIds.includes(c.value));

  const acrescentar = () => {
    if (!aAcrescentar || contaIds.includes(aAcrescentar)) return;
    const label = opcoesVistas.get(aAcrescentar) ?? aAcrescentar;
    setRotulos((m) => new Map(m).set(aAcrescentar, label));
    form.setValue('contaIds', [...contaIds, aAcrescentar], { shouldDirty: true, shouldValidate: true });
    setAAcrescentar(undefined);
  };

  const retirar = (id: string) =>
    form.setValue(
      'contaIds',
      contaIds.filter((c) => c !== id),
      { shouldDirty: true, shouldValidate: true },
    );

  const procurar = async (q: string): Promise<ComboboxOption[] | null> => {
    const r = await procurarContasDFCAction({ q });
    if (!r.ok) return null;
    const opcoes = r.data.map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nome}` }));
    setOpcoesVistas((m) => {
      const n = new Map(m);
      for (const o of opcoes) n.set(o.value, o.label);
      return n;
    });
    return opcoes;
  };

  const onSubmit = form.handleSubmit((dados) => {
    startTransition(async () => {
      const res = await definirContasCaixaAction(dados);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success('Contas de caixa gravadas. O mapeamento passou a uma versão nova, por validar.');
      form.reset(dados);
      router.push(destino);
      router.refresh();
    });
  });

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty && !isPending} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => router.push(destino)}>
              <X className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-1.5" aria-hidden="true" />
              {isPending ? 'A guardar…' : 'Guardar'}
            </Button>
          </>
        }
      >
        <FormSection
          title="Contas de caixa e equivalentes"
          description="A variação destas contas é o Δcaixa com que a DFC articula. Nunca se deduz por código: é esta lista."
        >
          <FormField
            control={form.control}
            name="contaIds"
            render={() => (
              <FormItem>
                <FormLabel>Contas ({contaIds.length})</FormLabel>
                <ul className="divide-y rounded-md border">
                  {contaIds.map((id) => (
                    <li key={id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span>{rotulos.get(id) ?? id}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => retirar(id)}
                        aria-label={`Retirar ${rotulos.get(id) ?? id}`}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                  {contaIds.length === 0 && (
                    <li className="px-3 py-2 text-sm text-muted-foreground">Nenhuma conta de caixa.</li>
                  )}
                </ul>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <span className="text-sm font-medium">Acrescentar conta</span>
              <ComboboxRemoto
                opcoesIniciais={contasIniciais}
                procurar={procurar}
                value={aAcrescentar}
                onChange={setAAcrescentar}
                placeholder="Seleccionar conta"
                searchPlaceholder="Código ou nome da conta…"
                emptyText="Nenhuma conta encontrada"
              />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={acrescentar} disabled={!aAcrescentar}>
              <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Acrescentar
            </Button>
          </div>
          {removidas.length > 0 && (
            <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm" role="status">
              Ao gravar, {removidas.map((c) => c.label).join(', ')}{' '}
              {removidas.length === 1 ? 'fica' : 'ficam'} sem mapeamento. Com movimento, a DFC deixa de sair até
              {removidas.length === 1 ? ' ser mapeada' : ' serem mapeadas'} noutra rubrica.
            </p>
          )}
        </FormSection>
      </FormPage>
    </Form>
  );
}
