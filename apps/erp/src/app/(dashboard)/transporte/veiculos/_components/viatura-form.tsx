'use client';

/**
 * Formulário de Viatura — Client Component (criar + editar).
 * Padrão golden standard: useTransition + Server Action, sem Dialog.
 * Mesmo schema Zod das validações (CriarViaturaSchema) validado no servidor.
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
import {
  criarViaturaAction,
  atualizarViaturaAction,
} from '@/server/actions/transporte.actions';

interface MotoristaOpcao {
  id: string;
  nomeCompleto: string;
}

export interface ViaturaFormValores {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
  tipoViatura: string;
  capacidade: string;
  unidadeCapacidade: string;
  localActividade: string;
  dataInicioActividade: string; // ISO yyyy-mm-dd
  motoristaResponsavelId: string | null;
  observacoes: string | null;
}

interface ViaturaFormProps {
  motoristas: MotoristaOpcao[];
  viatura?: ViaturaFormValores;
}

const TIPOS = [
  { value: 'LIGEIRO_PASSAGEIROS', label: 'Ligeiro de Passageiros' },
  { value: 'LIGEIRO_MERCADORIAS', label: 'Ligeiro de Mercadorias' },
  { value: 'PESADO_MERCADORIAS', label: 'Pesado de Mercadorias' },
  { value: 'PESADO_PASSAGEIROS', label: 'Pesado de Passageiros' },
  { value: 'MOTOCICLO', label: 'Motociclo' },
  { value: 'OUTRO', label: 'Outro' },
];

const UNIDADES = [
  { value: 'KG', label: 'Quilogramas (kg)' },
  { value: 'TON', label: 'Toneladas (ton)' },
  { value: 'M3', label: 'Metros cúbicos (m³)' },
  { value: 'PASSAGEIROS', label: 'Passageiros' },
];

const SEM_MOTORISTA = '__sem__';

export function ViaturaForm({ motoristas, viatura }: ViaturaFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const edicao = Boolean(viatura);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const motoristaRaw = data.get('motoristaResponsavelId') as string;
    const motoristaResponsavelId =
      motoristaRaw && motoristaRaw !== SEM_MOTORISTA ? motoristaRaw : undefined;

    const base = {
      matricula: (data.get('matricula') as string).trim(),
      marca: (data.get('marca') as string).trim(),
      modelo: (data.get('modelo') as string).trim(),
      tipoViatura: data.get('tipoViatura') as string,
      capacidade: Number(data.get('capacidade')),
      unidadeCapacidade: data.get('unidadeCapacidade') as string,
      localActividade: (data.get('localActividade') as string).trim(),
      dataInicioActividade: new Date(data.get('dataInicioActividade') as string),
      motoristaResponsavelId,
      observacoes: (data.get('observacoes') as string)?.trim() || undefined,
    };

    startTransition(async () => {
      const result = edicao
        ? await atualizarViaturaAction({ id: viatura!.id, ...base })
        : await criarViaturaAction(base);

      if (result.ok) {
        toast.success(edicao ? 'Viatura atualizada.' : 'Viatura registada.');
        router.push(`/transporte/veiculos/${result.data.id}`);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao guardar viatura.');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      <Card>
        <CardContent className="p-5 space-y-4">
          <p className="font-medium text-sm">Identificação</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="matricula">Matrícula *</Label>
              <Input id="matricula" name="matricula" required minLength={3} maxLength={20} defaultValue={viatura?.matricula} placeholder="AAA-000-MC" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tipoViatura">Tipo *</Label>
              <Select name="tipoViatura" defaultValue={viatura?.tipoViatura ?? 'LIGEIRO_MERCADORIAS'}>
                <SelectTrigger id="tipoViatura"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="marca">Marca *</Label>
              <Input id="marca" name="marca" required maxLength={100} defaultValue={viatura?.marca} placeholder="Toyota" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="modelo">Modelo *</Label>
              <Input id="modelo" name="modelo" required maxLength={100} defaultValue={viatura?.modelo} placeholder="Hilux" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-4">
          <p className="font-medium text-sm">Capacidade e Operação</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="capacidade">Capacidade *</Label>
              <Input id="capacidade" name="capacidade" type="number" required min={0.01} step="0.01" defaultValue={viatura?.capacidade} placeholder="1000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unidadeCapacidade">Unidade *</Label>
              <Select name="unidadeCapacidade" defaultValue={viatura?.unidadeCapacidade ?? 'KG'}>
                <SelectTrigger id="unidadeCapacidade"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNIDADES.map((u) => (
                    <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="localActividade">Local de Actividade *</Label>
              <Input id="localActividade" name="localActividade" required defaultValue={viatura?.localActividade} placeholder="Maputo" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dataInicioActividade">Início de Actividade *</Label>
              <Input id="dataInicioActividade" name="dataInicioActividade" type="date" required defaultValue={viatura?.dataInicioActividade} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="motoristaResponsavelId">Motorista Responsável</Label>
              <Select name="motoristaResponsavelId" defaultValue={viatura?.motoristaResponsavelId ?? SEM_MOTORISTA}>
                <SelectTrigger id="motoristaResponsavelId"><SelectValue placeholder="Sem motorista" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_MOTORISTA}>Sem motorista</SelectItem>
                  {motoristas.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.nomeCompleto}</SelectItem>
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
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea id="observacoes" name="observacoes" maxLength={1000} rows={3} defaultValue={viatura?.observacoes ?? ''} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'A guardar…' : edicao ? 'Guardar Alterações' : 'Registar Viatura'}
        </Button>
        <Button type="button" variant="outline" asChild disabled={pending}>
          <Link href={edicao ? `/transporte/veiculos/${viatura!.id}` : '/transporte/veiculos'}>Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}
