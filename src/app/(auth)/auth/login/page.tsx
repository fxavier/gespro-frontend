'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  ShieldCheck,
  Sparkles,
  Lock,
  ArrowRight,
  Building2,
  BarChart3,
  Users
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: '', password: '', remember: true });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formData.email || !formData.password) {
      toast.error('Preencha o e-mail e a palavra-passe.');
      return;
    }
    setIsSubmitting(true);
    // Simula chamada à API
    setTimeout(() => {
      toast.success('Bem-vindo de volta!');
      router.push('/dashboard');
    }, 1000);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-slate-950 text-slate-100">
      <div className="relative hidden lg:flex flex-col justify-between p-10 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.25),_transparent_55%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,_rgba(8,47,73,0.8),_rgba(15,23,42,0.95))]" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 text-cyan-200">
            <div className="p-2 rounded-full bg-cyan-400/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="text-sm uppercase tracking-[0.25em]">GestPro Enterprise</span>
          </div>
          <h1 className="mt-6 text-4xl font-semibold leading-tight max-w-xl">
            Plataforma unificada para finanças, vendas e operações em empresas moçambicanas.
          </h1>
          <p className="mt-4 text-lg text-slate-300 max-w-lg">
            Automação inteligente, relatórios em tempo real e segurança robusta para apoiar decisões rápidas e estratégicas.
          </p>
        </div>
        <div className="relative z-10 grid grid-cols-3 gap-4">
          <Card className="bg-white/10 border-white/20 backdrop-blur">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-200">Redução de Custos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-3xl font-semibold text-white">-18%</p>
              <p className="text-xs text-slate-300">
                Otimização de compras e inventário em 2024
              </p>
            </CardContent>
          </Card>
          <Card className="bg-white/10 border-white/20 backdrop-blur">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-200">Eficiência Operacional</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-3xl font-semibold text-white">+32%</p>
              <p className="text-xs text-slate-300">Fluxos de aprovação e automações</p>
            </CardContent>
          </Card>
          <Card className="bg-white/10 border-white/20 backdrop-blur">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-200">Confiado por</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-3xl font-semibold text-white">120+</p>
              <p className="text-xs text-slate-300">Empresas em Moçambique</p>
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="flex items-center justify-center bg-white text-slate-900 px-6 py-10">
        <div className="w-full max-w-lg space-y-8">
          <div className="space-y-3 text-center">
            <Badge variant="outline" className="text-cyan-600 border-cyan-100 bg-cyan-50">
              <Sparkles className="h-3 w-3 mr-1" /> Gestão Moderna
            </Badge>
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Autenticação Segura</h2>
              <p className="text-slate-500 mt-2">
                Entre na sua conta para acompanhar operações, aprovar processos e analisar indicadores em tempo real.
              </p>
            </div>
          </div>

          <Card className="shadow-xl border border-slate-100">
            <CardHeader className="space-y-3 text-center">
              <div className="flex items-center justify-center gap-2 text-slate-500 text-sm">
                <Lock className="h-4 w-4" />
                Ambiente seguro com dupla proteção
              </div>
              <CardTitle className="text-2xl">Inicie a Sessão</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-6" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail Corporativo</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="ex: jose.silva@empresa.co.mz"
                    value={formData.email}
                    onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Palavra-passe</Label>
                    <Link href="/recuperar" className="text-sm text-cyan-600 hover:underline">
                      Esqueceu?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
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
                    <Label htmlFor="remember" className="font-normal text-slate-500">
                      Manter sessão iniciada
                    </Label>
                  </div>
                  <span className="text-slate-400 text-xs">Proteção por MFA disponível</span>
                </div>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? 'A validar…' : 'Entrar no sistema'}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </form>
              <Separator className="my-6" />
              <div className="grid gap-4">
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <div className="p-2 rounded-full bg-slate-100">
                    <Building2 className="h-4 w-4" />
                  </div>
                  Controlo multi-filiais e multi-moeda incluído.
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <div className="p-2 rounded-full bg-slate-100">
                    <BarChart3 className="h-4 w-4" />
                  </div>
                  Relatórios automatizados para finanças & vendas.
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <div className="p-2 rounded-full bg-slate-100">
                    <Users className="h-4 w-4" />
                  </div>
                  Perfis com permissões detalhadas para cada equipa.
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="text-center text-sm text-slate-500">
            Precisa de ajuda? <Link href="/contactos" className="text-cyan-600 hover:underline">Contacto suporte 24/7</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
