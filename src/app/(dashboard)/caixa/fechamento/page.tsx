
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  CreditCard,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Printer,
  Calendar,
  Clock
} from 'lucide-react';
import { toast } from 'sonner';

interface ContagemDinheiro {
  notas200: number;
  notas100: number;
  notas50: number;
  notas20: number;
  moedas10: number;
  moedas5: number;
  moedas2: number;
  moedas1: number;
}

export default function FechamentoCaixaPage() {
  const [caixaAtual, setCaixaAtual] = useState<any>(null);
  const [contagem, setContagem] = useState<ContagemDinheiro>({
    notas200: 0,
    notas100: 0,
    notas50: 0,
    notas20: 0,
    moedas10: 0,
    moedas5: 0,
    moedas2: 0,
    moedas1: 0
  });
  const [observacoes, setObservacoes] = useState('');

  useEffect(() => {
    const caixa = localStorage.getItem('caixaAtual');
    if (caixa) {
      setCaixaAtual(JSON.parse(caixa));
    }
  }, []);

  const calcularTotalContado = () => {
    return (
      contagem.notas200 * 200 +
      contagem.notas100 * 100 +
      contagem.notas50 * 50 +
      contagem.notas20 * 20 +
      contagem.moedas10 * 10 +
      contagem.moedas5 * 5 +
      contagem.moedas2 * 2 +
      contagem.moedas1 * 1
    );
  };

  const calcularVendasDoDia = () => {
    // Simular vendas do dia
    return 5420.50;
  };

  const calcularTotalEsperado = () => {
    if (!caixaAtual) return 0;
    return caixaAtual.valorInicial + calcularVendasDoDia();
  };

  const calcularDiferenca = () => {
    return calcularTotalContado() - calcularTotalEsperado();
  };

  const handleFecharCaixa = () => {
    if (!caixaAtual) {
      toast.error('Nenhum caixa aberto encontrado');
      return;
    }

    const diferenca = calcularDiferenca();
    
    const fechamento = {
      ...caixaAtual,
      dataFechamento: new Date().toLocaleDateString('pt-PT'),
      horaFechamento: new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
      vendasDia: calcularVendasDoDia(),
      totalEsperado: calcularTotalEsperado(),
      totalContado: calcularTotalContado(),
      diferenca: diferenca,
      contagem: contagem,
      observacoesFechamento: observacoes,
      status: 'fechado'
    };

    // Salvar fechamento
    const fechamentos = JSON.parse(localStorage.getItem('fechamentosCaixa') || '[]');
    fechamentos.push(fechamento);
    localStorage.setItem('fechamentosCaixa', JSON.stringify(fechamentos));
    
    // Remover caixa atual
    localStorage.removeItem('caixaAtual');

    toast.success('Caixa fechado com sucesso!');
    setCaixaAtual(null);
  };

  if (!caixaAtual) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">Nenhum Caixa Aberto</h2>
            <p className="text-muted-foreground mb-6">
              É necessário abrir um caixa antes de realizar o fechamento
            </p>
            <Button onClick={() => window.location.href = '/caixa/abertura'}>
              Abrir Caixa
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalContado = calcularTotalContado();
  const totalEsperado = calcularTotalEsperado();
  const diferenca = calcularDiferenca();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <CreditCard className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Fechamento de Caixa</h1>
          <p className="text-muted-foreground">Contagem e reconciliação de valores</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informações do Turno</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Responsável</Label>
                  <p className="font-medium">{caixaAtual.responsavel}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Data Abertura</Label>
                  <p className="font-medium">{caixaAtual.dataAbertura}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Hora Abertura</Label>
                  <p className="font-medium">{caixaAtual.horaAbertura}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Valor Inicial</Label>
                  <p className="font-medium">MT {caixaAtual.valorInicial.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contagem de Dinheiro</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-3">Notas</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Notas de MT 200</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min="0"
                        value={contagem.notas200}
                        onChange={(e) => setContagem({ ...contagem, notas200: parseInt(e.target.value) || 0 })}
                      />
                      <div className="flex items-center justify-center min-w-[100px] bg-muted rounded px-3">
                        MT {(contagem.notas200 * 200).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Notas de MT 100</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min="0"
                        value={contagem.notas100}
                        onChange={(e) => setContagem({ ...contagem, notas100: parseInt(e.target.value) || 0 })}
                      />
                      <div className="flex items-center justify-center min-w-[100px] bg-muted rounded px-3">
                        MT {(contagem.notas100 * 100).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Notas de MT 50</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min="0"
                        value={contagem.notas50}
                        onChange={(e) => setContagem({ ...contagem, notas50: parseInt(e.target.value) || 0 })}
                      />
                      <div className="flex items-center justify-center min-w-[100px] bg-muted rounded px-3">
                        MT {(contagem.notas50 * 50).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Notas de MT 20</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min="0"
                        value={contagem.notas20}
                        onChange={(e) => setContagem({ ...contagem, notas20: parseInt(e.target.value) || 0 })}
                      />
                      <div className="flex items-center justify-center min-w-[100px] bg-muted rounded px-3">
                        MT {(contagem.notas20 * 20).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-3">Moedas</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Moedas de MT 10</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min="0"
                        value={contagem.moedas10}
                        onChange={(e) => setContagem({ ...contagem, moedas10: parseInt(e.target.value) || 0 })}
                      />
                      <div className="flex items-center justify-center min-w-[100px] bg-muted rounded px-3">
                        MT {(contagem.moedas10 * 10).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Moedas de MT 5</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min="0"
                        value={contagem.moedas5}
                        onChange={(e) => setContagem({ ...contagem, moedas5: parseInt(e.target.value) || 0 })}
                      />
                      <div className="flex items-center justify-center min-w-[100px] bg-muted rounded px-3">
                        MT {(contagem.moedas5 * 5).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Moedas de MT 2</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min="0"
                        value={contagem.moedas2}
                        onChange={(e) => setContagem({ ...contagem, moedas2: parseInt(e.target.value) || 0 })}
                      />
                      <div className="flex items-center justify-center min-w-[100px] bg-muted rounded px-3">
                        MT {(contagem.moedas2 * 2).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Moedas de MT 1</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min="0"
                        value={contagem.moedas1}
                        onChange={(e) => setContagem({ ...contagem, moedas1: parseInt(e.target.value) || 0 })}
                      />
                      <div className="flex items-center justify-center min-w-[100px] bg-muted rounded px-3">
                        MT {(contagem.moedas1 * 1).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  placeholder="Observações sobre o fechamento..."
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Resumo do Fechamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Valor Inicial:</span>
                  <span className="font-medium">MT {caixaAtual.valorInicial.toFixed(2)}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Vendas do Dia:</span>
                  <span className="font-medium text-green-600">
                    + MT {calcularVendasDoDia().toFixed(2)}
                  </span>
                </div>

                <Separator />

                <div className="flex justify-between items-center">
                  <span className="font-medium">Total Esperado:</span>
                  <span className="font-bold">MT {totalEsperado.toFixed(2)}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="font-medium">Total Contado:</span>
                  <span className="font-bold">MT {totalContado.toFixed(2)}</span>
                </div>

                <Separator />

                <div className="flex justify-between items-center">
                  <span className="font-medium">Diferença:</span>
                  <span className={`font-bold ${diferenca === 0 ? 'text-green-600' : diferenca > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {diferenca >= 0 ? '+' : ''} MT {diferenca.toFixed(2)}
                  </span>
                </div>

                {diferenca !== 0 && (
                  <div className="bg-muted p-3 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <p className="text-sm">
                        {diferenca > 0 
                          ? 'Há um excedente no caixa. Verifique se todas as vendas foram registadas.'
                          : 'Há uma falta no caixa. Verifique a contagem e os registos de vendas.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                className="w-full gap-2" 
                onClick={handleFecharCaixa}
                disabled={totalContado === 0}
              >
                <CheckCircle className="h-4 w-4" />
                Confirmar Fechamento
              </Button>

              <Button variant="outline" className="w-full gap-2">
                <Printer className="h-4 w-4" />
                Imprimir Relatório
              </Button>

              <Button variant="outline" className="w-full">
                Cancelar
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status do Caixa</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="bg-green-600">
                    Caixa Aberto
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {caixaAtual.dataAbertura}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="h-4 w-4" />
                    {caixaAtual.horaAbertura}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
