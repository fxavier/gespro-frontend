'use client';

/**
 * As três palavras-passe vivem no DOM até ao submit — sem `defaultValue`, sem
 * estado controlado, sem passarem por URL. Concluída a mudança, o formulário
 * inicia sessão com a nova, para a pessoa não ter de a escrever outra vez.
 */

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { AlertCircle, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { mudarPalavraPasse } from './actions';

export function MudarPalavraPasseForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const identificadorInicial = searchParams.get('identificador') ?? '';
  const [erro, setErro] = useState<string | null>(null);
  const [aSubmeter, iniciarTransicao] = useTransition();
  const [ocupado, setOcupado] = useState(false);

  async function aoSubmeter(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setOcupado(true);

    const dados = new FormData(evento.currentTarget);
    const identificador = String(dados.get('identificador') ?? '');
    const nova = String(dados.get('nova') ?? '');

    const res = await mudarPalavraPasse({
      identificador,
      actual: String(dados.get('actual') ?? ''),
      nova,
      confirmacao: String(dados.get('confirmacao') ?? ''),
    });

    if (!res.ok) {
      setErro(res.erro);
      setOcupado(false);
      return;
    }

    // A conta já não tem acções pendentes: entra directamente.
    const sessao = await signIn('credentials', {
      identificador,
      palavraPasse: nova,
      redirect: false,
    });
    setOcupado(false);

    if (!sessao || sessao.error) {
      setErro('Palavra-passe alterada. Inicie sessão com a nova para continuar.');
      return;
    }

    iniciarTransicao(() => {
      router.push('/dashboard');
      router.refresh();
    });
  }

  const aguardar = ocupado || aSubmeter;

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

      <div className="space-y-2">
        <Label htmlFor="identificador">E-mail</Label>
        <Input
          id="identificador"
          name="identificador"
          type="email"
          autoComplete="username"
          required
          defaultValue={identificadorInicial}
          readOnly={Boolean(identificadorInicial)}
          placeholder="nome@empresa.mz"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="actual">Palavra-passe provisória</Label>
        <Input
          id="actual"
          name="actual"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nova">Nova palavra-passe</Label>
        <Input
          id="nova"
          name="nova"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          aria-describedby="ajuda-nova"
        />
        <p id="ajuda-nova" className="text-xs text-muted-foreground">
          Pelo menos 10 caracteres.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmacao">Confirmar nova palavra-passe</Label>
        <Input
          id="confirmacao"
          name="confirmacao"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>

      <Button type="submit" className="w-full" disabled={aguardar}>
        <KeyRound className="h-4 w-4" aria-hidden="true" />
        {aguardar ? 'A guardar…' : 'Guardar e entrar'}
      </Button>
    </form>
  );
}
