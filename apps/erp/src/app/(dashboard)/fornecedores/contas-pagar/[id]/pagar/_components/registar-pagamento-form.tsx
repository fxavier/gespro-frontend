'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { registarPagamentoAction } from '@/server/actions/fornecedores.actions';
import { CreatePagamentoSchema, type CreatePagamentoInput } from '@/lib/validations/compras';

const FORMAS = [
  { valor: 'TRANSFERENCIA_BANCARIA', rotulo: 'Transferência bancária' },
  { valor: 'CHEQUE', rotulo: 'Cheque' },
  { valor: 'M-PESA', rotulo: 'M-Pesa' },
  { valor: 'E-MOLA', rotulo: 'e-Mola' },
  { valor: 'NUMERARIO', rotulo: 'Numerário' },
] as const;

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

export function RegistarPagamentoForm({
  contaPagarId,
  valorRestante,
}: {
  contaPagarId: string;
  valorRestante: number;
}) {
  const router = useRouter();
  const detalhe = `/fornecedores/contas-pagar/${contaPagarId}`;
  const [isPending, iniciarTransicao] = useTransition();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isDirty },
  } = useForm<CreatePagamentoInput>({
    // O valor por omissão é o restante: liquidar por inteiro é o caso comum;
    // um pagamento parcial escreve-se por cima.
    resolver: zodResolver(CreatePagamentoSchema),
    defaultValues: {
      contaPagarId,
      dataPagamento: new Date(),
      valor: valorRestante,
      formaPagamento: 'TRANSFERENCIA_BANCARIA',
      referencia: '',
      observacoes: '',
    },
    mode: 'onBlur',
  });

  // Action directa + navegação imediata, e não `useActionState` + efeito: a
  // action revalida a rota e, num pagamento total, esta página volta a
  // renderizar já no ramo «conta liquidada» — o formulário é desmontado e o
  // efeito sobre o `state` nunca corria.
  const onSubmit = handleSubmit((valores) => {
    iniciarTransicao(async () => {
      const res = await registarPagamentoAction(valores);
      if (!res.ok) {
        toast.error(res.error.message ?? 'Não foi possível registar o pagamento.');
        return;
      }
      toast.success('Pagamento registado.');
      router.push(detalhe);
    });
  });

  const err = (name: keyof CreatePagamentoInput) =>
    errors[name] ? (
      <p className="text-sm text-destructive">{String(errors[name]?.message)}</p>
    ) : null;

  return (
    <form onSubmit={onSubmit}>
      <UnsavedChangesGuard isDirty={isDirty && !isPending} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => router.push(detalhe)}>
              <X className="mr-2 h-4 w-4" /> Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              <Save className="mr-2 h-4 w-4" /> {isPending ? 'A registar…' : 'Registar pagamento'}
            </Button>
          </>
        }
      >
        <FormSection title="Pagamento">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="valor">Valor (MZN) *</Label>
              <Input
                id="valor"
                type="number"
                step="0.01"
                min={0.01}
                max={valorRestante}
                {...register('valor', { valueAsNumber: true })}
              />
              {err('valor')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="dataPagamento">Data do pagamento *</Label>
              <Input
                id="dataPagamento"
                type="date"
                defaultValue={hojeISO()}
                onChange={(e) => {
                  // `aaaa-mm-dd` → Date pelos componentes, ao meio-dia: `new
                  // Date(string)` lê como UTC e, a leste de Greenwich, pode
                  // cair no dia anterior — mudaria o período do lançamento.
                  const [ano, mes, dia] = e.target.value.split('-').map(Number);
                  if (ano && mes && dia) {
                    setValue('dataPagamento', new Date(ano, mes - 1, dia, 12), { shouldDirty: true });
                  }
                }}
              />
              {err('dataPagamento')}
            </div>
            <div className="space-y-2">
              <Label>Forma de pagamento *</Label>
              <Select
                defaultValue="TRANSFERENCIA_BANCARIA"
                onValueChange={(v) => setValue('formaPagamento', v, { shouldDirty: true, shouldValidate: true })}
              >
                <SelectTrigger aria-label="Forma de pagamento">
                  <SelectValue placeholder="Seleccione" />
                </SelectTrigger>
                <SelectContent>
                  {FORMAS.map((f) => (
                    <SelectItem key={f.valor} value={f.valor}>
                      {f.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err('formaPagamento')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="referencia">Referência</Label>
              <Input id="referencia" {...register('referencia')} placeholder="N.º da transferência, cheque…" />
              {err('referencia')}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea id="observacoes" rows={3} {...register('observacoes')} />
              {err('observacoes')}
            </div>
          </div>
        </FormSection>
      </FormPage>
    </form>
  );
}
