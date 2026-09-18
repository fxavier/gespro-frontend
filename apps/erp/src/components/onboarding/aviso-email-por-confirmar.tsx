'use client';

import { useState, useTransition } from 'react';
import { MailWarning, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { reenviarVerificacaoEmail } from '@/server/actions/verificacao-email.actions';

/**
 * Aviso persistente de endereço por confirmar (ADR-0031 §5, tarefa 4.5).
 *
 * Persistente e não dispensável: enquanto o endereço não estiver confirmado,
 * duas operações estão travadas (emitir documentos fiscais e criar
 * utilizadores) e a pessoa tem de saber porquê ANTES de bater contra elas.
 * Um aviso que se fecha seria lido uma vez e esquecido até à primeira recusa.
 *
 * Não é um modal: o ecrã continua todo utilizável — é o ponto do ADR-0031
 * (entrar e explorar sem depender do correio). O botão reenvia; a resposta
 * aparece no próprio aviso e num toast.
 *
 * O endereço NÃO é passado como propriedade: o reenvio lê-o em Postgres a
 * partir do `userId` da sessão. Menos um sítio por onde PII atravessa a
 * fronteira servidor→cliente, e menos um parâmetro que alguém possa julgar
 * que o cliente escolhe.
 */
export function AvisoEmailPorConfirmar({ desfecho }: { desfecho?: string }) {
  const [pendente, iniciar] = useTransition();
  const [reenviado, setReenviado] = useState(false);

  function reenviar() {
    iniciar(async () => {
      const r = await reenviarVerificacaoEmail(undefined);
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      setReenviado(true);
      toast.success('Ligação enviada. Verifique a sua caixa de correio.');
    });
  }

  // Quem acaba de voltar da ligação e AINDA vê este aviso não está a ver um
  // erro: a sessão só relê o estado na re-resolução do ADR-0011. Dizê-lo aqui
  // evita o reenvio inútil que, sem esta frase, toda a gente faria.
  const acabouDeConfirmar = desfecho === 'ok';
  const expirou = desfecho === 'expirada';

  return (
    <Alert>
      {acabouDeConfirmar ? (
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
      ) : (
        <MailWarning className="h-4 w-4" aria-hidden="true" />
      )}
      <AlertTitle>
        {acabouDeConfirmar
          ? 'Endereço confirmado — a sessão actualiza-se dentro de minutos'
          : 'Endereço de e-mail por confirmar'}
      </AlertTitle>
      <AlertDescription>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {acabouDeConfirmar ? (
              <>
                A confirmação foi registada. Este aviso desaparece assim que a sessão
                for actualizada — no máximo dentro de 15 minutos, ou de imediato se
                terminar e iniciar sessão outra vez.
              </>
            ) : expirou ? (
              <>
                A ligação que abriu já passou do prazo de 24 horas. Peça uma nova aqui —
                entretanto, emitir documentos fiscais e criar utilizadores continua
                travado.
              </>
            ) : (
              <>
                Enviámos uma ligação de confirmação para o seu endereço. Até a abrir,
                pode configurar e explorar tudo — só não pode{' '}
                <strong>emitir documentos fiscais</strong> nem{' '}
                <strong>criar utilizadores</strong>.
              </>
            )}
          </p>
          {!acabouDeConfirmar && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={reenviar}
              disabled={pendente || reenviado}
            >
              {pendente && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {reenviado ? 'Ligação enviada' : 'Reenviar ligação'}
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
