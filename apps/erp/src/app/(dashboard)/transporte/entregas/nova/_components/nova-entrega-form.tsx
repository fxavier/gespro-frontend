'use client';

/**
 * Formulário de criação de entrega — Client Component.
 * Segue o padrão golden standard: useTransition + server action, sem Dialog.
 */

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormPage, FormSection, Combobox } from '@/components/patterns';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { criarEntregaAction } from '@/server/actions/transporte.actions';
import type { ViaturaResumo } from '@/server/services/operacoes/viatura.interface';
import type { RotaResumo } from '@/server/services/operacoes/rota.interface';

interface MotoristaOpcao {
  id: string;
  nomeCompleto: string;
}

interface ItemForm {
  produtoId: string;
  produtoNome: string;
  quantidade: number;
  peso: number;
  volume: number;
  valor: number;
}

const ITEM_VAZIO: ItemForm = {
  produtoId: '',
  produtoNome: '',
  quantidade: 1,
  peso: 0,
  volume: 0,
  valor: 0,
};

interface NovaEntregaFormProps {
  viaturas: ViaturaResumo[];
  motoristas: MotoristaOpcao[];
  rotas: RotaResumo[];
}

export function NovaEntregaForm({ viaturas, motoristas, rotas }: NovaEntregaFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [itens, setItens] = useState<ItemForm[]>([{ ...ITEM_VAZIO }]);

  const adicionarItem = () => setItens((prev) => [...prev, { ...ITEM_VAZIO }]);

  const removerItem = (idx: number) =>
    setItens((prev) => prev.filter((_, i) => i !== idx));

  const updateItem = (idx: number, field: keyof ItemForm, value: string | number) =>
    setItens((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    );

  const pesoTotal = itens.reduce((s, i) => s + i.peso * i.quantidade, 0);
  const volumeTotal = itens.reduce((s, i) => s + i.volume * i.quantidade, 0);
  const valorCarga = itens.reduce((s, i) => s + i.valor * i.quantidade, 0);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    // Validate items
    const itensSemNome = itens.filter((i) => !i.produtoNome.trim() || !i.produtoId.trim());
    if (itensSemNome.length > 0) {
      toast.error('Todos os itens devem ter código e nome preenchidos.');
      return;
    }

    startTransition(async () => {
      const viaturaId = data.get('viaturaId') as string;
      const motoristaId = data.get('motoristaId') as string;
      const rotaId = data.get('rotaId') as string;

      const result = await criarEntregaAction({
        clienteId: data.get('clienteId') as string,
        clienteNome: data.get('clienteNome') as string,
        clienteTelefone: data.get('clienteTelefone') as string,
        enderecoEntrega: data.get('enderecoEntrega') as string,
        cidade: data.get('cidade') as string,
        dataAgendada: new Date(data.get('dataAgendada') as string),
        prioridade: (data.get('prioridade') as 'BAIXA' | 'NORMAL' | 'ALTA' | 'URGENTE') ?? 'NORMAL',
        itens: itens.map((i) => ({
          produtoId: i.produtoId,
          produtoNome: i.produtoNome,
          quantidade: i.quantidade,
          peso: i.peso,
          volume: i.volume,
          valor: i.valor,
        })),
        pesoTotal,
        volumeTotal,
        valorCarga,
        taxaEntrega: Number(data.get('taxaEntrega') ?? 0),
        viaturaId: viaturaId || undefined,
        motoristaId: motoristaId || undefined,
        rotaId: rotaId || undefined,
      });

      if (result.ok) {
        toast.success('Entrega criada com sucesso.');
        router.push(`/transporte/entregas/${result.data.id}`);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao criar entrega.');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" asChild disabled={pending}>
              <Link href="/transporte/entregas">Cancelar</Link>
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'A criar…' : 'Criar Entrega'}
            </Button>
          </>
        }
      >
      {/* Cliente */}
      <FormSection title="Dados do Cliente">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="clienteId">Código do Cliente *</Label>
              <Input id="clienteId" name="clienteId" required placeholder="CL-001" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clienteNome">Nome *</Label>
              <Input id="clienteNome" name="clienteNome" required maxLength={200} placeholder="Nome completo" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clienteTelefone">Telefone *</Label>
              <Input id="clienteTelefone" name="clienteTelefone" required minLength={9} maxLength={30} placeholder="+258 84 000 0000" />
            </div>
          </div>
      </FormSection>

      {/* Morada */}
      <FormSection title="Morada de Entrega">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2 xl:col-span-3">
              <Label htmlFor="enderecoEntrega">Endereço *</Label>
              <Input id="enderecoEntrega" name="enderecoEntrega" required maxLength={500} placeholder="Rua, número, bairro…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cidade">Cidade *</Label>
              <Input id="cidade" name="cidade" required maxLength={200} placeholder="Maputo" />
            </div>
          </div>
      </FormSection>

      {/* Agendamento */}
      <FormSection title="Agendamento">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="dataAgendada">Data Agendada *</Label>
              <Input id="dataAgendada" name="dataAgendada" type="date" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prioridade">Prioridade</Label>
              <Select name="prioridade" defaultValue="NORMAL">
                <SelectTrigger id="prioridade">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BAIXA">Baixa</SelectItem>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                  <SelectItem value="ALTA">Alta</SelectItem>
                  <SelectItem value="URGENTE">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="taxaEntrega">Taxa de Entrega (MZN)</Label>
              <Input id="taxaEntrega" name="taxaEntrega" type="number" min={0} step="0.01" defaultValue={0} />
            </div>
          </div>
      </FormSection>

      {/* Recursos (opcional) */}
      <FormSection title="Recursos (opcional)">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="viaturaId">Viatura</Label>
              <Combobox
                id="viaturaId"
                name="viaturaId"
                placeholder="Sem viatura"
                options={viaturas.map((v) => ({ value: v.id, label: `${v.matricula} — ${v.marca} ${v.modelo}` }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="motoristaId">Motorista</Label>
              <Combobox
                id="motoristaId"
                name="motoristaId"
                placeholder="Sem motorista"
                options={motoristas.map((m) => ({ value: m.id, label: m.nomeCompleto }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rotaId">Rota</Label>
              <Combobox
                id="rotaId"
                name="rotaId"
                placeholder="Sem rota"
                options={rotas.map((r) => ({ value: r.id, label: `${r.codigo} — ${r.nome}` }))}
              />
            </div>
          </div>
      </FormSection>

      {/* Itens */}
      <FormSection title="Itens da Carga *">
          <div className="flex items-center justify-end">
            <Button type="button" variant="outline" size="sm" onClick={adicionarItem}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Adicionar Item
            </Button>
          </div>

          {itens.map((item, idx) => (
            <div key={idx} className="border rounded-md p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">Item {idx + 1}</span>
                {itens.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removerItem(idx)}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                <div className="space-y-1.5">
                  <Label htmlFor={`item-${idx}-codigo`}>Código *</Label>
                  <Input
                    id={`item-${idx}-codigo`}
                    value={item.produtoId}
                    onChange={(e) => updateItem(idx, 'produtoId', e.target.value)}
                    required
                    placeholder="PRD-001"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2 xl:col-span-3">
                  <Label htmlFor={`item-${idx}-nome`}>Nome *</Label>
                  <Input
                    id={`item-${idx}-nome`}
                    value={item.produtoNome}
                    onChange={(e) => updateItem(idx, 'produtoNome', e.target.value)}
                    required
                    placeholder="Nome do produto"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`item-${idx}-quantidade`}>Quantidade *</Label>
                  <Input
                    id={`item-${idx}-quantidade`}
                    type="number"
                    min={1}
                    value={item.quantidade}
                    onChange={(e) => updateItem(idx, 'quantidade', Number(e.target.value))}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`item-${idx}-peso`}>Peso (kg)</Label>
                  <Input
                    id={`item-${idx}-peso`}
                    type="number"
                    min={0}
                    step="0.1"
                    value={item.peso}
                    onChange={(e) => updateItem(idx, 'peso', Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`item-${idx}-valor`}>Valor (MZN)</Label>
                  <Input
                    id={`item-${idx}-valor`}
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.valor}
                    onChange={(e) => updateItem(idx, 'valor', Number(e.target.value))}
                  />
                </div>
              </div>
            </div>
          ))}

          <div className="flex items-center gap-6 text-sm text-muted-foreground border-t pt-3">
            <span>Peso Total: <span className="font-medium tabular-nums">{pesoTotal.toFixed(1)} kg</span></span>
            <span>Valor Total: <span className="font-medium tabular-nums">MZN {valorCarga.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}</span></span>
          </div>
      </FormSection>

      </FormPage>
    </form>
  );
}
