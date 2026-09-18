import Link from 'next/link';
import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LEITURA_DIAS } from '@/lib/state-machines';

/**
 * Faixa de modo de leitura — Server Component, visível em TODAS as páginas do
 * painel (ADR-0027 §6, ADR-0032).
 *
 * ## Porquê no shell e não só no `/dashboard`
 *
 * O aviso de e-mail por confirmar vive no `/dashboard` porque trava dois actos
 * nomeados, que a pessoa pratica em sítios previsíveis. A Leitura trava
 * **tudo o que grava**, em qualquer ecrã: quem só usa o POS ou a facturação
 * pode nunca abrir o painel, e descobriria o bloqueio ao carregar em Gravar.
 *
 * ## Porquê uma faixa e não botões desactivados
 *
 * O `PageHeader` recebe `actions` como `ReactNode` livre em 240 sítios — e é no
 * mesmo bloco que vivem os botões de **Exportar**. Desactivar o bloco inteiro
 * bloquearia exactamente o que tem de continuar a passar. O que escapar falha
 * com `ACESSO_LEITURA`, que tem mensagem própria.
 *
 * Não é dispensável: fechá-la esconderia a única explicação para a próxima
 * recusa. Não é um modal, pela mesma razão de sempre — o ecrã continua todo
 * utilizável, que é o ponto do estado.
 */
export function FaixaLeitura({ diasRestantes }: { diasRestantes: number }) {
  const prazo =
    diasRestantes > 0
      ? `Faltam ${diasRestantes} ${diasRestantes === 1 ? 'dia' : 'dias'} para o acesso fechar.`
      : 'O acesso fecha hoje.';

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-accent px-4 py-2.5 sm:px-6"
    >
      <p className="flex min-w-0 items-center gap-2 text-sm text-foreground">
        <Eye className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span>
          <span className="font-medium">Modo de leitura.</span>{' '}
          Pode consultar e exportar tudo o que é seu; não pode gravar. {prazo}{' '}
          <span className="text-muted-foreground">
            Os dados não se apagam — são seus, mesmo depois de o acesso fechar.
          </span>
        </span>
      </p>
      <Button asChild size="sm" className="shrink-0">
        <Link href="/definicoes/faturacao">Subscrever um plano</Link>
      </Button>
    </div>
  );
}

/** Dias de leitura, para quem quiser explicar o prazo sem o importar de novo. */
export const DIAS_DE_LEITURA = LEITURA_DIAS;
