'use client';

/**
 * POSIniciar — abre a sessão POS sobre o caixa aberto do utilizador, sem
 * perguntar nada. Substitui o formulário que pedia o cuid da sessão de caixa.
 *
 * É um Client Component porque a abertura é uma escrita: vai pela server
 * action ao montar e não por um `create` dentro do render do Server
 * Component (que corre duas vezes em desenvolvimento e não é lugar de efeito).
 * Em Strict Mode o efeito também corre duas vezes — a segunda chamada recebe
 * `SESSAO_JA_ABERTA` e é tratada como sucesso.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, MonitorPlay } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { abrirSessaoPOS } from '@/server/actions/vendas.actions';

export function POSIniciar({
  sessaoCaixaId,
  numeroCaixa,
}: {
  sessaoCaixaId: string;
  numeroCaixa: string;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const iniciado = useRef(false);

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    void (async () => {
      const r = await abrirSessaoPOS({ sessaoCaixaId });
      if (r.ok || r.error.code === 'SESSAO_JA_ABERTA') {
        router.refresh();
        return;
      }
      setErro(r.error.message ?? 'Não foi possível iniciar a sessão POS.');
    })();
  }, [sessaoCaixaId, router]);

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 text-center" role="status" aria-live="polite">
        <MonitorPlay className="mx-auto h-12 w-12 text-primary" aria-hidden="true" />
        {erro ? (
          <>
            <h1 className="text-2xl font-bold">Não foi possível iniciar o POS</h1>
            <p className="text-sm text-muted-foreground">{erro}</p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  iniciado.current = false;
                  setErro(null);
                  router.refresh();
                }}
              >
                Tentar de novo
              </Button>
              <Button asChild>
                <Link href="/caixa">Ir ao caixa</Link>
              </Button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">A iniciar o POS…</h1>
            <p className="text-sm text-muted-foreground">
              Sobre a sessão de caixa <span className="font-medium tabular-nums">{numeroCaixa}</span>.
            </p>
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
          </>
        )}
      </div>
    </div>
  );
}
