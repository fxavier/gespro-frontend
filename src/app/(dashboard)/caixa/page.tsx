
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  DollarSign,
  TrendingUp,
  Calculator,
  CreditCard,
  AlertCircle,
  CheckCircle,
  Clock,
  Calendar,
  ArrowRight,
  History
} from 'lucide-react';
import Link from 'next/link';

interface CaixaAtual {
  id: string;
  responsavel: string;
  dataAbertura: string;
  horaAbertura: string;
  valorInicial: number;
  status: 'aberto' | 'fechado';
}

interface Fechamento {
  id: string;
  responsavel: string;
  dataAbertura: string;
  dataFechamento: string;
  valorInicial: number;
  vendasDia: number;
  totalEsperado: number;
  totalContado: number;
  diferenca: number;
}

export default function CaixaPage() {
  const [caixaAtual, setCaixaAtual] = useState<CaixaAtual | null>(null);
  const [historico, setHistorico] = useState<Fechamento[]>([]);

  useEffect(() => {
    // Carregar caixa atual
    const caixa = localStorage.getItem('caixaAtual');
    if (caixa) {
      setCaixaAtual(JSON.parse(caixa));
    }

    // Carregar histórico de fechamentos
    const fechamentos = localStorage.getItem('fechamentosCaixa');
    if (fechamentos) {
      const dados = JSON.parse(fechamentos);
      setHistorico(dados.slice(-5).reverse()); // Últimos 5 fechamentos
    }
  }, []);

  const calcularVendasDoDia = () => {
    // Simular vendas do dia
    return 5420.50;
  };

  const calcularTotalAtual = () => {
    if (!caixaAtual) return 0;
    return caixaAtual.valorInicial + calcularVendasDoDia();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DollarSign className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Gestão de Caixa</h1>
            <p className="text-muted-foreground">Controle de abertura, fechamento e movimentações</p>
          </div>
        </div>

        <div className="flex gap-3">
          {!caixaAtual ? (
            <Button asChild size="lg" className="gap-2">
              <Link href="/caixa/abertura">
                <Calculator className="h-4 w-4" />
                Abrir Caixa
              </Link>
            </Button>
          ) : (
            <Button asChild size="lg" variant="destructive" className="gap-2">
              <Link href="/caixa/fechamento">
                <CreditCard className="h-4 w-4" />
                Fechar Caixa
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Status do Caixa */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status do Caixa</CardTitle>
            {caixaAtual ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-orange-600" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {caixaAtual ? (
                <Badge className="bg-green-600">Aberto</Badge>
              ) : (
                <Badge variant="secondary">Fechado</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {caixaAtual 
                ? `Aberto desde ${caixaAtual.horaAbertura}`
                : 'Nenhum caixa aberto no momento'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Inicial</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              MT {caixaAtual ? caixaAtual.valorInicial.toFixed(2) : '0.00'}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Valor de abertura do caixa
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendas do Dia</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              + MT {caixaAtual ? calcularVendasDoDia().toFixed(2) : '0.00'}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Total de vendas realizadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Atual</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              MT {caixaAtual ? calcularTotalAtual().toFixed(2) : '0.00'}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Valor total em caixa
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Informações do Caixa Atual */}
      {caixaAtual && (
        <Card>
          <CardHeader>
            <CardTitle>Caixa Atual</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm">Data de Abertura</span>
                </div>
                <p className="text-lg font-semibold">{caixaAtual.dataAbertura}</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm">Hora de Abertura</span>
                </div>
                <p className="text-lg font-semibold">{caixaAtual.horaAbertura}</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm">Responsável</span>
                </div>
                <p className="text-lg font-semibold">{caixaAtual.responsavel}</p>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <Button asChild variant="outline" className="gap-2">
                <Link href="/pos">
                  <ArrowRight className="h-4 w-4" />
                  Ir para POS
                </Link>
              </Button>
              <Button asChild variant="destructive" className="gap-2">
                <Link href="/caixa/fechamento">
                  <CreditCard className="h-4 w-4" />
                  Fechar Caixa
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ações Rápidas */}
      {!caixaAtual && (
        <Card>
          <CardHeader>
            <CardTitle>Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button asChild size="lg" className="h-24 flex-col gap-2">
                <Link href="/caixa/abertura">
                  <Calculator className="h-8 w-8" />
                  <span>Abrir Caixa</span>
                </Link>
              </Button>

              <Button asChild size="lg" variant="outline" className="h-24 flex-col gap-2" disabled>
                <Link href="/caixa/fechamento">
                  <CreditCard className="h-8 w-8" />
                  <span>Fechar Caixa</span>
                </Link>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-4 text-center">
              É necessário abrir um caixa antes de realizar operações
            </p>
          </CardContent>
        </Card>
      )}

      {/* Histórico de Fechamentos */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Histórico de Fechamentos
            </CardTitle>
            <Button variant="outline" size="sm">
              Ver Todos
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {historico.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum fechamento registrado ainda</p>
            </div>
          ) : (
            <div className="space-y-4">
              {historico.map((fechamento) => (
                <div 
                  key={fechamento.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <p className="font-medium">{fechamento.responsavel}</p>
                      <Badge variant="outline" className="text-xs">
                        {fechamento.dataFechamento}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Abertura: {fechamento.dataAbertura}
                    </p>
                  </div>

                  <div className="text-right space-y-1">
                    <p className="text-sm text-muted-foreground">Total Contado</p>
                    <p className="text-lg font-bold">MT {fechamento.totalContado.toFixed(2)}</p>
                    {fechamento.diferenca !== 0 && (
                      <p className={`text-sm ${fechamento.diferenca > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {fechamento.diferenca > 0 ? '+' : ''} MT {fechamento.diferenca.toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instruções */}
      <Card>
        <CardHeader>
          <CardTitle>Como Funciona</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-primary font-bold">1</span>
                </div>
                <h4 className="font-semibold">Abertura</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                Registre o valor inicial em caixa e o responsável pelo turno
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-primary font-bold">2</span>
                </div>
                <h4 className="font-semibold">Operação</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                Realize vendas e registre todas as transações durante o turno
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-primary font-bold">3</span>
                </div>
                <h4 className="font-semibold">Fechamento</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                Conte o dinheiro, reconcilie valores e gere o relatório final
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
