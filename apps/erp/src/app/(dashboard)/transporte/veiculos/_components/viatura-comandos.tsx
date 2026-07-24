'use client';

/**
 * Comandos operacionais da Viatura — Client Component (folha).
 * Liga a: transitarViaturaAction, registarManutencaoViaturaAction,
 * registarChecklistAction. Transições válidas via TRANSICOES_VIATURA (client-safe).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Minus } from 'lucide-react';
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
import { TRANSICOES_VIATURA } from '@/lib/state-machines';
import { STATUS_LABELS } from '@/components/patterns';
import {
  transitarViaturaAction,
  registarManutencaoViaturaAction,
  registarChecklistAction,
} from '@/server/actions/transporte.actions';

interface ItemChecklist {
  nome: string;
  categoria: 'COMPONENTE' | 'SOBRESSALENTE' | 'ACESSORIO';
  estado: 'OK' | 'AVARIA' | 'FALTA';
}

const ITEM_VAZIO: ItemChecklist = { nome: '', categoria: 'COMPONENTE', estado: 'OK' };

export function ViaturaComandos({ viaturaId, estado }: { viaturaId: string; estado: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [itens, setItens] = useState<ItemChecklist[]>([{ ...ITEM_VAZIO }]);

  const transicoes = TRANSICOES_VIATURA[estado] ?? [];

  function transitar(alvo: string) {
    startTransition(async () => {
      const result = await transitarViaturaAction({
        viaturaId,
        estadoAlvo: alvo as 'DISPONIVEL' | 'EM_ACTIVIDADE' | 'EM_MANUTENCAO' | 'INACTIVA' | 'ABATIDA',
      });
      if (result.ok) {
        toast.success(`Viatura em estado ${STATUS_LABELS[alvo] ?? alvo}.`);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Transição inválida.');
      }
    });
  }

  function registarManutencao(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const kmRaw = data.get('quilometragem') as string;
    const custoRaw = data.get('custo') as string;
    const proxDataRaw = data.get('proximaManutencaoData') as string;

    startTransition(async () => {
      const result = await registarManutencaoViaturaAction({
        viaturaId,
        tipo: data.get('tipo') as 'PREVENTIVA' | 'CORRECTIVA',
        data: new Date(data.get('data') as string),
        quilometragem: kmRaw ? Number(kmRaw) : undefined,
        descricao: (data.get('descricao') as string).trim(),
        fornecedor: (data.get('fornecedor') as string)?.trim() || undefined,
        custo: custoRaw ? Number(custoRaw) : undefined,
        pecasSubstituidas: (data.get('pecasSubstituidas') as string)?.trim() || undefined,
        responsavel: (data.get('responsavel') as string).trim(),
        proximaManutencaoData: proxDataRaw ? new Date(proxDataRaw) : undefined,
      });
      if (result.ok) {
        toast.success('Manutenção registada.');
        form.reset();
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao registar manutenção.');
      }
    });
  }

  function registarChecklist(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const itensValidos = itens.filter((i) => i.nome.trim());
    if (itensValidos.length === 0) {
      toast.error('Adicione pelo menos um item ao checklist.');
      return;
    }

    startTransition(async () => {
      const result = await registarChecklistAction({
        viaturaId,
        dataInspeccao: new Date(data.get('dataInspeccao') as string),
        responsavel: (data.get('responsavel') as string).trim(),
        observacoes: (data.get('observacoes') as string)?.trim() || undefined,
        itens: itensValidos.map((i) => ({ nome: i.nome.trim(), categoria: i.categoria, estado: i.estado })),
      });
      if (result.ok) {
        toast.success('Checklist registado.');
        setItens([{ ...ITEM_VAZIO }]);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao registar checklist.');
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Transições */}
      {transicoes.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="font-medium text-sm">Mudar Estado</p>
            <div className="flex flex-wrap gap-2">
              {transicoes.map((t) => (
                <Button key={t} type="button" size="sm" variant="outline" disabled={pending} onClick={() => transitar(t)}>
                  {STATUS_LABELS[t] ?? t}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Registar manutenção */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <p className="font-medium text-sm">Registar Manutenção</p>
          <form onSubmit={registarManutencao} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="m-tipo">Tipo *</Label>
                <Select name="tipo" defaultValue="PREVENTIVA">
                  <SelectTrigger id="m-tipo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PREVENTIVA">Preventiva</SelectItem>
                    <SelectItem value="CORRECTIVA">Correctiva</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-data">Data *</Label>
                <Input id="m-data" name="data" type="date" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-km">Quilometragem</Label>
                <Input id="m-km" name="quilometragem" type="number" min={0} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-responsavel">Responsável *</Label>
                <Input id="m-responsavel" name="responsavel" required maxLength={200} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-fornecedor">Fornecedor / Oficina</Label>
                <Input id="m-fornecedor" name="fornecedor" maxLength={200} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-custo">Custo (MZN)</Label>
                <Input id="m-custo" name="custo" type="number" min={0} step="0.01" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-prox">Próxima Manutenção</Label>
                <Input id="m-prox" name="proximaManutencaoData" type="date" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-descricao">Descrição *</Label>
              <Textarea id="m-descricao" name="descricao" required maxLength={2000} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-pecas">Peças Substituídas</Label>
              <Textarea id="m-pecas" name="pecasSubstituidas" maxLength={1000} rows={2} />
            </div>
            <Button type="submit" size="sm" disabled={pending}>Registar Manutenção</Button>
          </form>
        </CardContent>
      </Card>

      {/* Registar checklist */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <p className="font-medium text-sm">Registar Inspecção (Checklist)</p>
          <form onSubmit={registarChecklist} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="c-data">Data da Inspecção *</Label>
                <Input id="c-data" name="dataInspeccao" type="date" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-responsavel">Responsável *</Label>
                <Input id="c-responsavel" name="responsavel" required maxLength={200} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Itens *</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setItens((p) => [...p, { ...ITEM_VAZIO }])}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Item
                </Button>
              </div>
              {itens.map((item, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-end border rounded-md p-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome</Label>
                    <Input
                      value={item.nome}
                      onChange={(e) => setItens((p) => p.map((it, i) => (i === idx ? { ...it, nome: e.target.value } : it)))}
                      placeholder="Ex.: Pneus"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Categoria</Label>
                    <Select value={item.categoria} onValueChange={(v) => setItens((p) => p.map((it, i) => (i === idx ? { ...it, categoria: v as ItemChecklist['categoria'] } : it)))}>
                      <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="COMPONENTE">Componente</SelectItem>
                        <SelectItem value="SOBRESSALENTE">Sobressalente</SelectItem>
                        <SelectItem value="ACESSORIO">Acessório</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Estado</Label>
                    <Select value={item.estado} onValueChange={(v) => setItens((p) => p.map((it, i) => (i === idx ? { ...it, estado: v as ItemChecklist['estado'] } : it)))}>
                      <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OK">OK</SelectItem>
                        <SelectItem value="AVARIA">Avaria</SelectItem>
                        <SelectItem value="FALTA">Falta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {itens.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => setItens((p) => p.filter((_, i) => i !== idx))}>
                      <Minus className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c-obs">Observações</Label>
              <Textarea id="c-obs" name="observacoes" maxLength={1000} rows={2} />
            </div>
            <Button type="submit" size="sm" disabled={pending}>Registar Inspecção</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
