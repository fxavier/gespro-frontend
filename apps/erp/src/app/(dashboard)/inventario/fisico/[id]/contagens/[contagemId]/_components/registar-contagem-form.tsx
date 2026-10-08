'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FormSection, UnsavedChangesGuard } from '@/components/patterns';
import {
  EstadoAtivoEnum,
  RegistarContagemSchema,
  ROTULOS_ESTADO_ATIVO,
  type RegistarContagem,
} from '@/lib/validations/inventario-ativos';
import { registarContagemAction } from '@/server/actions/inventario.actions';

interface Props {
  inventarioId: string;
  contagemId: string;
  /** Valores iniciais: a contagem anterior, se houver; senão encontrado no estado esperado. */
  encontrado: boolean;
  estadoEncontrado: RegistarContagem['estadoEncontrado'];
  observacoesContagem: string;
}

/** Registo da contagem de um activo do inventário físico (#117). */
export function RegistarContagemForm({ inventarioId, contagemId, encontrado, estadoEncontrado, observacoesContagem }: Props) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();
  const detalhe = `/inventario/fisico/${inventarioId}`;

  const form = useForm<RegistarContagem>({
    resolver: zodResolver(RegistarContagemSchema),
    defaultValues: { itemId: contagemId, encontrado, estadoEncontrado, observacoesContagem },
  });
  const foiEncontrado = useWatch({ control: form.control, name: 'encontrado' });

  const onSubmit = form.handleSubmit((valores) => {
    iniciar(async () => {
      const r = await registarContagemAction({
        itemId: valores.itemId,
        encontrado: valores.encontrado,
        // Um activo não encontrado não tem estado observado.
        estadoEncontrado: valores.encontrado ? valores.estadoEncontrado : undefined,
        observacoesContagem: valores.observacoesContagem?.trim() || undefined,
      });
      if (!r.ok) {
        toast.error(r.error.message ?? 'Não foi possível registar a contagem.');
        return;
      }
      toast.success('Contagem registada.');
      router.push(detalhe);
    });
  });

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty && !aCorrer} />
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <FormSection title="Resultado da contagem">
          <FormField
            control={form.control}
            name="encontrado"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <RadioGroup
                    value={field.value ? 'sim' : 'nao'}
                    onValueChange={(v) => field.onChange(v === 'sim')}
                    aria-label="Resultado da contagem"
                    className="gap-3"
                  >
                    <div className="flex items-center gap-3 rounded-lg border p-3">
                      <RadioGroupItem id="contagem-encontrado" value="sim" />
                      <Label htmlFor="contagem-encontrado" className="flex-1 cursor-pointer font-medium">
                        Encontrado
                      </Label>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg border p-3">
                      <RadioGroupItem id="contagem-nao-encontrado" value="nao" />
                      <Label htmlFor="contagem-nao-encontrado" className="flex-1 cursor-pointer font-medium">
                        Não encontrado
                      </Label>
                    </div>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="estadoEncontrado"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Estado encontrado</FormLabel>
                <Select value={field.value ?? ''} onValueChange={field.onChange} disabled={!foiEncontrado}>
                  <FormControl>
                    <SelectTrigger aria-label="Estado encontrado">
                      <SelectValue placeholder="Seleccione o estado">
                        {field.value ? ROTULOS_ESTADO_ATIVO[field.value] : undefined}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {EstadoAtivoEnum.options.map((e) => (
                      <SelectItem key={e} value={e}>
                        {ROTULOS_ESTADO_ATIVO[e]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="observacoesContagem"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Observações</FormLabel>
                <FormControl>
                  <Textarea {...field} value={field.value ?? ''} rows={3} maxLength={2000} className="resize-none" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href={detalhe}>Voltar</Link>
          </Button>
          <Button type="submit" size="sm" disabled={aCorrer}>
            <ClipboardCheck className="h-4 w-4 mr-1.5" aria-hidden="true" />
            {aCorrer ? 'A registar…' : 'Registar contagem'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
