'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormPage, FormSection } from '@/components/patterns';

const EXERCICIO_INICIO_DEFAULT = `${new Date().getFullYear()}-01-01`;
const EXERCICIO_FIM_DEFAULT = `${new Date().getFullYear()}-12-31`;

export function ConfiguracoesForm() {
  const [regime, setRegime] = useState<'CAIXA' | 'COMPETENCIA'>('COMPETENCIA');
  const [exercicioInicio, setExercicioInicio] = useState(EXERCICIO_INICIO_DEFAULT);
  const [exercicioFim, setExercicioFim] = useState(EXERCICIO_FIM_DEFAULT);
  const [integracao, setIntegracao] = useState({
    vendas: true,
    compras: true,
    pagamentos: true,
    recebimentos: true,
    estoque: true,
  });

  const handleSave = () => {
    // ponytail: persists via server action once wired; toast for now
    toast.success('Configurações guardadas com sucesso.');
  };

  return (
    <FormPage
      actions={
        <Button type="submit" size="lg" onClick={handleSave}>
          Guardar Configurações
        </Button>
      }
    >
      <FormSection title="Regime Contabilístico" description="Critério de reconhecimento de rendimentos e gastos">
        <div className="space-y-2">
          <Label>Regime</Label>
          <Select value={regime} onValueChange={(v: 'CAIXA' | 'COMPETENCIA') => setRegime(v)}>
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="COMPETENCIA">Regime de Competência</SelectItem>
              <SelectItem value="CAIXA">Regime de Caixa</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {regime === 'COMPETENCIA'
              ? 'Rendimentos e gastos reconhecidos quando ocorrem, independentemente do pagamento.'
              : 'Rendimentos e gastos reconhecidos apenas quando recebidos ou pagos.'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 max-w-md">
          <div className="space-y-2">
            <Label>Início do Exercício Fiscal</Label>
            <Input type="date" value={exercicioInicio} onChange={(e) => setExercicioInicio(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Fim do Exercício Fiscal</Label>
            <Input type="date" value={exercicioFim} onChange={(e) => setExercicioFim(e.target.value)} />
          </div>
        </div>
      </FormSection>

      <FormSection title="Integração Automática" description="Módulos que geram lançamentos contabilísticos automaticamente">
        {(Object.keys(integracao) as Array<keyof typeof integracao>).map((key) => (
          <div key={key} className="flex items-center justify-between max-w-lg">
            <div>
              <p className="font-medium capitalize">{key.charAt(0).toUpperCase() + key.slice(1)}</p>
              <p className="text-sm text-muted-foreground">
                Gerar lançamentos automáticos para {key}
              </p>
            </div>
            <Switch
              checked={integracao[key]}
              onCheckedChange={(v) => setIntegracao((prev) => ({ ...prev, [key]: v }))}
            />
          </div>
        ))}
      </FormSection>
    </FormPage>
  );
}
