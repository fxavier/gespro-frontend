
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';

interface LoginFormProps {
  onSwitchToRegister: () => void;
}

export default function LoginForm({ onSwitchToRegister }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState('');
  const { login, carregando } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');

    if (!email || !senha) {
      setErro('Por favor, preencha todos os campos');
      return;
    }

    const sucesso = await login(email, senha);
    if (!sucesso) {
      setErro('Email ou senha incorretos');
      toast.error('Falha no login');
    } else {
      toast.success('Login realizado com sucesso!');
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold text-center">
          Entrar no Sistema
        </CardTitle>
        <CardDescription className="text-center">
          Acesse sua conta empresarial
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {erro && (
            <Alert variant="destructive">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={carregando}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <div className="relative">
              <Input
                id="senha"
                type={mostrarSenha ? 'text' : 'password'}
                placeholder="Sua senha"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                disabled={carregando}
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setMostrarSenha(!mostrarSenha)}
                disabled={carregando}
              >
                {mostrarSenha ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={carregando}
          >
            {carregando ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Entrando...
              </>
            ) : (
              'Entrar'
            )}
          </Button>

          <div className="text-center">
            <Button
              type="button"
              variant="link"
              onClick={onSwitchToRegister}
              disabled={carregando}
            >
              Não tem conta? Registre sua empresa
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
