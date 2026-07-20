'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  ShieldCheck,
  Lock,
  ArrowRight,
  Building2,
  BarChart3,
  Users,
  AlertCircle,
} from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/dashboard';

  const [formData, setFormData] = useState({ email: '', password: '', remember: true });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMsg(null);

    if (!formData.email || !formData.password) {
      setErrorMsg('Preencha o e-mail e a palavra-passe.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await signIn('credentials', {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });

      if (result?.error) {
        // Mensagem genérica — não revelar se o email existe ou se houve rate limit.
        setErrorMsg('Credenciais inválidas ou conta bloqueada temporariamente. Tente novamente mais tarde.');
        return;
      }

      // Login com sucesso — redirecionar.
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setErrorMsg('Ocorreu um erro inesperado. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background text-foreground">
      {/* Painel esquerdo — branding */}
      <div className="relative hidden lg:flex flex-col justify-between p-10 overflow-hidden bg-primary">
        <div className="relative z-10">
          <div className="flex items-center gap-3 text-primary-foreground">
            <div className="p-2 rounded-full bg-primary-foreground/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="text-sm uppercase tracking-[0.25em]">GestPro Enterprise</span>
          </div>
          <h1 className="mt-6 text-4xl font-semibold leading-tight max-w-xl text-primary-foreground">
            Plataforma unificada para finanças, vendas e operações em empresas moçambicanas.
          </h1>
          <p className="mt-4 text-lg text-primary-foreground/90 max-w-lg">
            Automação inteligente, relatórios em tempo real e segurança robusta para apoiar decisões rápidas e estratégicas.
          </p>
        </div>
        <div className="relative z-10 grid grid-cols-3 gap-4">
          <Card className="bg-primary-foreground/10 border-primary-foreground/20 backdrop-blur">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-primary-foreground">Redução de Custos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-3xl font-semibold text-primary-foreground tabular-nums">-18%</p>
              <p className="text-xs text-primary-foreground/85">
                Optimização de compras e inventário em 2024
              </p>
            </CardContent>
          </Card>
          <Card className="bg-primary-foreground/10 border-primary-foreground/20 backdrop-blur">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-primary-foreground">Eficiência Operacional</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-3xl font-semibold text-primary-foreground tabular-nums">+32%</p>
              <p className="text-xs text-primary-foreground/85">Fluxos de aprovação e automações</p>
            </CardContent>
          </Card>
          <Card className="bg-primary-foreground/10 border-primary-foreground/20 backdrop-blur">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-primary-foreground">Confiado por</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-3xl font-semibold text-primary-foreground tabular-nums">120+</p>
              <p className="text-xs text-primary-foreground/85">Empresas em Moçambique</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Painel direito — formulário */}
      <div className="flex items-center justify-center bg-background px-6 py-10">
        <div className="w-full max-w-lg space-y-8">
          <div className="space-y-2 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Autenticação Segura</h2>
            <p className="text-muted-foreground">
              Entre na sua conta para acompanhar operações, aprovar processos e analisar indicadores em tempo real.
            </p>
          </div>

          <Card className="shadow-md border">
            <CardHeader className="space-y-3 text-center pb-4">
              <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
                <Lock className="h-4 w-4" />
                Ambiente seguro com dupla protecção
              </div>
              <CardTitle className="text-2xl">Iniciar Sessão</CardTitle>
            </CardHeader>
            <CardContent>
              {errorMsg && (
                <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail Corporativo</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="ex: jose.silva@empresa.co.mz"
                    value={formData.email}
                    onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                    autoComplete="email"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Palavra-passe</Label>
                    <Link
                      href="/auth/recuperar-senha"
                      className="text-sm text-primary hover:underline"
                    >
                      Esqueceu?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                    autoComplete="current-password"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="remember"
                      checked={formData.remember}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({ ...prev, remember: Boolean(checked) }))
                      }
                    />
                    <Label htmlFor="remember" className="font-normal text-muted-foreground cursor-pointer">
                      Manter sessão iniciada
                    </Label>
                  </div>
                  <span className="text-muted-foreground text-xs">Protecção por MFA disponível</span>
                </div>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? 'A validar…' : 'Entrar no sistema'}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </form>

              <Separator className="my-6" />

              <div className="grid gap-3">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <div className="p-2 rounded-full bg-muted">
                    <Building2 className="h-4 w-4" />
                  </div>
                  Controlo multi-filiais e multi-moeda incluído.
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <div className="p-2 rounded-full bg-muted">
                    <BarChart3 className="h-4 w-4" />
                  </div>
                  Relatórios automatizados para finanças e vendas.
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <div className="p-2 rounded-full bg-muted">
                    <Users className="h-4 w-4" />
                  </div>
                  Perfis com permissões detalhadas para cada equipa.
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="text-center text-sm text-muted-foreground">
            Precisa de ajuda?{' '}
            <Link href="/contactos" className="text-primary hover:underline">
              Contacto suporte 24/7
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
