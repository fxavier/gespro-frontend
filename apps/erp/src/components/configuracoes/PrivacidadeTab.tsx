
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import { Save, X, Trash2 } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ConfiguracoesPrivacidade {
  perfilPublico: boolean;
  mostrarEmail: boolean;
  mostrarTelefone: boolean;
  permitirMensagens: boolean;
  compartilharDados: boolean;
  visibilidadePerfil: 'publico' | 'privado' | 'amigos';
}

export default function PrivacidadeTab() {
  const { usuario } = useAuth();
  const [configuracoes, setConfiguracoes] = useState<ConfiguracoesPrivacidade>({
    perfilPublico: false,
    mostrarEmail: false,
    mostrarTelefone: false,
    permitirMensagens: true,
    compartilharDados: false,
    visibilidadePerfil: 'privado',
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    if (usuario) {
      const configSalvas = localStorage.getItem(`privacidade_${usuario.id}`);
      if (configSalvas) {
        setConfiguracoes(JSON.parse(configSalvas));
      }
    }
  }, [usuario]);

  const handleConfigChange = (key: keyof ConfiguracoesPrivacidade, value: boolean | string) => {
    setConfiguracoes(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    setShowConfirmDialog(true);
  };

  const confirmSave = () => {
    if (!usuario) return;

    localStorage.setItem(`privacidade_${usuario.id}`, JSON.stringify(configuracoes));
    toast.success('Configurações de privacidade atualizadas!');
    setHasChanges(false);
    setShowConfirmDialog(false);
  };

  const handleCancel = () => {
    if (usuario) {
      const configSalvas = localStorage.getItem(`privacidade_${usuario.id}`);
      if (configSalvas) {
        setConfiguracoes(JSON.parse(configSalvas));
      } else {
        setConfiguracoes({
          perfilPublico: false,
          mostrarEmail: false,
          mostrarTelefone: false,
          permitirMensagens: true,
          compartilharDados: false,
          visibilidadePerfil: 'privado',
        });
      }
    }
    setHasChanges(false);
  };

  const handleDeleteData = () => {
    setShowDeleteDialog(true);
  };

  const confirmDeleteData = () => {
    if (!usuario) return;

    localStorage.removeItem(`perfil_${usuario.id}`);
    localStorage.removeItem(`preferencias_${usuario.id}`);
    localStorage.removeItem(`privacidade_${usuario.id}`);
    
    toast.success('Dados pessoais excluídos com sucesso!');
    setShowDeleteDialog(false);
  };

  return (
    <>
      <div className="space-y-6">
        {/* Visibilidade do Perfil */}
        <Card>
          <CardHeader>
            <CardTitle>Visibilidade do Perfil</CardTitle>
            <CardDescription>
              Controle quem pode ver suas informações
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="visibilidade">Visibilidade do Perfil</Label>
              <Select
                value={configuracoes.visibilidadePerfil}
                onValueChange={(value) => handleConfigChange('visibilidadePerfil', value)}
              >
                <SelectTrigger id="visibilidade">
                  <SelectValue placeholder="Selecione a visibilidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="publico">Público</SelectItem>
                  <SelectItem value="privado">Privado</SelectItem>
                  <SelectItem value="amigos">Apenas Amigos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="perfil-publico">Perfil Público</Label>
                <p className="text-sm text-muted-foreground">
                  Permitir que outros usuários vejam seu perfil
                </p>
              </div>
              <Switch
                id="perfil-publico"
                checked={configuracoes.perfilPublico}
                onCheckedChange={(checked) => handleConfigChange('perfilPublico', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="mostrar-email">Mostrar Email</Label>
                <p className="text-sm text-muted-foreground">
                  Exibir seu email no perfil público
                </p>
              </div>
              <Switch
                id="mostrar-email"
                checked={configuracoes.mostrarEmail}
                onCheckedChange={(checked) => handleConfigChange('mostrarEmail', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="mostrar-telefone">Mostrar Telefone</Label>
                <p className="text-sm text-muted-foreground">
                  Exibir seu telefone no perfil público
                </p>
              </div>
              <Switch
                id="mostrar-telefone"
                checked={configuracoes.mostrarTelefone}
                onCheckedChange={(checked) => handleConfigChange('mostrarTelefone', checked)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Comunicação */}
        <Card>
          <CardHeader>
            <CardTitle>Comunicação</CardTitle>
            <CardDescription>
              Gerencie como outros podem entrar em contato
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="permitir-mensagens">Permitir Mensagens</Label>
                <p className="text-sm text-muted-foreground">
                  Permitir que outros usuários enviem mensagens
                </p>
              </div>
              <Switch
                id="permitir-mensagens"
                checked={configuracoes.permitirMensagens}
                onCheckedChange={(checked) => handleConfigChange('permitirMensagens', checked)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Dados e Privacidade */}
        <Card>
          <CardHeader>
            <CardTitle>Dados e Privacidade</CardTitle>
            <CardDescription>
              Controle como seus dados são usados
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="compartilhar-dados">Compartilhar Dados Analíticos</Label>
                <p className="text-sm text-muted-foreground">
                  Ajude a melhorar o sistema compartilhando dados de uso
                </p>
              </div>
              <Switch
                id="compartilhar-dados"
                checked={configuracoes.compartilharDados}
                onCheckedChange={(checked) => handleConfigChange('compartilharDados', checked)}
              />
            </div>

            <div className="pt-4 border-t">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-destructive mb-2">Zona de Perigo</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Ações irreversíveis relacionadas aos seus dados
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={handleDeleteData}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir Todos os Dados Pessoais
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Botões de Ação */}
        {hasChanges && (
          <div className="flex gap-3">
            <Button onClick={handleSave} className="gap-2">
              <Save className="h-4 w-4" />
              Salvar Alterações
            </Button>
            <Button variant="outline" onClick={handleCancel} className="gap-2">
              <X className="h-4 w-4" />
              Cancelar
            </Button>
          </div>
        )}
      </div>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Alterações</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja salvar as alterações nas configurações de privacidade?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSave}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Dados Pessoais</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. Todos os seus dados pessoais, preferências e configurações serão permanentemente excluídos. Tem certeza que deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteData} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir Permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
