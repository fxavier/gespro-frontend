'use client';

/**
 * Formulário de início de sessão (ADR-0029).
 *
 * As credenciais são submetidas ao Auth.js, que as passa ao `authorize` no
 * servidor — nunca vão para um URL nem para `searchParams`. O campo de
 * palavra-passe não tem `defaultValue` nem é controlado: o valor vive no DOM
 * até ao submit e mais nada.
 */

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { AlertCircle, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Motivos devolvidos pelo `authorize` (ver `MotivoRecusaLogin` em lib/auth). */
const MENSAGENS: Record<string, string> = {
  credenciais: 'E-mail ou palavra-passe incorrectos.',
  'conta-por-activar':
    'A sua conta ainda não foi activada. Procure no e-mail a mensagem de activação do GestPro para definir a palavra-passe.',
  'conta-desactivada': 'Esta conta está desactivada. Contacte o administrador da sua empresa.',
  'nao-provisionado':
    'A sua identidade foi reconhecida, mas ainda não existe um utilizador associado numa empresa GestPro. Contacte o administrador da sua empresa.',
  inactivo: 'Este utilizador foi desactivado. Contacte o administrador da sua empresa.',
  subscricao:
    'A subscrição da sua empresa não está activa. O administrador pode regularizar a situação nas definições.',
  indisponivel:
    'O serviço de identidade não respondeu. Tente de novo dentro de momentos — não é problema das suas credenciais.',
};

const OMISSAO = 'Não foi possível iniciar sessão. Tente de novo.';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/dashboard';
  const [erro, setErro] = useState<string | null>(null);
  const [aSubmeter, iniciarTransicao] = useTransition();

  async function aoSubmeter(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    const dados = new FormData(evento.currentTarget);

    const res = await signIn('credentials', {
      identificador: String(dados.get('identificador') ?? ''),
      palavraPasse: String(dados.get('palavraPasse') ?? ''),
      redirect: false,
    });

    if (!res || res.error) {
      // `code` chega no erro do Auth.js; o `error` genérico é o resto.
      const codigo = (res as { code?: string } | undefined)?.code;
      setErro(MENSAGENS[codigo ?? ''] ?? OMISSAO);
      return;
    }

    iniciarTransicao(() => {
      router.push(callbackUrl);
      router.refresh();
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

      <div className="space-y-2">
        <Label htmlFor="identificador">E-mail</Label>
        <Input
          id="identificador"
          name="identificador"
          type="email"
          autoComplete="username"
          required
          autoFocus
          placeholder="nome@empresa.mz"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="palavraPasse">Palavra-passe</Label>
        <Input
          id="palavraPasse"
          name="palavraPasse"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <Button type="submit" className="w-full" disabled={aSubmeter}>
        <LogIn className="h-4 w-4" aria-hidden="true" />
        {aSubmeter ? 'A entrar…' : 'Iniciar sessão'}
      </Button>
    </form>
  );
}
