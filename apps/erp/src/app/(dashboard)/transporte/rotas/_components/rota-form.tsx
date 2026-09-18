'use client';

/**
 * Formulário de Rota — Client Component (criar + editar).
 * Padrão golden standard: useTransition + Server Action, sem Dialog.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FormPage, FormSection, Combobox } from '@/components/patterns';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { criarRotaAction, atualizarRotaAction } from '@/server/actions/transporte.actions';
import { CriarRotaSchema } from '@/lib/validations/transporte';

interface Opcao {
  id: string;
  label: string;
}

export interface RotaFormValores {
  id: string;
  nome: string;
  descricao: string | null;
  origem: string;
  destino: string;
  viaturaId: string | null;
  motoristaId: string | null;
  dataInicio: string; // yyyy-mm-dd
  dataFim: string | null;
  distanciaTotal: string | null;
  tempoEstimadoMin: number | null;
  custoEstimado: string | null;
  observacoes: string | null;
}

interface RotaFormProps {
  viaturas: Opcao[];
  motoristas: Opcao[];
  rota?: RotaFormValores;
}

const SEM = '__sem__';

export function RotaForm({ viaturas, motoristas, rota }: RotaFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const edicao = Boolean(rota);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);

    const viaturaRaw = data.get('viaturaId') as string;
    const motoristaRaw = data.get('motoristaId') as string;
    const dataFimRaw = data.get('dataFim') as string;
    const distanciaRaw = data.get('distanciaTotal') as string;
    const tempoRaw = data.get('tempoEstimadoMin') as string;
    const custoRaw = data.get('custoEstimado') as string;

    const base = {
      nome: (data.get('nome') as string).trim(),
      descricao: (data.get('descricao') as string)?.trim() || undefined,
      origem: (data.get('origem') as string).trim(),
      destino: (data.get('destino') as string).trim(),
      viaturaId: viaturaRaw && viaturaRaw !== SEM ? viaturaRaw : undefined,
      motoristaId: motoristaRaw && motoristaRaw !== SEM ? motoristaRaw : undefined,
      dataInicio: new Date(data.get('dataInicio') as string),
      dataFim: dataFimRaw ? new Date(dataFimRaw) : undefined,
      distanciaTotal: distanciaRaw ? Number(distanciaRaw) : undefined,
      tempoEstimadoMin: tempoRaw ? Number(tempoRaw) : undefined,
      custoEstimado: custoRaw ? Number(custoRaw) : undefined,
      observacoes: (data.get('observacoes') as string)?.trim() || undefined,
    };

    // Valida no cliente com o schema partilhado.
    const parsed = CriarRotaSchema.safeParse(base);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }

    startTransition(async () => {
      const result = edicao
        ? await atualizarRotaAction({ id: rota!.id, ...parsed.data })
        : await criarRotaAction(parsed.data);

      if (result.ok) {
        toast.success(edicao ? 'Rota atualizada.' : 'Rota criada.');
        router.push(`/transporte/rotas/${result.data.id}`);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao guardar rota.');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" asChild disabled={pending}>
              <Link href={edicao ? `/transporte/rotas/${rota!.id}` : '/transporte/rotas'}>Cancelar</Link>
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'A guardar…' : edicao ? 'Guardar Alterações' : 'Criar Rota'}
            </Button>
          </>
        }
      >
      <FormSection title="Rota">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2 xl:col-span-3">
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" name="nome" required maxLength={200} defaultValue={rota?.nome} placeholder="Distribuição Maputo Centro" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="origem">Origem *</Label>
              <Input id="origem" name="origem" required maxLength={300} defaultValue={rota?.origem} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="destino">Destino *</Label>
              <Input id="destino" name="destino" required maxLength={300} defaultValue={rota?.destino} />
            </div>
          </div>
      </FormSection>

      <FormSection title="Recursos e Planeamento">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="viaturaId">Viatura</Label>
              <Combobox
                id="viaturaId"
                name="viaturaId"
                defaultValue={rota?.viaturaId ?? SEM}
                placeholder="Sem viatura"
                options={[{ value: SEM, label: 'Sem viatura' }, ...viaturas.map((v) => ({ value: v.id, label: v.label }))]}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="motoristaId">Motorista</Label>
              <Combobox
                id="motoristaId"
                name="motoristaId"
                defaultValue={rota?.motoristaId ?? SEM}
                placeholder="Sem motorista"
                options={[{ value: SEM, label: 'Sem motorista' }, ...motoristas.map((m) => ({ value: m.id, label: m.label }))]}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dataInicio">Data de Início *</Label>
              <Input id="dataInicio" name="dataInicio" type="date" required defaultValue={rota?.dataInicio} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dataFim">Data de Fim</Label>
              <Input id="dataFim" name="dataFim" type="date" defaultValue={rota?.dataFim ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="distanciaTotal">Distância (km)</Label>
              <Input id="distanciaTotal" name="distanciaTotal" type="number" min={0} step="0.1" defaultValue={rota?.distanciaTotal ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tempoEstimadoMin">Tempo Estimado (min)</Label>
              <Input id="tempoEstimadoMin" name="tempoEstimadoMin" type="number" min={0} defaultValue={rota?.tempoEstimadoMin ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="custoEstimado">Custo Estimado (MZN)</Label>
              <Input id="custoEstimado" name="custoEstimado" type="number" min={0} step="0.01" defaultValue={rota?.custoEstimado ?? ''} />
            </div>
          </div>
      </FormSection>

      <FormSection>
          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea id="descricao" name="descricao" maxLength={1000} rows={2} defaultValue={rota?.descricao ?? ''} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea id="observacoes" name="observacoes" maxLength={1000} rows={2} defaultValue={rota?.observacoes ?? ''} />
          </div>
      </FormSection>

      </FormPage>
    </form>
  );
}
