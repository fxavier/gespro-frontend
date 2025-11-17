
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Calculator,
  User,
  Calendar,
  DollarSign,
  Clock,
  CheckCircle
} from 'lucide-react';
import { toast } from 'sonner';

interface AberturaCaixa {
  id: string;
  responsavel: string;
  dataAbertura: string;
  horaAbertura: string;
  valorInicial: number;
  observacoes?: string;
  status: 'aberto' | 'fechado';
}

export default function AberturaCaixaPage() {
  const [formData, setFormData] = useState({
    responsavel: '',
    valorInicial: '',
    observacoes: ''
  });

  const dataAtual = new Date().toLocaleDateString('pt-PT');
  const horaAtual = new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.responsavel || !formData.valorInicial) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const abertura: AberturaCaixa = {
      id: Date.now().toString(),
      responsavel: formData.responsavel,
      dataAbertura: dataAtual,
      horaAbertura: horaAtual,
      valorInicial: parseFloat(formData.valorInicial),
      observacoes: formData.observacoes,
      status: 'aberto'
    };

    // Salvar no localStorage
    const aberturas = JSON.parse(localStorage.getItem('aberturasCaixa') || '[]');
    aberturas.push(abertura);
    localStorage.setItem('aberturasCaixa', JSON.stringify(aberturas));
    localStorage.setItem('caixaAtual', JSON.stringify(abertura));

    toast.success('Caixa aberto com sucesso!');
    
    // Limpar formulário
    setFormData({
      responsavel: '',
      valorInicial: '',
      observacoes: ''
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Calculator className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Abertura de Caixa</h1>
          <p className="text-muted-foreground">Registar abertura de turno e valor inicial</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Dados da Abertura</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="data">Data</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="data"
                        value={dataAtual}
                        disabled
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="hora">Hora</Label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="hora"
                        value={horaAtual}
                        disabled
                        className="pl-10"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="responsavel">Responsável *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="responsavel"
                      placeholder="Nome do operador de caixa"
                      value={formData.responsavel}
                      onChange={(e) => setFormData({ ...formData, responsavel: e.target.value })}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="valorInicial">Valor Inicial em Caixa (MT) *</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="valorInicial"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={formData.valorInicial}
                      onChange={(e) => setFormData({ ...formData, valorInicial: e.target.value })}
                      className="pl-10"
                      required
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Valor em dinheiro disponível no início do turno
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="observacoes">Observações</Label>
                  <Textarea
                    id="observacoes"
                    placeholder="Observações sobre a abertura do caixa..."
                    value={formData.observacoes}
                    onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                    rows={4}
                  />
                </div>

                <div className="flex gap-3">
                  <Button type="submit" className="gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Abrir Caixa
                  </Button>
                  <Button type="button" variant="outline">
                    Cancelar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Instruções</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  Antes de Abrir
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
                  <li>Conte o dinheiro em caixa</li>
                  <li>Verifique notas e moedas</li>
                  <li>Confirme o valor inicial</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-blue-600" />
                  Durante o Turno
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
                  <li>Registar todas as vendas</li>
                  <li>Manter o caixa organizado</li>
                  <li>Verificar pagamentos</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-orange-600" />
                  Ao Fechar
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
                  <li>Contar todo o dinheiro</li>
                  <li>Reconciliar valores</li>
                  <li>Gerar relatório de fechamento</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dicas de Segurança</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex gap-2">
                  <span>•</span>
                  <span>Nunca deixe o caixa aberto sem supervisão</span>
                </li>
                <li className="flex gap-2">
                  <span>•</span>
                  <span>Verifique notas suspeitas</span>
                </li>
                <li className="flex gap-2">
                  <span>•</span>
                  <span>Mantenha valores altos no cofre</span>
                </li>
                <li className="flex gap-2">
                  <span>•</span>
                  <span>Registar todas as transações</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
