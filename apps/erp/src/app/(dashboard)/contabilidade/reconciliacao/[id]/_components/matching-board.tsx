'use client';

/**
 * Workspace de matching da reconciliação bancária — duas colunas
 * (razão contabilístico | extracto bancário), conciliação manual e por pares,
 * auto-match, conclusão e cancelamento. Sem modais (AlertDialog só para
 * confirmação destrutiva/terminal).
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { CheckCheck, Download, FileUp, Link2, RefreshCw, Undo2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { StatusBadge, EmptyState } from '@/components/patterns';
import {
  marcarItemReconciliado,
  sugerirMatches,
  gerarItensRazao,
  concluirReconciliacao,
  cancelarReconciliacao,
} from '@/server/actions/contabilidade.actions';

// Tipos serializados (Decimal→string, Date→ISO) — SC → CC
export interface ItemSerializado {
  id: string;
  tipo: 'LANCAMENTO_CONTABIL' | 'EXTRATO_BANCARIO';
  data: string;
  descricao: string;
  valor: string;
  tipoMovimento: 'DEBITO' | 'CREDITO';
  conciliado: boolean;
  itemParId: string | null;
  extratoReferencia: string | null;
}

export interface ReconciliacaoSerializada {
  id: string;
  status: 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';
  dataInicio: string;
  dataFim: string;
  saldoInicialBanco: string;
  saldoFinalBanco: string;
  saldoInicialContabil: string;
  saldoFinalContabil: string;
  diferencaNaoConciliada: string;
  observacoes: string | null;
  contaLabel: string;
  itensRazao: ItemSerializado[];
  itensExtrato: ItemSerializado[];
}

interface SugestaoUI {
  itemRazaoId: string;
  itemExtratoId: string;
  valor: string;
  diasDiferenca: number;
}

const fmtMZN = new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' });
const fmtValor = (s: string) => fmtMZN.format(Number(s));
const fmtData = (iso: string) => new Date(iso).toLocaleDateString('pt-PT');

function ColunaItens({
  titulo,
  descricao,
  itens,
  selecionados,
  emAndamento,
  onToggleSelecao,
  onDesconciliar,
  pending,
}: {
  titulo: string;
  descricao: string;
  itens: ItemSerializado[];
  selecionados: Set<string>;
  emAndamento: boolean;
  onToggleSelecao: (id: string) => void;
  onDesconciliar: (id: string) => void;
  pending: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{titulo}</CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {itens.length === 0 ? (
          <EmptyState title="Sem itens" description="Nenhum item nesta coluna." />
        ) : (
          <ul className="divide-y">
            {itens.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                {emAndamento && !item.conciliado ? (
                  <Checkbox
                    checked={selecionados.has(item.id)}
                    onCheckedChange={() => onToggleSelecao(item.id)}
                    aria-label={`Seleccionar ${item.descricao}`}
                  />
                ) : (
                  <span className="w-4" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.descricao}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtData(item.data)}
                    {item.extratoReferencia ? ` · ${item.extratoReferencia}` : ''}
                  </p>
                </div>
                <span
                  className={`tabular-nums font-medium ${
                    item.tipoMovimento === 'DEBITO' ? 'text-success' : 'text-destructive'
                  }`}
                >
                  {item.tipoMovimento === 'DEBITO' ? '+' : '−'}
                  {fmtValor(item.valor)}
                </span>
                {item.conciliado ? (
                  <span className="flex items-center gap-1">
                    <StatusBadge status="CONCILIADO" label="Conciliado" variant="success" />
                    {emAndamento && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        disabled={pending}
                        onClick={() => onDesconciliar(item.id)}
                        aria-label="Desconciliar item"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </span>
                ) : (
                  <StatusBadge status="PENDENTE" label="Por conciliar" />
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function MatchingBoard({ rec }: { rec: ReconciliacaoSerializada }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [sugestoes, setSugestoes] = useState<SugestaoUI[] | null>(null);
  const [observacoes, setObservacoes] = useState(rec.observacoes ?? '');

  const emAndamento = rec.status === 'EM_ANDAMENTO';
  const todosItens = useMemo(
    () => new Map([...rec.itensRazao, ...rec.itensExtrato].map((i) => [i.id, i])),
    [rec.itensRazao, rec.itensExtrato],
  );

  const toggleSelecao = (id: string) => {
    setSelecionados((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  };

  const executar = (fn: () => Promise<void>) => {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  };

  const conciliarSelecao = () =>
    executar(async () => {
      const ids = Array.from(selecionados);
      const razao = ids.filter((id) => todosItens.get(id)?.tipo === 'LANCAMENTO_CONTABIL');
      const extrato = ids.filter((id) => todosItens.get(id)?.tipo === 'EXTRATO_BANCARIO');

      if (razao.length === 1 && extrato.length === 1) {
        const res = await marcarItemReconciliado({
          reconciliacaoId: rec.id,
          itemId: razao[0],
          conciliado: true,
          itemParId: extrato[0],
        });
        if (!res.ok) return void toast.error(res.error.message);
        toast.success('Par conciliado.');
      } else {
        for (const itemId of ids) {
          const res = await marcarItemReconciliado({ reconciliacaoId: rec.id, itemId, conciliado: true });
          if (!res.ok) return void toast.error(res.error.message);
        }
        toast.success(`${ids.length} item(ns) conciliado(s).`);
      }
      setSelecionados(new Set());
    });

  const desconciliar = (itemId: string) =>
    executar(async () => {
      const res = await marcarItemReconciliado({ reconciliacaoId: rec.id, itemId, conciliado: false });
      if (!res.ok) return void toast.error(res.error.message);
      toast.success('Item desconciliado.');
    });

  const autoMatch = () =>
    executar(async () => {
      const res = await sugerirMatches({ reconciliacaoId: rec.id, janelaDias: 3 });
      if (!res.ok) return void toast.error(res.error.message);
      setSugestoes(res.data);
      if (res.data.length === 0) toast.info('Sem sugestões de conciliação automática.');
    });

  const aplicarSugestao = (s: SugestaoUI) =>
    executar(async () => {
      const res = await marcarItemReconciliado({
        reconciliacaoId: rec.id,
        itemId: s.itemRazaoId,
        conciliado: true,
        itemParId: s.itemExtratoId,
      });
      if (!res.ok) return void toast.error(res.error.message);
      setSugestoes((prev) => prev?.filter((x) => x.itemRazaoId !== s.itemRazaoId) ?? null);
      toast.success('Sugestão aplicada.');
    });

  const aplicarTodas = () =>
    executar(async () => {
      for (const s of sugestoes ?? []) {
        const res = await marcarItemReconciliado({
          reconciliacaoId: rec.id,
          itemId: s.itemRazaoId,
          conciliado: true,
          itemParId: s.itemExtratoId,
        });
        if (!res.ok) return void toast.error(res.error.message);
      }
      toast.success('Todas as sugestões aplicadas.');
      setSugestoes(null);
    });

  const regenerarItens = () =>
    executar(async () => {
      const res = await gerarItensRazao({ reconciliacaoId: rec.id });
      if (!res.ok) return void toast.error(res.error.message);
      toast.success(
        res.data.criados > 0
          ? `${res.data.criados} item(ns) do razão gerado(s).`
          : 'Sem lançamentos novos no intervalo.',
      );
    });

  const concluir = () =>
    executar(async () => {
      const res = await concluirReconciliacao({
        id: rec.id,
        observacoes: observacoes.trim() || undefined,
      });
      if (!res.ok) return void toast.error(res.error.message);
      toast.success('Reconciliação concluída.');
    });

  const cancelar = () =>
    executar(async () => {
      const res = await cancelarReconciliacao({ id: rec.id });
      if (!res.ok) return void toast.error(res.error.message);
      toast.success('Reconciliação cancelada.');
      router.push('/contabilidade/reconciliacao');
    });

  const diferencaZero = Number(rec.diferencaNaoConciliada) === 0;

  return (
    <div className="space-y-6">
      {/* Barra de acções */}
      <div className="flex flex-wrap items-center gap-2">
        {emAndamento && (
          <>
            <Button size="sm" onClick={conciliarSelecao} disabled={isPending || selecionados.size === 0}>
              <Link2 className="mr-1.5 h-4 w-4" />
              Conciliar selecção ({selecionados.size})
            </Button>
            <Button size="sm" variant="outline" onClick={autoMatch} disabled={isPending}>
              <Wand2 className="mr-1.5 h-4 w-4" />
              Auto-match
            </Button>
            <Button size="sm" variant="outline" onClick={regenerarItens} disabled={isPending}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              Regenerar razão
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/contabilidade/reconciliacao/${rec.id}/importar`}>
                <FileUp className="mr-1.5 h-4 w-4" />
                Importar extracto
              </Link>
            </Button>
          </>
        )}
        <Button asChild size="sm" variant="outline">
          <a href={`/api/contabilidade/reconciliacao/${rec.id}/export?formato=csv`}>
            <Download className="mr-1.5 h-4 w-4" />
            CSV
          </a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href={`/api/contabilidade/reconciliacao/${rec.id}/export?formato=pdf`}>
            <Download className="mr-1.5 h-4 w-4" />
            PDF
          </a>
        </Button>
      </div>

      {/* Sugestões de auto-match */}
      {sugestoes && sugestoes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Sugestões de conciliação</CardTitle>
                <CardDescription>
                  Pares razão ↔ extracto com o mesmo valor e tipo de movimento (janela de 3 dias)
                </CardDescription>
              </div>
              <Button size="sm" onClick={aplicarTodas} disabled={isPending}>
                <CheckCheck className="mr-1.5 h-4 w-4" />
                Aplicar todas ({sugestoes.length})
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {sugestoes.map((s) => {
                const razao = todosItens.get(s.itemRazaoId);
                const extrato = todosItens.get(s.itemExtratoId);
                return (
                  <li key={s.itemRazaoId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate">
                        <span className="font-medium">{razao?.descricao}</span>
                        <span className="mx-1.5 text-muted-foreground">↔</span>
                        <span className="font-medium">{extrato?.descricao}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmtValor(s.valor)} · diferença de {s.diasDiferenca} dia(s)
                      </p>
                    </div>
                    <Button size="sm" variant="outline" disabled={isPending} onClick={() => aplicarSugestao(s)}>
                      Aplicar
                    </Button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Duas colunas: razão | extracto */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ColunaItens
          titulo="Razão contabilístico"
          descricao="Partidas da conta no período (lançamentos LANCADO)"
          itens={rec.itensRazao}
          selecionados={selecionados}
          emAndamento={emAndamento}
          onToggleSelecao={toggleSelecao}
          onDesconciliar={desconciliar}
          pending={isPending}
        />
        <ColunaItens
          titulo="Extracto bancário"
          descricao="Linhas importadas do extracto do banco"
          itens={rec.itensExtrato}
          selecionados={selecionados}
          emAndamento={emAndamento}
          onToggleSelecao={toggleSelecao}
          onDesconciliar={desconciliar}
          pending={isPending}
        />
      </div>

      {/* Fecho */}
      {emAndamento && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Concluir reconciliação</CardTitle>
            <CardDescription>
              {diferencaZero
                ? 'Diferença não conciliada é zero — pode concluir.'
                : `Diferença não conciliada de ${fmtValor(rec.diferencaNaoConciliada)} — justifique nas observações para concluir.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Observações / justificação da diferença residual"
              rows={2}
              maxLength={1000}
            />
            <div className="flex items-center gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" disabled={isPending || (!diferencaZero && observacoes.trim().length === 0)}>
                    Concluir reconciliação
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Concluir a reconciliação?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Após concluída, a reconciliação e os seus itens ficam imutáveis. Correcções
                      exigem uma nova reconciliação.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Voltar</AlertDialogCancel>
                    <AlertDialogAction onClick={concluir}>Concluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" disabled={isPending}>
                    Cancelar reconciliação
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancelar a reconciliação?</AlertDialogTitle>
                    <AlertDialogDescription>
                      O estado passa a CANCELADA (terminal). Os itens permanecem para auditoria.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Voltar</AlertDialogCancel>
                    <AlertDialogAction onClick={cancelar}>Cancelar reconciliação</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
