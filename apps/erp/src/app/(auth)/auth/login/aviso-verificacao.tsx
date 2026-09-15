'use client';

/**
 * Desfecho da confirmação de e-mail, no ecrã de login.
 *
 * `GET /api/publico/verificar-email` responde sempre com um 303 e um
 * `?verificacao=…`; quando quem abre a ligação NÃO tem sessão — o caso mais
 * comum, porque a ligação chega por correio e abre-se muitas vezes noutro
 * dispositivo — o destino é `/auth/login`. Até aqui ninguém lia esse
 * parâmetro: a pessoa confirmava o endereço e aterrava num ecrã mudo, sem
 * saber se tinha resultado. É isso que este componente resolve.
 *
 * `useSearchParams` obriga a uma fronteira `<Suspense>` acima, senão o
 * prerender do build de produção parte (CLAUDE.md). Ela está em `page.tsx`.
 */

import { useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

type Desfecho = 'ok' | 'expirada' | 'invalida' | 'erro' | 'limitada';

interface Aviso {
  tom: 'bom' | 'mau';
  texto: string;
}

const AVISOS: Record<Desfecho, Aviso> = {
  ok: {
    tom: 'bom',
    texto:
      'Endereço confirmado. Inicie sessão para continuar — já pode emitir documentos e convidar colegas.',
  },
  expirada: {
    tom: 'mau',
    texto:
      'A ligação de confirmação expirou (é válida 24 horas). Inicie sessão e peça uma nova a partir do aviso no painel.',
  },
  invalida: {
    tom: 'mau',
    texto:
      'A ligação de confirmação não é válida. Inicie sessão e peça uma nova a partir do aviso no painel.',
  },
  erro: {
    tom: 'mau',
    texto:
      'Não foi possível confirmar o endereço neste momento. Inicie sessão e tente de novo a partir do aviso no painel.',
  },
  limitada: {
    tom: 'mau',
    texto: 'Demasiadas tentativas de confirmação. Aguarde alguns minutos e abra a ligação outra vez.',
  },
};

function desfechoDe(valor: string | null): Desfecho | null {
  return valor !== null && valor in AVISOS ? (valor as Desfecho) : null;
}

export function AvisoVerificacao() {
  const desfecho = desfechoDe(useSearchParams().get('verificacao'));
  if (!desfecho) return null;

  const aviso = AVISOS[desfecho];
  const bom = aviso.tom === 'bom';

  return (
    <div
      role="status"
      data-desfecho={desfecho}
      className={
        bom
          ? 'flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground'
          : 'flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'
      }
    >
      {bom ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span>{aviso.texto}</span>
    </div>
  );
}

/** Exportado para o teste que guarda a cobertura dos cinco desfechos. */
export const DESFECHOS_VERIFICACAO = Object.keys(AVISOS) as Desfecho[];
