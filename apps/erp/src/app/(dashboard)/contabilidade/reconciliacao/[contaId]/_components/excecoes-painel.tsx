'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { EyeOff, Link2, NotebookPen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable, EmptyState, type TableColumn } from '@/components/patterns';
import { definirIgnoradoAction, sugerirLancamentoAction } from '@/server/actions/reconciliacao.actions';
import type { MovimentoLinha } from '../../_lib/tipos';
import { colunasMovimento } from './colunas';

interface Props {
  contaBancariaId: string;
  bancarios: MovimentoLinha[];
  contabilisticos: MovimentoLinha[];
  cursorBanco: string | null;
  cursorContab: string | null;
}

/**
 * As excepções (RF §23): o que o motor não reconciliou com segurança. Daqui o
 * utilizador escolhe movimentos dos dois lados para uma reconciliação manual
 * (rota própria, com justificação), ignora, ou pede a sugestão de lançamento.
 */
export function ExcecoesPainel({ contaBancariaId, bancarios, contabilisticos, cursorBanco, cursorContab }: Props) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const base = `/contabilidade/reconciliacao/${contaBancariaId}`;

  const alternar = (id: string) =>
    setEscolhidos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const b = bancarios.filter((m) => escolhidos.has(m.id)).map((m) => m.id);
  const c = contabilisticos.filter((m) => escolhidos.has(m.id)).map((m) => m.id);

  const ignorar = (m: MovimentoLinha) =>
    iniciar(async () => {
      const r = await definirIgnoradoAction({ lado: m.lado, id: m.id, ignorado: true });
      if (!r.ok) toast.error(r.error.message);
      else {
        toast.success('Movimento ignorado.');
        router.refresh();
      }
    });

  const sugerir = (m: MovimentoLinha) =>
    iniciar(async () => {
      const r = await sugerirLancamentoAction({ movimentoBancarioId: m.id });
      if (!r.ok) return void toast.error(r.error.message);
      if (!r.data) return void toast.info('Nenhuma regra de sugestão se aplica a este movimento.');
      // O movimento está ao meio-dia do dia civil: os componentes locais dão esse dia em qualquer fuso de ±11h.
      const d = new Date(r.data.data);
      const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const q = new URLSearchParams({ data: dia, historico: r.data.historico });
      for (const p of r.data.partidas) q.append('p', `${p.contaId}:${p.tipo}:${p.valor}`);
      router.push(`/contabilidade/lancamentos/novo?${q}`);
    });

  // Recriadas a cada render: dependem da escolha e do estado da transição, e são baratas.
  const escolha: TableColumn<MovimentoLinha> = {
      key: 'escolha',
      label: '',
      className: 'w-8',
      render: (m) =>
        m.correspondenciaId ? null : (
          <Checkbox
            checked={escolhidos.has(m.id)}
            onCheckedChange={() => alternar(m.id)}
            aria-label={`Escolher ${m.descricao}`}
          />
        ),
    };
    const accoes: TableColumn<MovimentoLinha> = {
      key: 'accoes',
      label: '',
      className: 'text-right whitespace-nowrap',
      render: (m) =>
        m.correspondenciaId ? (
          // DIFERENCA_VALOR: reservado por uma sugestão — decide-se lá.
          <Button asChild size="sm" variant="ghost">
            <Link href={`${base}?vista=sugestoes`}>Ver sugestão</Link>
          </Button>
        ) : (
          <div className="flex justify-end gap-1">
            {m.lado === 'BANCO' && m.estado === 'BANCO_SEM_CONTABILIZACAO' && (
              <Button size="sm" variant="ghost" disabled={aCorrer} onClick={() => sugerir(m)}>
                <NotebookPen className="h-4 w-4 mr-1" /> Contabilizar
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={aCorrer} onClick={() => ignorar(m)}>
              <EyeOff className="h-4 w-4 mr-1" /> Ignorar
            </Button>
          </div>
        ),
    };
  const colunas = [escolha, ...colunasMovimento, accoes];

  const vazio = (t: string) => <EmptyState title={t} description="Nada a resolver deste lado." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3">
        <p className="text-sm text-muted-foreground">
          Escolha movimentos dos dois lados para os reconciliar manualmente, com justificação.
        </p>
        <Button
          size="sm"
          disabled={b.length === 0 || c.length === 0}
          onClick={() => router.push(`${base}/manual?b=${b.join(',')}&c=${c.join(',')}`)}
        >
          <Link2 className="h-4 w-4 mr-2" />
          Reconciliar manualmente ({b.length} + {c.length})
        </Button>
      </div>

      <section aria-labelledby="exc-banco" className="space-y-2">
        <h2 id="exc-banco" className="text-sm font-semibold">Extracto bancário</h2>
        <DataTable data={bancarios} columns={colunas} nextCursor={cursorBanco} cursorParam="cb" emptyState={vazio('Sem excepções no extracto')} />
      </section>
      <section aria-labelledby="exc-contab" className="space-y-2">
        <h2 id="exc-contab" className="text-sm font-semibold">Contabilidade</h2>
        <DataTable data={contabilisticos} columns={colunas} nextCursor={cursorContab} cursorParam="cc" emptyState={vazio('Sem excepções na contabilidade')} />
      </section>
    </div>
  );
}
