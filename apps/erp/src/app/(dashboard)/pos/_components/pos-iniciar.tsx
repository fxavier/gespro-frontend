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
 *
 * A abertura falha cedo (ADR-0041 §6): e-mail por confirmar, período de hoje
 * fechado, caixa fechada/de outro utilizador/inexistente. Cada recusa mostra a
 * mensagem do servidor e leva o operador ao sítio onde se resolve.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, MonitorPlay } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { abrirSessaoPOS } from '@/server/actions/vendas.actions';

type Recusa = { titulo: string; mensagem: string; acao: { href: string; rotulo: string } };

const IR_AO_CAIXA = { href: '/caixa/abertura?voltar=/pos', rotulo: 'Abrir o caixa' };

function recusaDe(code: string, message: string | undefined): Recusa {
  const mensagem = message || 'Não foi possível iniciar a sessão POS.';
  switch (code) {
    case 'EMAIL_POR_CONFIRMAR_EMISSAO':
      return {
        titulo: 'Confirme o seu e-mail para vender',
        mensagem,
        acao: { href: '/dashboard', rotulo: 'Ir ao painel' },
      };
    case 'PERIODO_FECHADO':
      return {
        titulo: 'O período contabilístico de hoje está fechado',
        mensagem,
        acao: { href: '/contabilidade/exercicios', rotulo: 'Ver exercícios e períodos' },
      };
    case 'SESSAO_CAIXA_FECHADA':
      return { titulo: 'O caixa já não está aberto', mensagem, acao: IR_AO_CAIXA };
    case 'SESSAO_CAIXA_DE_OUTRO_UTILIZADOR':
      return { titulo: 'Este caixa é de outro utilizador', mensagem, acao: IR_AO_CAIXA };
    case 'NAO_ENCONTRADO':
      return { titulo: 'Sessão de caixa não encontrada', mensagem, acao: IR_AO_CAIXA };
    default:
      return { titulo: 'Não foi possível iniciar o POS', mensagem, acao: { href: '/caixa', rotulo: 'Ir ao caixa' } };
  }
}

export function POSIniciar({
  sessaoCaixaId,
  numeroCaixa,
}: {
  sessaoCaixaId: string;
  numeroCaixa: string;
}) {
  const router = useRouter();
  const [recusa, setRecusa] = useState<Recusa | null>(null);
  const iniciado = useRef(false);

  const iniciar = useCallback(async () => {
    const r = await abrirSessaoPOS({ sessaoCaixaId });
    if (r.ok || r.error.code === 'SESSAO_JA_ABERTA') {
      router.refresh();
      return;
    }
    setRecusa(recusaDe(r.error.code, r.error.message));
  }, [sessaoCaixaId, router]);

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    void iniciar();
  }, [iniciar]);

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 text-center" role="status" aria-live="polite">
        <MonitorPlay className="mx-auto h-12 w-12 text-primary" aria-hidden="true" />
        {recusa ? (
          <>
            <h1 className="text-2xl font-bold">{recusa.titulo}</h1>
            <p className="text-sm text-muted-foreground">{recusa.mensagem}</p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setRecusa(null);
                  void iniciar();
                }}
              >
                Tentar de novo
              </Button>
              <Button asChild>
                <Link href={recusa.acao.href}>{recusa.acao.rotulo}</Link>
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
