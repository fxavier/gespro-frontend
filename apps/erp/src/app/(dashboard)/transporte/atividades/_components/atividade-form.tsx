'use client';

/**
 * Formulário de Atividade — Client Component (criar + editar).
 * Padrão golden standard: useTransition + Server Action, sem Dialog.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { criarAtividadeAction, atualizarAtividadeAction } from '@/server/actions/transporte.actions';
import { CriarAtividadeSchema } from '@/lib/validations/transporte';

interface Opcao {
  id: string;
  label: string;
}

export interface AtividadeFormValores {
  id: string;
  titulo: string;
  descricao: string | null;
  tipoActividade: string;
  localActividade: string;
  dataInicioPrevista: string; // yyyy-mm-ddThh:mm
  dataConclusaoPrevista: string | null;
  motoristaResponsavelId: string | null;
  viaturaId: string | null;
  prioridade: string;
  observacoes: string | null;
}

interface AtividadeFormProps {
  viaturas: Opcao[];
  motoristas: Opcao[];
  atividade?: AtividadeFormValores;
}

const TIPOS = [
  { value: 'DESLOCACAO', label: 'Deslocação' },
  { value: 'MISSAO_SERVICO', label: 'Missão de Serviço' },
  { value: 'TRANSPORTE_MERCADORIAS', label: 'Transporte de Mercadorias' },
  { value: 'TRANSPORTE_PESSOAL', label: 'Transporte de Pessoal' },
  { value: 'MANUTENCAO_CAMPO', label: 'Manutenção em Campo' },
  { value: 'OUTRO', label: 'Outro' },
];

const PRIORIDADES = [
  { value: 'BAIXA', label: 'Baixa' },
  { value: 'MEDIA', label: 'Média' },
  { value: 'ALTA', label: 'Alta' },
  { value: 'URGENTE', label: 'Urgente' },
];

const SEM = '__sem__';

export function AtividadeForm({ viaturas, motoristas, atividade }: AtividadeFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const edicao = Boolean(atividade);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);

    const viaturaRaw = data.get('viaturaId') as string;
    const motoristaRaw = data.get('motoristaResponsavelId') as string;
    const conclusaoRaw = data.get('dataConclusaoPrevista') as string;

    const base = {
      titulo: (data.get('titulo') as string).trim(),
      descricao: (data.get('descricao') as string)?.trim() || undefined,
      tipoActividade: data.get('tipoActividade') as string,
      localActividade: (data.get('localActividade') as string).trim(),
      dataInicioPrevista: new Date(data.get('dataInicioPrevista') as string),
      dataConclusaoPrevista: conclusaoRaw ? new Date(conclusaoRaw) : undefined,
      motoristaResponsavelId: motoristaRaw && motoristaRaw !== SEM ? motoristaRaw : undefined,
      viaturaId: viaturaRaw && viaturaRaw !== SEM ? viaturaRaw : undefined,
      prioridade: data.get('prioridade') as string,
      observacoes: (data.get('observacoes') as string)?.trim() || undefined,
    };

    // Valida no cliente com o schema partilhado; narrowa os enums (string → união).
    const parsed = CriarAtividadeSchema.safeParse({ ...base, anexos: [] });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }
    // Em edição não mexemos nos anexos (o form não os gere) → removê-los do payload.
    const { anexos: _anexos, ...semAnexos } = parsed.data;

    startTransition(async () => {
      const result = edicao
        ? await atualizarAtividadeAction({ id: atividade!.id, ...semAnexos })
        : await criarAtividadeAction(parsed.data);

      if (result.ok) {
        toast.success(edicao ? 'Atividade atualizada.' : 'Atividade criada.');
        router.push(`/transporte/atividades/${result.data.id}`);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao guardar atividade.');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      <Card>
        <CardContent className="p-5 space-y-4">
          <p className="font-medium text-sm">Atividade</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="titulo">Título *</Label>
              <Input id="titulo" name="titulo" required minLength={3} maxLength={300} defaultValue={atividade?.titulo} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tipoActividade">Tipo *</Label>
              <Select name="tipoActividade" defaultValue={atividade?.tipoActividade ?? 'DESLOCACAO'}>
                <SelectTrigger id="tipoActividade"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prioridade">Prioridade</Label>
              <Select name="prioridade" defaultValue={atividade?.prioridade ?? 'MEDIA'}>
                <SelectTrigger id="prioridade"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="localActividade">Local *</Label>
              <Input id="localActividade" name="localActividade" required maxLength={300} defaultValue={atividade?.localActividade} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-4">
          <p className="font-medium text-sm">Agendamento e Recursos</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="dataInicioPrevista">Início Previsto *</Label>
              <Input id="dataInicioPrevista" name="dataInicioPrevista" type="datetime-local" required defaultValue={atividade?.dataInicioPrevista} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dataConclusaoPrevista">Conclusão Prevista</Label>
              <Input id="dataConclusaoPrevista" name="dataConclusaoPrevista" type="datetime-local" defaultValue={atividade?.dataConclusaoPrevista ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="viaturaId">Viatura</Label>
              <Select name="viaturaId" defaultValue={atividade?.viaturaId ?? SEM}>
                <SelectTrigger id="viaturaId"><SelectValue placeholder="Sem viatura" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM}>Sem viatura</SelectItem>
                  {viaturas.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="motoristaResponsavelId">Motorista Responsável</Label>
              <Select name="motoristaResponsavelId" defaultValue={atividade?.motoristaResponsavelId ?? SEM}>
                <SelectTrigger id="motoristaResponsavelId"><SelectValue placeholder="Sem motorista" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM}>Sem motorista</SelectItem>
                  {motoristas.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea id="descricao" name="descricao" maxLength={2000} rows={3} defaultValue={atividade?.descricao ?? ''} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea id="observacoes" name="observacoes" maxLength={2000} rows={2} defaultValue={atividade?.observacoes ?? ''} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'A guardar…' : edicao ? 'Guardar Alterações' : 'Criar Atividade'}
        </Button>
        <Button type="button" variant="outline" asChild disabled={pending}>
          <Link href={edicao ? `/transporte/atividades/${atividade!.id}` : '/transporte/atividades'}>Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}
