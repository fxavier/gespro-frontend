'use client';

/**
 * A confirmação é a mesma para qualquer endereço bem formado (#178) e não o
 * repete: a resposta do servidor não distingue contas, e o ecrã também não.
 */

import { useState, useTransition } from 'react';
import { AlertCircle, CheckCircle2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { pedirRecuperacaoPalavraPasse } from './actions';

const CONFIRMACAO =
  'Se o endereço tiver uma conta activa na GestPro, vai receber dentro de minutos um e-mail com a ligação para definir uma palavra-passe nova. Verifique também a pasta de spam.';

export function RecuperarPalavraPasseForm() {
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [aSubmeter, iniciarTransicao] = useTransition();

  function aoSubmeter(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setEnviado(false);
    const email = String(new FormData(evento.currentTarget).get('email') ?? '');

    iniciarTransicao(async () => {
      const res = await pedirRecuperacaoPalavraPasse({ email });
      if (!res.ok) {
        setErro(res.erro);
        return;
      }
      setEnviado(true);
    });
  }

  return (
    <form onSubmit={aoSubmeter} className="space-y-5" noValidate>
      {erro && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{erro}</span>
        </div>
      )}

      <div role="status" aria-live="polite">
        {enviado && (
          <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{CONFIRMACAO}</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          placeholder="nome@empresa.mz"
        />
      </div>

      <Button type="submit" className="w-full" disabled={aSubmeter}>
        <Mail className="h-4 w-4" aria-hidden="true" />
        {aSubmeter ? 'A enviar…' : 'Enviar ligação de recuperação'}
      </Button>
    </form>
  );
}
