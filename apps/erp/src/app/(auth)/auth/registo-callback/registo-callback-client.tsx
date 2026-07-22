'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Estado = 'a-validar' | 'sucesso' | 'erro';

/**
 * Consome o token de handoff e estabelece a sessão.
 *
 * `useSearchParams()` obriga a um `<Suspense>` no Server Component acima — sem
 * ele, o build de produção falha o prerender desta rota.
 *
 * O token é de uso único: o efeito corre UMA vez (guarda `jaCorreu`). Sem a
 * guarda, o duplo-invoke do React em modo estrito gastaria o token na primeira
 * chamada e a segunda mostraria erro ao utilizador.
 */
export function RegistoCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  // Sem token não há nada a validar: o estado inicial já é o final (evita um
  // setState síncrono dentro do efeito e o render em cascata que traz).
  const [estado, setEstado] = useState<Estado>(token ? 'a-validar' : 'erro');
  const jaCorreu = useRef(false);

  useEffect(() => {
    if (jaCorreu.current || !token) return;
    jaCorreu.current = true;

    void (async () => {
      try {
        const resultado = await signIn('handoff', { token, redirect: false });
        if (resultado?.error) {
          setEstado('erro');
          return;
        }
        setEstado('sucesso');
        router.replace('/dashboard?onboarding=1');
        router.refresh();
      } catch {
        setEstado('erro');
      }
    })();
  }, [token, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">
            {estado === 'erro' ? 'Ligação inválida' : 'A preparar a sua conta'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {estado === 'a-validar' && (
            <div
              className="flex items-center gap-3 text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              <p className="text-sm">A validar o registo e a iniciar sessão…</p>
            </div>
          )}

          {estado === 'sucesso' && (
            <div className="flex items-center gap-3 text-muted-foreground" role="status">
              <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />
              <p className="text-sm">Conta pronta. A abrir o painel…</p>
            </div>
          )}

          {estado === 'erro' && (
            <>
              <div className="flex items-start gap-3" role="alert">
                <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  Esta ligação de registo expirou ou já foi utilizada. Por segurança, só pode ser
                  usada uma vez. Inicie sessão com o email e a palavra-passe que definiu.
                </p>
              </div>
              <Button asChild className="w-full">
                <Link href="/auth/login">Ir para o início de sessão</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
