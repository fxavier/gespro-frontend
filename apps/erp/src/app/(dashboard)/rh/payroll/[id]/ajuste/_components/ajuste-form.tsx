'use client';

/**
 * Formulário de ajuste manual de linha de payroll — CLIENT COMPONENT.
 * Permite adicionar um provento ou desconto extra ao recibo de um colaborador
 * com payroll PENDENTE. Chama ajustarLinhaManualAction e mostra erros inline.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { ajustarLinhaManualAction } from '@/server/actions/payroll.actions';
import { AjusteLinhaSchema } from '@/lib/validations/payroll';
import type { z } from 'zod';

type FormValues = z.infer<typeof AjusteLinhaSchema>;

const TIPOS = [
  { value: 'PROVENTO', label: 'Provento' },
  { value: 'DESCONTO', label: 'Desconto' },
] as const;

const NATUREZAS = [
  { value: 'BONUS', label: 'Bónus' },
  { value: 'ADIANTAMENTO', label: 'Adiantamento' },
  { value: 'PENHORA', label: 'Penhora' },
  { value: 'OUTRO', label: 'Outro' },
] as const;

interface AjusteFormProps {
  payrollId: string;
  cancelHref: string;
}

export function AjusteForm({ payrollId, cancelHref }: AjusteFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(AjusteLinhaSchema),
    defaultValues: {
      payrollId,
      tipo: 'PROVENTO',
      natureza: 'BONUS',
      descricao: '',
      valor: 0,
    },
  });

  const tipo = useWatch({ control, name: 'tipo' });
  const natureza = useWatch({ control, name: 'natureza' });

  const handleCancel = () => {
    if (isDirty) {
      const confirmed = window.confirm(
        'Tem alterações não guardadas. Tem a certeza que pretende sair?',
      );
      if (!confirmed) return;
    }
    router.push(cancelHref);
  };

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const r = await ajustarLinhaManualAction(values);
      if (r.ok) {
        toast.success('Ajuste adicionado com sucesso.');
        router.push(cancelHref);
      } else {
        setServerError(r.error.message);
      }
    });
  });

  return (
    <>
      <UnsavedChangesGuard isDirty={isDirty} />
      <form onSubmit={onSubmit}>
        <FormPage
          actions={
            <>
              <Button type="button" variant="ghost" onClick={handleCancel}>
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                <Save className="h-4 w-4 mr-2" />
                {isPending ? 'A guardar…' : 'Guardar ajuste'}
              </Button>
            </>
          }
        >
          {serverError && (
            <div
              role="alert"
              className="rounded-md bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20"
            >
              {serverError}
            </div>
          )}
          <FormSection
            title="Ajuste manual"
            description="Adicione uma linha de provento ou desconto ao recibo de vencimento"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo</Label>
                <Select
                  value={tipo}
                  onValueChange={(v) =>
                    setValue('tipo', v as FormValues['tipo'], { shouldDirty: true })
                  }
                >
                  <SelectTrigger id="tipo">
                    <SelectValue placeholder="Seleccione o tipo">
                      {TIPOS.find((t) => t.value === tipo)?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.tipo && (
                  <p className="text-sm text-destructive">{errors.tipo.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="natureza">Natureza</Label>
                <Select
                  value={natureza}
                  onValueChange={(v) =>
                    setValue('natureza', v as FormValues['natureza'], { shouldDirty: true })
                  }
                >
                  <SelectTrigger id="natureza">
                    <SelectValue placeholder="Seleccione a natureza">
                      {NATUREZAS.find((n) => n.value === natureza)?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {NATUREZAS.map((n) => (
                      <SelectItem key={n.value} value={n.value}>
                        {n.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.natureza && (
                  <p className="text-sm text-destructive">{errors.natureza.message}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição</Label>
                <Input
                  id="descricao"
                  {...register('descricao')}
                  placeholder="Descrição do ajuste"
                />
                {errors.descricao && (
                  <p className="text-sm text-destructive">{errors.descricao.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="valor">Valor</Label>
                <Input
                  id="valor"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0,00"
                  {...register('valor', { valueAsNumber: true })}
                />
                {errors.valor && (
                  <p className="text-sm text-destructive">{errors.valor.message}</p>
                )}
              </div>
            </div>
          </FormSection>
        </FormPage>
      </form>
    </>
  );
}
