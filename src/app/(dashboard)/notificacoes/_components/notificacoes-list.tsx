'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { CheckCheck, Check, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/patterns/empty-state';
import { cn } from '@/lib/utils';
import { marcarNotificacaoLida, marcarTodasNotificacoesLidas } from '@/server/actions/notificacoes.actions';
import type { NotificacaoListItem } from '@/server/services/plataforma/notificacao.interface';

const TIPO_ICONE: Record<string, string> = {
  DOCUMENTO_EXPIRADO: 'Documento expirado',
  DOCUMENTO_PROXIMO_EXPIRAR: 'Documento a expirar',
  MANUTENCAO_PENDENTE: 'Manutenção pendente',
  RESET_PASSWORD: 'Recuperação de palavra-passe',
  CONVITE_UTILIZADOR: 'Convite de utilizador',
  ALERTA_SISTEMA: 'Alerta do sistema',
};

interface NotificacoesListProps {
  items: NotificacaoListItem[];
  nextCursor: string | null;
  temNaoLidas: boolean;
}

function NotificacaoItem({ item }: { item: NotificacaoListItem }) {
  const [isPending, startTransition] = useTransition();

  function handleMarcarLida() {
    startTransition(async () => {
      await marcarNotificacaoLida({ id: item.id });
    });
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 border-b last:border-b-0 transition-colors',
        !item.lida && 'bg-primary/5',
        isPending && 'opacity-50',
      )}
    >
      {/* Indicador de não-lida */}
      <div className="mt-1 flex-shrink-0">
        {!item.lida ? (
          <span className="inline-block h-2 w-2 rounded-full bg-primary" aria-label="Não lida" />
        ) : (
          <span className="inline-block h-2 w-2 rounded-full bg-muted" aria-hidden="true" />
        )}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-medium', !item.lida && 'font-semibold')}>
          {item.titulo}
        </p>
        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
          {item.mensagem}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-xs text-muted-foreground">
            {TIPO_ICONE[item.tipo] ?? item.tipo}
          </span>
          <span className="text-xs text-muted-foreground">·</span>
          <time className="text-xs text-muted-foreground" dateTime={item.createdAt.toISOString()}>
            {new Date(item.createdAt).toLocaleString('pt-PT', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
        </div>
      </div>

      {/* Acção marcar lida */}
      {!item.lida && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0"
          onClick={handleMarcarLida}
          disabled={isPending}
          aria-label="Marcar como lida"
          title="Marcar como lida"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}

/**
 * Lista de notificações — Client Component folha.
 * Recebe dados do Server Component pai; mutações via Server Actions.
 */
export function NotificacoesList({ items, nextCursor: _nextCursor, temNaoLidas }: NotificacoesListProps) {
  const [isPending, startTransition] = useTransition();

  function handleMarcarTodasLidas() {
    startTransition(async () => {
      await marcarTodasNotificacoesLidas(undefined);
    });
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Bell className="h-8 w-8" />}
        title="Sem notificações"
        description="Não tem notificações por ler."
      />
    );
  }

  return (
    <div className="space-y-0">
      {/* Acção global */}
      {temNaoLidas && (
        <div className="flex justify-end p-3 border-b bg-muted/30">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground hover:text-foreground"
            onClick={handleMarcarTodasLidas}
            disabled={isPending}
          >
            <CheckCheck className="h-4 w-4" aria-hidden="true" />
            Marcar todas como lidas
          </Button>
        </div>
      )}

      {/* Lista */}
      <div className="divide-y divide-border">
        {items.map((item) => (
          <NotificacaoItem key={item.id} item={item} />
        ))}
      </div>

      {/* Preferências */}
      <div className="p-4 border-t bg-muted/20 text-center">
        <Link
          href="/notificacoes/preferencias"
          className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          Gerir preferências de notificação
        </Link>
      </div>
    </div>
  );
}
