'use client';

/**
 * Botões de acção por período (Fechar / Reabrir).
 *
 * Fechar: acção directa; mostra todos os impedimentos de uma vez se falhar
 * (ADR-0033 §6 — nunca «um impedimento por tentativa»).
 *
 * Reabrir: navega para rota dedicada (exige motivo escrito).
 *
 * Textos dos impedimentos: legíveis por utilizador, não os códigos internos.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Lock, LockOpen, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fecharPeriodo } from '@/server/actions/contabilidade.actions';

// ─────────────────────────────────────────────────────────────────────────────
// Textos legíveis por código de impedimento (ADR-0033 §6)
// ─────────────────────────────────────────────────────────────────────────────

const TEXTO_IMPEDIMENTO: Record<string, string> = {
  RASCUNHOS_NO_PERIODO:
    'Existem lançamentos em rascunho no período. Confirme ou elimine todos os rascunhos antes de fechar.',
  SESSAO_CAIXA_ABERTA:
    'Existe pelo menos uma sessão de caixa aberta com abertura neste período. Feche a sessão de caixa antes de fechar o período.',
  RECONCILIACAO_EM_ANDAMENTO:
    'Existe uma reconciliação bancária em curso que abrange datas deste período. Conclua ou cancele a reconciliação primeiro.',
  DOCUMENTO_SEM_LANCAMENTO:
    'Existem facturas, notas de crédito ou notas de débito emitidas neste período sem o lançamento contabilístico correspondente. Registe os lançamentos em falta.',
  BALANCETE_DESEQUILIBRADO:
    'O balancete do período não está equilibrado — o total dos débitos é diferente do total dos créditos. Corrija os lançamentos antes de fechar.',
  PERIODO_ANTERIOR_ABERTO:
    'O período anterior ainda está aberto. O fecho tem de ser feito por ordem: feche o mês anterior primeiro.',
  IVA_NAO_APURADO:
    'O apuramento do IVA do período ainda não foi executado. Apure o IVA em Contabilidade → Apuramento de IVA antes de fechar o período.',
};

function textoImpedimento(codigo: string): string {
  return TEXTO_IMPEDIMENTO[codigo] ?? `Impedimento desconhecido: ${codigo}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente do botão Fechar
// ─────────────────────────────────────────────────────────────────────────────

function FecharPeriodoButton({ periodoId }: { periodoId: string }) {
  const [aCorrer, iniciarTransicao] = useTransition();
  const [impedimentos, setImpedimentos] = useState<string[]>([]);
  const router = useRouter();

  function fechar() {
    setImpedimentos([]);
    iniciarTransicao(async () => {
      const res = await fecharPeriodo({ id: periodoId });
      if (!res.ok) {
        toast.error('Não foi possível fechar o período');
        return;
      }
      const resultado = res.data;
      if (!resultado) return;
      if (!resultado.ok) {
        setImpedimentos(resultado.impedimentos ?? []);
        return;
      }
      toast.success('Período fechado');
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="outline"
        onClick={fechar}
        disabled={aCorrer}
        className="w-full sm:w-auto"
      >
        {aCorrer ? (
          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
        ) : (
          <Lock className="h-3.5 w-3.5 mr-1.5" />
        )}
        Fechar período
      </Button>
      {impedimentos.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="font-medium text-destructive">
              {impedimentos.length === 1
                ? '1 impedimento para fechar'
                : `${impedimentos.length} impedimentos para fechar`}
            </p>
          </div>
          <ul className="space-y-1 pl-6">
            {impedimentos.map((c) => (
              <li key={c} className="text-muted-foreground list-disc">
                {textoImpedimento(c)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente exportado — mostra Fechar ou Reabrir conforme o estado
// ─────────────────────────────────────────────────────────────────────────────

interface PeriodoAcoesProps {
  periodoId: string;
  estado: 'ABERTO' | 'FECHADO' | string;
}

export function PeriodoAcoes({ periodoId, estado }: PeriodoAcoesProps) {
  if (estado === 'ABERTO') {
    return <FecharPeriodoButton periodoId={periodoId} />;
  }

  if (estado === 'FECHADO') {
    return (
      <Button asChild size="sm" variant="ghost">
        <Link href={`/contabilidade/exercicios/periodos/${periodoId}/reabrir`}>
          <LockOpen className="h-3.5 w-3.5 mr-1.5" />
          Reabrir
        </Link>
      </Button>
    );
  }

  return null;
}
