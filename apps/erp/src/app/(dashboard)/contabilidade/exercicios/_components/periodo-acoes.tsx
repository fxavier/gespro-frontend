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
import { TEXTO_IMPEDIMENTO_FECHO } from '@/lib/textos-recusa-contabilidade';


function textoImpedimento(codigo: string): string {
  return TEXTO_IMPEDIMENTO_FECHO[codigo] ?? `Impedimento desconhecido: ${codigo}`;
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
