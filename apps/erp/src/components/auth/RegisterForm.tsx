
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Eye, EyeOff, Building2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { validarNuit, validarEmail, formatarNuit } from '@/lib/validacao-nuit';
import { toast } from 'sonner';

interface RegisterFormProps {
  onSwitchToLogin: () => void;
}

const provincias = [
  'Maputo Cidade', 'Maputo Província', 'Gaza', 'Inhambane', 'Sofala',
  'Manica', 'Tete', 'Zambézia', 'Nampula', 'Cabo Delgado', 'Niassa'
];

const planos = [
  { valor: 'basico', nome: 'Básico', descricao: 'Para pequenos negócios' },
  { valor: 'profissional', nome: 'Profissional', descricao: 'Para empresas em crescimento' },
  { valor: 'empresarial', nome: 'Empresarial', descricao: 'Para grandes empresas' }
];

type TipoPlano = 'basico' | 'profissional' | 'empresarial';

export default function RegisterForm({ onSwitchToLogin }: RegisterFormProps) {
  const [etapa, setEtapa] = useState(1);
  const [dadosEmpresa, setDadosEmpresa] = useState<{
    nomeEmpresa: string;
    nuit: string;
    email: string;
    telefone: string;
    endereco: string;
    cidade: string;
    provincia: string;
    planoAssinatura: TipoPlano;
  }>({
    nomeEmpresa: '',
    nuit: '',
    email: '',
    telefone: '',
    endereco: '',
    cidade: '',
    provincia: '',
    planoAssinatura: 'basico'
  });
  const [dadosUsuario, setDadosUsuario] = useState({
    nome: '',
    email: '',
    senha: '',
    confirmarSenha: ''
  });
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState('');
  const { registrarTenant, carregando } = useAuth();

  const validarEtapa1 = () => {
    if (!dadosEmpresa.nomeEmpresa || !dadosEmpresa.nuit || !dadosEmpresa.email) {
      setErro('Por favor, preencha todos os campos obrigatórios');
      return false;
    }

    if (!validarNuit(dadosEmpresa.nuit)) {
      setErro('NUIT inválido. Deve ter 9 dígitos');
      return false;
    }

    if (!validarEmail(dadosEmpresa.email)) {
      setErro('Email inválido');
      return false;
    }

    return true;
  };

  const validarEtapa2 = () => {
    if (!dadosUsuario.nome || !dadosUsuario.email || !dadosUsuario.senha || !dadosUsuario.confirmarSenha) {
      setErro('Por favor, preencha todos os campos');
      return false;
    }

    if (!validarEmail(dadosUsuario.email)) {
      setErro('Email inválido');
      return false;
    }

    if (dadosUsuario.senha.length < 6) {
      setErro('A senha deve ter pelo menos 6 caracteres');
      return false;
    }

    if (dadosUsuario.senha !== dadosUsuario.confirmarSenha) {
      setErro('As senhas não coincidem');
      return false;
    }

    return true;
  };

  const handleProximaEtapa = () => {
    setErro('');
    if (validarEtapa1()) {
      setEtapa(2);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');

    if (!validarEtapa2()) return;

    const sucesso = await registrarTenant(
      {
        ...dadosEmpresa,
        timezone: 'Africa/Maputo',
        moedaBase: 'MZN'
      },
      dadosUsuario,
      dadosUsuario.senha
    );

    if (sucesso) {
      toast.success('Empresa registrada com sucesso!');
    } else {
      setErro('Erro ao registrar empresa. Tente novamente.');
      toast.error('Falha no registro');
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="space-y-1">
        <div className="flex items-center justify-center mb-4">
          <Building2 className="h-8 w-8 text-primary" />
        </div>
        <CardTitle className="text-2xl font-bold text-center">
          Registrar Nova Empresa
        </CardTitle>
        <CardDescription className="text-center">
          {etapa === 1 ? 'Dados da empresa' : 'Dados do administrador'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {erro && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}

        {etapa === 1 ? (
          <form onSubmit={(e) => { e.preventDefault(); handleProximaEtapa(); }} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="nomeEmpresa">Nome da Empresa *</Label>
                <Input
                  id="nomeEmpresa"
                  placeholder="Nome da sua empresa"
                  value={dadosEmpresa.nomeEmpresa}
                  onChange={(e) => setDadosEmpresa(prev => ({ ...prev, nomeEmpresa: e.target.value }))}
                  disabled={carregando}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nuit">NUIT *</Label>
                <Input
                  id="nuit"
                  placeholder="123456789"
                  value={dadosEmpresa.nuit}
                  onChange={(e) => {
                    const valor = e.target.value.replace(/\D/g, '');
                    if (valor.length <= 9) {
                      setDadosEmpresa(prev => ({ ...prev, nuit: valor }));
                    }
                  }}
                  disabled={carregando}
                  required
                />
                {dadosEmpresa.nuit && (
                  <p className="text-sm text-muted-foreground">
                    Formato: {formatarNuit(dadosEmpresa.nuit)}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="emailEmpresa">Email da Empresa *</Label>
                <Input
                  id="emailEmpresa"
                  type="email"
                  placeholder="empresa@exemplo.com"
                  value={dadosEmpresa.email}
                  onChange={(e) => setDadosEmpresa(prev => ({ ...prev, email: e.target.value }))}
                  disabled={carregando}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone</Label>
                <Input
                  id="telefone"
                  placeholder="+258 84 123 4567"
                  value={dadosEmpresa.telefone}
                  onChange={(e) => setDadosEmpresa(prev => ({ ...prev, telefone: e.target.value }))}
                  disabled={carregando}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="provincia">Província</Label>
                <Select
                  value={dadosEmpresa.provincia}
                  onValueChange={(value) => setDadosEmpresa(prev => ({ ...prev, provincia: value }))}
                  disabled={carregando}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a província" />
                  </SelectTrigger>
                  <SelectContent>
                    {provincias.map((provincia) => (
                      <SelectItem key={provincia} value={provincia}>
                        {provincia}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="endereco">Endereço</Label>
                <Input
                  id="endereco"
                  placeholder="Endereço completo da empresa"
                  value={dadosEmpresa.endereco}
                  onChange={(e) => setDadosEmpresa(prev => ({ ...prev, endereco: e.target.value }))}
                  disabled={carregando}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="plano">Plano de Assinatura</Label>
                <Select
                  value={dadosEmpresa.planoAssinatura}
                  onValueChange={(value: TipoPlano) => 
                    setDadosEmpresa(prev => ({ ...prev, planoAssinatura: value }))
                  }
                  disabled={carregando}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {planos.map((plano) => (
                      <SelectItem key={plano.valor} value={plano.valor}>
                        <div>
                          <div className="font-medium">{plano.nome}</div>
                          <div className="text-sm text-muted-foreground">{plano.descricao}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={carregando}>
              Continuar
            </Button>

            <div className="text-center">
              <Button
                type="button"
                variant="link"
                onClick={onSwitchToLogin}
                disabled={carregando}
              >
                Já tem conta? Fazer login
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="nomeUsuario">Nome Completo *</Label>
                <Input
                  id="nomeUsuario"
                  placeholder="Seu nome completo"
                  value={dadosUsuario.nome}
                  onChange={(e) => setDadosUsuario(prev => ({ ...prev, nome: e.target.value }))}
                  disabled={carregando}
                  required
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="emailUsuario">Email de Acesso *</Label>
                <Input
                  id="emailUsuario"
                  type="email"
                  placeholder="seu@email.com"
                  value={dadosUsuario.email}
                  onChange={(e) => setDadosUsuario(prev => ({ ...prev, email: e.target.value }))}
                  disabled={carregando}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="senhaUsuario">Senha *</Label>
                <div className="relative">
                  <Input
                    id="senhaUsuario"
                    type={mostrarSenha ? 'text' : 'password'}
                    placeholder="Mínimo 6 caracteres"
                    value={dadosUsuario.senha}
                    onChange={(e) => setDadosUsuario(prev => ({ ...prev, senha: e.target.value }))}
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

              <div className="space-y-2">
                <Label htmlFor="confirmarSenha">Confirmar Senha *</Label>
                <Input
                  id="confirmarSenha"
                  type={mostrarSenha ? 'text' : 'password'}
                  placeholder="Confirme sua senha"
                  value={dadosUsuario.confirmarSenha}
                  onChange={(e) => setDadosUsuario(prev => ({ ...prev, confirmarSenha: e.target.value }))}
                  disabled={carregando}
                  required
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEtapa(1)}
                disabled={carregando}
                className="flex-1"
              >
                Voltar
              </Button>
              <Button
                type="submit"
                disabled={carregando}
                className="flex-1"
              >
                {carregando ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Registrando...
                  </>
                ) : (
                  'Criar Conta'
                )}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
