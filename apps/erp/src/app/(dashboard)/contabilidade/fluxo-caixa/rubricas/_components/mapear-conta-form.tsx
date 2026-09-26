'use client';

/**
 * Mapear / reatribuir uma conta (ticket 7.3). Com `conta` fixada pela URL
 * (`?contaId=`, p.ex. a partir dos impedimentos da DFC), só se escolhe a
 * rubrica; sem ela, a conta escolhe-se por `ComboboxRemoto` — o plano de contas
 * passa de uma página, e um filtro local calaria as contas fora da primeira.
 * Depois de gravar vai para `voltar` (caminho interno seguro) ou para as rubricas.
 */
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { ComboboxRemoto, FormPage, FormSection, UnsavedChangesGuard, type ComboboxOption } from '@/components/patterns';
import { mapearContaAction, procurarContasDFCAction } from '@/server/actions/fluxo-caixa.actions';
import { MapearContaSchema, type MapearContaInput } from '@/lib/validations/fluxo-caixa';
import { ROTA_RUBRICAS } from './rotulos';

export interface OpcaoRubrica {
  id: string;
  label: string;
  grupo: string;
}

export function MapearContaForm({
  conta,
  rubricas,
  contasIniciais,
  voltar,
}: {
  /** Conta fixada pela URL, com a rubrica actual (ou `null`). */
  conta: { id: string; label: string; rubricaId: string | null; rubricaActual: string | null } | null;
  rubricas: OpcaoRubrica[];
  contasIniciais: ComboboxOption[];
  voltar: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const destino = voltar ?? ROTA_RUBRICAS;

  const form = useForm<MapearContaInput>({
    resolver: zodResolver(MapearContaSchema),
    defaultValues: { contaId: conta?.id ?? '', rubricaId: conta?.rubricaId ?? '' },
  });

  const onSubmit = form.handleSubmit((dados) => {
    startTransition(async () => {
      const res = await mapearContaAction(dados);
      if (!res.ok) {
        const details = res.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        if (details?.fieldErrors) {
          for (const [campo, msgs] of Object.entries(details.fieldErrors)) {
            form.setError(campo as keyof MapearContaInput, { type: 'server', message: msgs[0] });
          }
        } else {
          toast.error(res.error.message);
        }
        return;
      }
      toast.success('Conta mapeada. O mapeamento passou a uma versão nova, por validar.');
      form.reset(dados);
      router.push(destino);
      router.refresh();
    });
  });

  const procurar = async (q: string): Promise<ComboboxOption[] | null> => {
    const r = await procurarContasDFCAction({ q });
    return r.ok ? r.data.map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nome}` })) : null;
  };

  const rubricaId = useWatch({ control: form.control, name: 'rubricaId' });
  const rubricaEscolhida = rubricas.find((r) => r.id === rubricaId);

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
            <Button type="submit" size="sm" disabled={isPending} onClick={onSubmit} data-testid="mapear-guardar">
              <Save className="h-4 w-4 mr-1.5" aria-hidden="true" />
              {isPending ? 'A guardar…' : 'Guardar'}
            </Button>
          </>
        }
      >
        <FormSection
          title="Conta e rubrica"
          description="Cada conta pertence a uma só rubrica. Reatribuir cria uma versão nova do mapeamento, por validar."
        >
          <FormField
            control={form.control}
            name="contaId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Conta PGC</FormLabel>
                {conta ? (
                  <>
                    <Input value={conta.label} disabled readOnly data-testid="mapear-conta" />
                    <FormDescription>
                      {conta.rubricaActual ? `Actualmente em ${conta.rubricaActual}.` : 'Actualmente sem mapeamento.'}
                    </FormDescription>
                  </>
                ) : (
                  <FormControl>
                    <ComboboxRemoto
                      opcoesIniciais={contasIniciais}
                      procurar={procurar}
                      value={field.value || undefined}
                      onChange={field.onChange}
                      placeholder="Seleccionar conta"
                      searchPlaceholder="Código ou nome da conta…"
                      emptyText="Nenhuma conta encontrada"
                    />
                  </FormControl>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="rubricaId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Rubrica</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="mapear-rubrica">
                      <SelectValue placeholder="Seleccionar rubrica">{rubricaEscolhida?.label}</SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {rubricas.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>Só rubricas activas. As contas de caixa definem-se em «Contas de caixa».</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>
      </FormPage>
    </Form>
  );
}
