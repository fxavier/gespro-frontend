
'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import { Save, Eye, EyeOff, Shield } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';

export default function SegurancaTab() {
  const { usuario } = useAuth();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [mostrarSenhaAtual, setMostrarSenhaAtual] = useState(false);
  const [mostrarNovaSenha, setMostrarNovaSenha] = useState(false);
  const [mostrarConfirmarSenha, setMostrarConfirmarSenha] = useState(false);
  const [autenticacaoDoisFatores, setAutenticacaoDoisFatores] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showConfirm2FADialog, setShowConfirm2FADialog] = useState(false);

  const handleAlterarSenha = () => {
    if (!senhaAtual || !novaSenha || !confirmarSenha) {
      toast.error('Preencha todos os campos');
      return;
    }

    if (novaSenha !== confirmarSenha) {
      toast.error('As senhas não coincidem');
      return;
    }

    if (novaSenha.length < 8) {
      toast.error('A senha deve ter no mínimo 8 caracteres');
      return;
    }

    setShowConfirmDialog(true);
  };

  const confirmAlterarSenha = () => {
    if (!usuario) return;

    const senhasSalvas = JSON.parse(localStorage.getItem('senhas') || '{}');
    
    if (senhasSalvas[usuario.id] !== senhaAtual) {
      toast.error('Senha atual incorreta');
      setShowConfirmDialog(false);
      return;
    }

    senhasSalvas[usuario.id] = novaSenha;
    localStorage.setItem('senhas', JSON.stringify(senhasSalvas));

    toast.success('Senha alterada com sucesso!');
    setSenhaAtual('');
    setNovaSenha('');
    setConfirmarSenha('');
    setShowConfirmDialog(false);
  };

  const handle2FAToggle = (checked: boolean) => {
    if (checked) {
      setShowConfirm2FADialog(true);
    } else {
      setAutenticacaoDoisFatores(false);
      if (usuario) {
        localStorage.setItem(`2fa_${usuario.id}`, 'false');
      }
      toast.success('Autenticação de dois fatores desativada');
    }
  };

  const confirm2FAActivation = () => {
    setAutenticacaoDoisFatores(true);
    if (usuario) {
      localStorage.setItem(`2fa_${usuario.id}`, 'true');
    }
    toast.success('Autenticação de dois fatores ativada com sucesso!');
    setShowConfirm2FADialog(false);
  };

  return (
    <>
      <div className="space-y-6">
        {/* Alterar Senha */}
        <Card>
          <CardHeader>
            <CardTitle>Alterar Senha</CardTitle>
            <CardDescription>
              Mantenha sua conta segura com uma senha forte
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="senha-atual">Senha Atual</Label>
              <div className="relative">
                <Input
                  id="senha-atual"
                  type={mostrarSenhaAtual ? 'text' : 'password'}
                  value={senhaAtual}
                  onChange={(e) => setSenhaAtual(e.target.value)}
                  placeholder="Digite sua senha atual"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setMostrarSenhaAtual(!mostrarSenhaAtual)}
                >
                  {mostrarSenhaAtual ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nova-senha">Nova Senha</Label>
              <div className="relative">
                <Input
                  id="nova-senha"
                  type={mostrarNovaSenha ? 'text' : 'password'}
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  placeholder="Digite sua nova senha"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setMostrarNovaSenha(!mostrarNovaSenha)}
                >
                  {mostrarNovaSenha ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Mínimo de 8 caracteres
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmar-senha">Confirmar Nova Senha</Label>
              <div className="relative">
                <Input
                  id="confirmar-senha"
                  type={mostrarConfirmarSenha ? 'text' : 'password'}
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  placeholder="Confirme sua nova senha"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setMostrarConfirmarSenha(!mostrarConfirmarSenha)}
                >
                  {mostrarConfirmarSenha ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <Button onClick={handleAlterarSenha} className="gap-2">
              <Save className="h-4 w-4" />
              Alterar Senha
            </Button>
          </CardContent>
        </Card>

        {/* Autenticação de Dois Fatores */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Autenticação de Dois Fatores
              {autenticacaoDoisFatores && (
                <Badge variant="secondary" className="gap-1">
                  <Shield className="h-3 w-3" />
                  Ativo
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Adicione uma camada extra de segurança à sua conta
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="2fa">Ativar Autenticação de Dois Fatores</Label>
                <p className="text-sm text-muted-foreground">
                  Requer um código adicional ao fazer login
                </p>
              </div>
              <Switch
                id="2fa"
                checked={autenticacaoDoisFatores}
                onCheckedChange={handle2FAToggle}
              />
            </div>

            {autenticacaoDoisFatores && (
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <p className="text-sm font-medium">Como funciona:</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Use um aplicativo autenticador (Google Authenticator, Authy, etc.)</li>
                  <li>Escaneie o código QR fornecido</li>
                  <li>Digite o código de 6 dígitos ao fazer login</li>
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sessões Ativas */}
        <Card>
          <CardHeader>
            <CardTitle>Sessões Ativas</CardTitle>
            <CardDescription>
              Gerencie os dispositivos conectados à sua conta
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">Navegador Atual</p>
                  <p className="text-sm text-muted-foreground">
                    Última atividade: Agora
                  </p>
                </div>
                <Badge variant="secondary">Ativo</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Alteração de Senha</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja alterar sua senha? Você precisará fazer login novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAlterarSenha}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showConfirm2FADialog} onOpenChange={setShowConfirm2FADialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ativar Autenticação de Dois Fatores</AlertDialogTitle>
            <AlertDialogDescription>
              Isso adicionará uma camada extra de segurança à sua conta. Você precisará de um aplicativo autenticador para continuar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirm2FAActivation}>Ativar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
