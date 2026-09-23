'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DataTable, EmptyState, type TableColumn } from '@/components/patterns';
import { formatarData } from '@/lib/format-date';
import { formatMZN } from '@/lib/format-currency';
import { confirmarCorrespondenciasAction } from '@/server/actions/reconciliacao.actions';
import { REGRA_LABEL, type MovimentoLinha, type SugestaoLinha } from '../../_lib/tipos';
import { Valor } from './colunas';
import { ReverterCorrespondencia } from './rejeitar';

function Lado({ ms }: { ms: MovimentoLinha[] }) {
  return (
    <div className="space-y-1">
      {ms.map((m) => (
        <div key={m.id} className="text-sm">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="tabular-nums text-muted-foreground">{formatarData(m.data)}</span>
            <Valor m={m} />
          </div>
          <div className="text-xs text-muted-foreground line-clamp-1">
            {m.referencia ? `${m.referencia} · ` : ''}
            {m.descricao}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Sugestões do motor por confirmar, com a regra e a confiança à vista.
 * Confirmação em lote; uma sugestão com diferença de valor acima da tolerância
 * só se confirma com justificação (RF §10) — o campo aparece quando é preciso.
 */
export function SugestoesPainel({ sugestoes, nextCursor }: { sugestoes: SugestaoLinha[]; nextCursor: string | null }) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set());
  const [justificacao, setJustificacao] = useState('');

  const todas = escolhidas.size === sugestoes.length && sugestoes.length > 0;
  const alternar = (id: string) =>
    setEscolhidas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const precisaJustificacao = sugestoes.some((s) => escolhidas.has(s.id) && s.exigeJustificacao);
  const justificacaoValida = !precisaJustificacao || justificacao.trim().length >= 10;

  const confirmar = () =>
    iniciar(async () => {
      const r = await confirmarCorrespondenciasAction({
        ids: [...escolhidas],
        ...(precisaJustificacao && { justificacao: justificacao.trim() }),
      });
      if (!r.ok) return void toast.error(r.error.message);
      const { confirmadas, recusadas } = r.data;
      if (confirmadas.length) toast.success(`${confirmadas.length} correspondência(s) confirmada(s).`);
      for (const x of recusadas) toast.error(x.motivo);
      setEscolhidas(new Set());
      setJustificacao('');
      router.refresh();
    });

  const colunas: TableColumn<SugestaoLinha>[] = [
    {
      key: 'escolha',
      label: '',
      className: 'w-8',
      render: (s) => (
        <Checkbox checked={escolhidas.has(s.id)} onCheckedChange={() => alternar(s.id)} aria-label="Escolher sugestão" />
      ),
    },
    {
      key: 'regra',
      label: 'Regra · confiança',
      render: (s) => (
        <div>
          <div className="text-sm font-medium">{REGRA_LABEL[s.regra] ?? s.regra}</div>
          <div className="text-xs tabular-nums text-muted-foreground">
            {s.confianca}% {s.diferencaDias > 0 && `· ${s.diferencaDias} dia(s) de diferença`}
          </div>
        </div>
      ),
    },
    { key: 'banco', label: 'Extracto', render: (s) => <Lado ms={s.banco} /> },
    { key: 'contab', label: 'Contabilidade', render: (s) => <Lado ms={s.contabilidade} /> },
    {
      key: 'dif',
      label: 'Diferença',
      className: 'text-right tabular-nums',
      headerClassName: 'text-right',
      render: (s) =>
        s.diferencaValor === '0' ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className={s.exigeJustificacao ? 'font-semibold text-destructive' : ''}>{formatMZN(s.diferencaValor)}</span>
        ),
    },
    {
      key: 'rejeitar',
      label: '',
      className: 'text-right',
      render: (s) => (
        <ReverterCorrespondencia
          correspondenciaId={s.id}
          rotulo="Rejeitar"
          icone={<X className="h-4 w-4 mr-1" />}
          titulo="Rejeitar esta sugestão?"
          descricao="Os dois movimentos ficam livres e o motor não volta a propor este par. Pode reconciliá-los manualmente depois."
        />
      ),
    },
  ];

  if (sugestoes.length === 0) {
    return <EmptyState title="Sem sugestões por confirmar" description="Execute a reconciliação depois de importar um extracto." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={todas}
            onCheckedChange={() => setEscolhidas(todas ? new Set() : new Set(sugestoes.map((s) => s.id)))}
            aria-label="Escolher todas"
          />
          Todas nesta página
        </label>
        <Button size="sm" className="ml-auto" disabled={aCorrer || escolhidas.size === 0 || !justificacaoValida} onClick={confirmar}>
          <CheckCheck className="h-4 w-4 mr-2" />
          {aCorrer ? 'A confirmar…' : `Confirmar ${escolhidas.size}`}
        </Button>
        {precisaJustificacao && (
          <div className="basis-full space-y-1">
            <Label htmlFor="justificacao-sugestoes">Justificação — há diferenças de valor acima da tolerância</Label>
            <Textarea
              id="justificacao-sugestoes"
              value={justificacao}
              onChange={(e) => setJustificacao(e.target.value)}
              placeholder="Porque aceita a diferença (mínimo 10 caracteres)"
              aria-invalid={!justificacaoValida}
            />
          </div>
        )}
      </div>
      <DataTable data={sugestoes} columns={colunas} nextCursor={nextCursor} cursorParam="cs" />
    </div>
  );
}
