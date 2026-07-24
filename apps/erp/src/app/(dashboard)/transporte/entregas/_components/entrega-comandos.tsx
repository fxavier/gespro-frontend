'use client';

/**
 * Comandos operacionais da Entrega — Client Component (folha).
 * Liga às actions existentes: atribuirRecursosEntregaAction, transitarEntregaAction,
 * registarProvaEntregaAction. Mostra apenas transições válidas (TRANSICOES_ENTREGA
 * de state-machines.ts, client-safe). Sem Dialog — inline.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Truck, XCircle, AlertTriangle, CheckCircle, Users } from 'lucide-react';
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
import { TRANSICOES_ENTREGA } from '@/lib/state-machines';
import { STATUS_LABELS } from '@/components/patterns';
import {
  atribuirRecursosEntregaAction,
  transitarEntregaAction,
  registarProvaEntregaAction,
} from '@/server/actions/transporte.actions';

interface Opcao {
  id: string;
  label: string;
}

interface EntregaComandosProps {
  entregaId: string;
  estado: string;
  viaturaId: string | null;
  motoristaId: string | null;
  rotaId: string | null;
  viaturas: Opcao[];
  motoristas: Opcao[];
  rotas: Opcao[];
}

const SEM = '__sem__';

export function EntregaComandos({
  entregaId,
  estado,
  viaturaId,
  motoristaId,
  rotaId,
  viaturas,
  motoristas,
  rotas,
}: EntregaComandosProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [alvo, setAlvo] = useState<string | null>(null);
  const [motivoFalha, setMotivoFalha] = useState('');
  const [recebedor, setRecebedor] = useState('');
  const [tipoProva, setTipoProva] = useState<'ASSINATURA' | 'FOTO' | 'CODIGO'>('ASSINATURA');
  const [dadosProva, setDadosProva] = useState('');

  const transicoes = TRANSICOES_ENTREGA[estado] ?? [];
  const permiteAtribuir = estado === 'PENDENTE' || estado === 'AGENDADA' || estado === 'FALHADA';

  function refrescar() {
    setAlvo(null);
    setMotivoFalha('');
    setRecebedor('');
    setDadosProva('');
    router.refresh();
  }

  function atribuir(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const v = data.get('viaturaId') as string;
    const m = data.get('motoristaId') as string;
    const r = data.get('rotaId') as string;

    startTransition(async () => {
      const result = await atribuirRecursosEntregaAction({
        entregaId,
        viaturaId: v && v !== SEM ? v : null,
        motoristaId: m && m !== SEM ? m : null,
        rotaId: r && r !== SEM ? r : null,
      });
      if (result.ok) {
        toast.success('Recursos atribuídos.');
        refrescar();
      } else {
        toast.error(result.error.message ?? 'Erro ao atribuir recursos.');
      }
    });
  }

  function transitarSimples(estadoAlvo: string) {
    startTransition(async () => {
      const result = await transitarEntregaAction({
        entregaId,
        estadoAlvo: estadoAlvo as 'AGENDADA' | 'EM_TRANSITO' | 'CANCELADA',
      });
      if (result.ok) {
        toast.success(`Entrega em estado ${STATUS_LABELS[estadoAlvo] ?? estadoAlvo}.`);
        refrescar();
      } else {
        toast.error(result.error.message ?? 'Transição inválida.');
      }
    });
  }

  function marcarFalhada() {
    if (!motivoFalha.trim()) {
      toast.error('Indique o motivo da falha.');
      return;
    }
    startTransition(async () => {
      const result = await transitarEntregaAction({
        entregaId,
        estadoAlvo: 'FALHADA',
        motivoFalha: motivoFalha.trim(),
      });
      if (result.ok) {
        toast.success('Entrega marcada como falhada.');
        refrescar();
      } else {
        toast.error(result.error.message ?? 'Transição inválida.');
      }
    });
  }

  function registarProva() {
    if (!recebedor.trim() || !dadosProva.trim()) {
      toast.error('Recebedor e dados da prova são obrigatórios.');
      return;
    }
    startTransition(async () => {
      const result = await registarProvaEntregaAction({
        entregaId,
        tipo: tipoProva,
        dados: dadosProva.trim(),
        recebedor: recebedor.trim(),
        dataHora: new Date(),
      });
      if (result.ok) {
        toast.success('Prova de entrega registada. Entrega concluída.');
        refrescar();
      } else {
        toast.error(result.error.message ?? 'Erro ao registar prova.');
      }
    });
  }

  if (transicoes.length === 0 && !permiteAtribuir) {
    return (
      <p className="text-sm text-muted-foreground">
        Sem ações disponíveis neste estado.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Atribuição de recursos */}
      {permiteAtribuir && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <p className="flex items-center gap-2 font-medium text-sm">
              <Users className="h-4 w-4" /> Atribuir Recursos
            </p>
            <form onSubmit={atribuir} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cmd-viatura">Viatura</Label>
                  <Select name="viaturaId" defaultValue={viaturaId ?? SEM}>
                    <SelectTrigger id="cmd-viatura"><SelectValue placeholder="Sem viatura" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM}>Sem viatura</SelectItem>
                      {viaturas.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cmd-motorista">Motorista</Label>
                  <Select name="motoristaId" defaultValue={motoristaId ?? SEM}>
                    <SelectTrigger id="cmd-motorista"><SelectValue placeholder="Sem motorista" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM}>Sem motorista</SelectItem>
                      {motoristas.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cmd-rota">Rota</Label>
                  <Select name="rotaId" defaultValue={rotaId ?? SEM}>
                    <SelectTrigger id="cmd-rota"><SelectValue placeholder="Sem rota" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM}>Sem rota</SelectItem>
                      {rotas.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" size="sm" variant="outline" disabled={pending}>
                Guardar Recursos
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Transições de estado */}
      {transicoes.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <p className="font-medium text-sm">Mudar Estado</p>
            <div className="flex flex-wrap gap-2">
              {transicoes.map((t) => {
                const isSelected = alvo === t;
                return (
                  <Button
                    key={t}
                    type="button"
                    size="sm"
                    variant={isSelected ? 'default' : 'outline'}
                    disabled={pending}
                    onClick={() => {
                      if (t === 'EM_TRANSITO' || t === 'AGENDADA') {
                        transitarSimples(t);
                      } else {
                        setAlvo(isSelected ? null : t);
                      }
                    }}
                  >
                    {t === 'EM_TRANSITO' && <Truck className="h-3.5 w-3.5 mr-1.5" />}
                    {t === 'ENTREGUE' && <CheckCircle className="h-3.5 w-3.5 mr-1.5" />}
                    {t === 'FALHADA' && <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />}
                    {t === 'CANCELADA' && <XCircle className="h-3.5 w-3.5 mr-1.5" />}
                    {STATUS_LABELS[t] ?? t}
                  </Button>
                );
              })}
            </div>

            {/* Prova de entrega → ENTREGUE */}
            {alvo === 'ENTREGUE' && (
              <div className="space-y-3 rounded-md border p-4">
                <p className="text-sm font-medium">Prova de Entrega</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="prova-recebedor">Recebedor *</Label>
                    <Input id="prova-recebedor" value={recebedor} onChange={(e) => setRecebedor(e.target.value)} maxLength={200} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="prova-tipo">Tipo de Prova *</Label>
                    <Select value={tipoProva} onValueChange={(v) => setTipoProva(v as typeof tipoProva)}>
                      <SelectTrigger id="prova-tipo"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ASSINATURA">Assinatura</SelectItem>
                        <SelectItem value="FOTO">Foto</SelectItem>
                        <SelectItem value="CODIGO">Código</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prova-dados">
                    {tipoProva === 'CODIGO' ? 'Código de Confirmação *' : tipoProva === 'FOTO' ? 'Referência da Foto *' : 'Nome/Assinatura *'}
                  </Label>
                  <Input id="prova-dados" value={dadosProva} onChange={(e) => setDadosProva(e.target.value)} />
                </div>
                <Button type="button" size="sm" disabled={pending} onClick={registarProva}>
                  {pending ? 'A registar…' : 'Confirmar Entrega'}
                </Button>
              </div>
            )}

            {/* Motivo de falha → FALHADA */}
            {alvo === 'FALHADA' && (
              <div className="space-y-3 rounded-md border p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="motivo-falha">Motivo da Falha *</Label>
                  <Textarea id="motivo-falha" value={motivoFalha} onChange={(e) => setMotivoFalha(e.target.value)} maxLength={500} rows={2} />
                </div>
                <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={marcarFalhada}>
                  {pending ? 'A guardar…' : 'Marcar como Falhada'}
                </Button>
              </div>
            )}

            {/* Cancelar */}
            {alvo === 'CANCELADA' && (
              <div className="space-y-3 rounded-md border p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="motivo-cancel">Motivo do Cancelamento</Label>
                  <Textarea id="motivo-cancel" value={motivoFalha} onChange={(e) => setMotivoFalha(e.target.value)} maxLength={500} rows={2} />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await transitarEntregaAction({
                        entregaId,
                        estadoAlvo: 'CANCELADA',
                        motivoFalha: motivoFalha.trim() || undefined,
                      });
                      if (result.ok) {
                        toast.success('Entrega cancelada.');
                        refrescar();
                      } else {
                        toast.error(result.error.message ?? 'Transição inválida.');
                      }
                    })
                  }
                >
                  {pending ? 'A cancelar…' : 'Confirmar Cancelamento'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
