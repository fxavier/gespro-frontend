/**
 * /auth/login — a porta de entrada do produto voltou a ser nossa (ADR-0029).
 *
 * Até ao ADR-0028 isto era um redireccionamento para o ecrã do Keycloak. O
 * ADR-0029 inverteu-o: o formulário vive aqui e fala com o Keycloak pela API.
 * O que se perdeu com isso — federação e MFA a sério — está no ADR-0029 §3.
 *
 * Server Component, com a interactividade na folha (`login-form.tsx`), como
 * o `CLAUDE.md` exige de qualquer página de listagem ou detalhe.
 */

import { Suspense } from 'react';
import { Logotipo } from '@/components/layout/Logotipo';
import Link from 'next/link';
import { LoginForm } from './login-form';
import { AvisoVerificacao } from './aviso-verificacao';

export const metadata = {
  title: 'Iniciar sessão · GestPro',
};

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logotipo className="[&>svg]:size-10 [&>span]:text-2xl" />
          <p className="text-sm text-muted-foreground">Sistema de gestão empresarial</p>
        </div>

        {/* Desfecho da ligação de confirmação de e-mail (ADR-0031 §5). A
            rota pública redirige para aqui quem confirma SEM sessão — abrir a
            ligação noutro dispositivo é o caso normal —, e sem isto o ecrã não
            dizia se tinha resultado. Suspense próprio: o componente lê
            `useSearchParams` e sem fronteira o prerender do build parte. */}
        <Suspense fallback={null}>
          <AvisoVerificacao />
        </Suspense>

        <div className="rounded-xl border border-transparent bg-card p-6 shadow-md dark:border-border">
          <h1 className="mb-6 text-xl font-semibold tracking-tight">Iniciar sessão</h1>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Problemas a entrar?{' '}
          <Link href="/contactos" className="underline underline-offset-4 hover:text-foreground">
            Contactar o suporte
          </Link>
        </p>
      </div>
    </main>
  );
}
