'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';
import { toast } from 'sonner';

export default function ConfiguracoesProjetosPage() {
  const [notificarRiscos, setNotificarRiscos] = useState(true);
  const [notificarPrazos, setNotificarPrazos] = useState(true);
  const [padraoCodigo, setPadraoCodigo] = useState('PRJ-{seq}');
  const [diasLembrete, setDiasLembrete] = useState('3');
  const [politicaQualidade, setPoliticaQualidade] = useState(
    'Revisão obrigatória de código e checklist de QA antes do deploy.'
  );

  const salvar = () => {
    toast.success('Configurações salvas (mock).');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configurações de Projetos</h1>
        <p className="text-muted-foreground mt-1">
          Defina padrões de numeração, notificações e políticas do módulo.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Notificações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Alertar riscos altos</p>
                <p className="text-sm text-muted-foreground">
                  Enviar aviso quando o score de risco for crítico.
                </p>
              </div>
              <Switch checked={notificarRiscos} onCheckedChange={setNotificarRiscos} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Lembrete de prazos</p>
                <p className="text-sm text-muted-foreground">
                  Aviso automático para marcos próximos do vencimento.
                </p>
              </div>
              <Switch checked={notificarPrazos} onCheckedChange={setNotificarPrazos} />
            </div>

            <div className="space-y-2">
              <Label>Dias antes do vencimento</Label>
              <Input
                type="number"
                min="1"
                value={diasLembrete}
                onChange={(e) => setDiasLembrete(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Padrões e políticas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Formato do código do projeto</Label>
              <Input
                value={padraoCodigo}
                onChange={(e) => setPadraoCodigo(e.target.value)}
                placeholder="PRJ-{seq}"
              />
            </div>
            <div className="space-y-2">
              <Label>Política de qualidade</Label>
              <Textarea
                value={politicaQualidade}
                onChange={(e) => setPoliticaQualidade(e.target.value)}
                rows={4}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={salvar} className="gap-2">
          <Save className="h-4 w-4" />
          Salvar configurações
        </Button>
      </div>
    </div>
  );
}
