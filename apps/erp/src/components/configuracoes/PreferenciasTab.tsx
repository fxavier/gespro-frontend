
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
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

interface Preferencias {
  idioma: string;
  notificacoesEmail: boolean;
  notificacoesPush: boolean;
  notificacoesDesktop: boolean;
  somNotificacoes: boolean;
}

export default function PreferenciasTab() {
  const { usuario } = useAuth();
  const { theme, setTheme } = useTheme();
  const [temaLocal, setTemaLocal] = useState(theme || 'system');
  const [preferencias, setPreferencias] = useState<Preferencias>({
    idioma: 'pt-PT',
    notificacoesEmail: true,
    notificacoesPush: true,
    notificacoesDesktop: false,
    somNotificacoes: true,
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  useEffect(() => {
    if (usuario) {
      const prefSalvas = localStorage.getItem(`preferencias_${usuario.id}`);
      if (prefSalvas) {
        const pref = JSON.parse(prefSalvas);
        setPreferencias(pref);
        if (pref.tema) {
          setTemaLocal(pref.tema);
        }
      }
    }
  }, [usuario]);

  const handleTemaChange = (novoTema: string) => {
    setTemaLocal(novoTema);
    setHasChanges(true);
  };

  const handlePreferenciaChange = (key: keyof Preferencias, value: string | boolean) => {
    setPreferencias(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    setShowConfirmDialog(true);
  };

  const confirmSave = () => {
    if (!usuario) return;

    const preferenciasSalvar = {
      ...preferencias,
      tema: temaLocal,
    };

    localStorage.setItem(`preferencias_${usuario.id}`, JSON.stringify(preferenciasSalvar));
    setTheme(temaLocal);

    toast.success('Preferências atualizadas com sucesso!');
    setHasChanges(false);
    setShowConfirmDialog(false);
  };

  const handleCancel = () => {
    if (usuario) {
      const prefSalvas = localStorage.getItem(`preferencias_${usuario.id}`);
      if (prefSalvas) {
        const pref = JSON.parse(prefSalvas);
        setPreferencias(pref);
        if (pref.tema) {
          setTemaLocal(pref.tema);
        }
      } else {
        setPreferencias({
          idioma: 'pt-PT',
          notificacoesEmail: true,
          notificacoesPush: true,
          notificacoesDesktop: false,
          somNotificacoes: true,
        });
        setTemaLocal(theme || 'system');
      }
    }
    setHasChanges(false);
  };

  return (
    <>
      <div className="space-y-6">
        {/* Aparência */}
        <Card>
          <CardHeader>
            <CardTitle>Aparência</CardTitle>
            <CardDescription>
              Personalize a aparência do sistema
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tema">Tema</Label>
              <Select value={temaLocal} onValueChange={handleTemaChange}>
                <SelectTrigger id="tema">
                  <SelectValue placeholder="Selecione o tema" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Claro</SelectItem>
                  <SelectItem value="dark">Escuro</SelectItem>
                  <SelectItem value="system">Sistema</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Idioma */}
        <Card>
          <CardHeader>
            <CardTitle>Idioma</CardTitle>
            <CardDescription>
              Escolha o idioma do sistema
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="idioma">Idioma</Label>
              <Select
                value={preferencias.idioma}
                onValueChange={(value) => handlePreferenciaChange('idioma', value)}
              >
                <SelectTrigger id="idioma">
                  <SelectValue placeholder="Selecione o idioma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt-PT">Português (Brasil)</SelectItem>
                  <SelectItem value="pt-PT">Português (Portugal)</SelectItem>
                  <SelectItem value="en-US">English (US)</SelectItem>
                  <SelectItem value="es-ES">Español</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Notificações */}
        <Card>
          <CardHeader>
            <CardTitle>Notificações</CardTitle>
            <CardDescription>
              Configure como você deseja receber notificações
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="notif-email">Notificações por Email</Label>
                <p className="text-sm text-muted-foreground">
                  Receba atualizações importantes por email
                </p>
              </div>
              <Switch
                id="notif-email"
                checked={preferencias.notificacoesEmail}
                onCheckedChange={(checked) => handlePreferenciaChange('notificacoesEmail', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="notif-push">Notificações Push</Label>
                <p className="text-sm text-muted-foreground">
                  Receba notificações push no navegador
                </p>
              </div>
              <Switch
                id="notif-push"
                checked={preferencias.notificacoesPush}
                onCheckedChange={(checked) => handlePreferenciaChange('notificacoesPush', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="notif-desktop">Notificações Desktop</Label>
                <p className="text-sm text-muted-foreground">
                  Receba notificações na área de trabalho
                </p>
              </div>
              <Switch
                id="notif-desktop"
                checked={preferencias.notificacoesDesktop}
                onCheckedChange={(checked) => handlePreferenciaChange('notificacoesDesktop', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="som-notif">Som de Notificações</Label>
                <p className="text-sm text-muted-foreground">
                  Reproduzir som ao receber notificações
                </p>
              </div>
              <Switch
                id="som-notif"
                checked={preferencias.somNotificacoes}
                onCheckedChange={(checked) => handlePreferenciaChange('somNotificacoes', checked)}
              />
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
              Tem certeza que deseja salvar as alterações nas preferências?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSave}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
