'use client';

/**
 * Gráficos do Analytics — CLIENT COMPONENT carregado com dynamic().
 * Recharts requer acesso ao DOM; não pode ser Server Component.
 * Cores: apenas tokens CSS (@theme) — sem hardcoded.
 */

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface GraficoVendasProps {
  totalVendasMes: string;
  totalVendasAnoAnterior: string;
  quantidadeVendas: number;
}

export function GraficoVendas({
  totalVendasMes,
  totalVendasAnoAnterior,
  quantidadeVendas,
}: GraficoVendasProps) {
  const data = [
    { nome: 'Ano Anterior', valor: parseFloat(totalVendasAnoAnterior) },
    { nome: 'Mês Actual', valor: parseFloat(totalVendasMes) },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vendas — Comparativo</CardTitle>
      </CardHeader>
      <CardContent className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barSize={40}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="nome" tick={{ fontSize: 12 }} className="text-muted-foreground" />
            <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
            <Tooltip
              formatter={(value: number) =>
                `MT ${value.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}`
              }
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                borderColor: 'hsl(var(--border))',
                color: 'hsl(var(--card-foreground))',
                fontSize: 12,
              }}
            />
            <Bar dataKey="valor" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-2 tabular-nums">
          {quantidadeVendas} vendas no mês actual
        </p>
      </CardContent>
    </Card>
  );
}

interface GraficoOperacoesProps {
  ticketsAbertos: number;
  ticketsDentroSLA: number;
  ticketsForaSLA: number;
  viaturaDisponiveis: number;
  viaturaEmMissao: number;
  viaturaEmManutencao: number;
}

export function GraficoOperacoes({
  ticketsAbertos,
  ticketsDentroSLA,
  ticketsForaSLA,
  viaturaDisponiveis,
  viaturaEmMissao,
  viaturaEmManutencao,
}: GraficoOperacoesProps) {
  const ticketsData = [
    { nome: 'Dentro SLA', valor: ticketsDentroSLA },
    { nome: 'Fora de SLA', valor: ticketsForaSLA },
  ];

  const viaturasData = [
    { nome: 'Disponíveis', valor: viaturaDisponiveis },
    { nome: 'Em Missão', valor: viaturaEmMissao },
    { nome: 'Manutenção', valor: viaturaEmManutencao },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Operações — Tickets ({ticketsAbertos} abertos)</CardTitle>
      </CardHeader>
      <CardContent className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={ticketsData} barSize={32}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                borderColor: 'hsl(var(--border))',
                color: 'hsl(var(--card-foreground))',
                fontSize: 12,
              }}
            />
            <Bar dataKey="valor" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2 text-xs text-muted-foreground tabular-nums">
          <span>Viaturas: {viaturaDisponiveis} disp. · {viaturaEmMissao} missão · {viaturaEmManutencao} manut.</span>
        </div>
      </CardContent>
    </Card>
  );
}

interface GraficoFinancasProps {
  receitaMes: string;
  despesaMes: string;
  resultadoLiquido: string;
}

export function GraficoFinancas({ receitaMes, despesaMes, resultadoLiquido }: GraficoFinancasProps) {
  const data = [
    { nome: 'Receita', valor: parseFloat(receitaMes) },
    { nome: 'Despesa', valor: parseFloat(despesaMes) },
    { nome: 'Resultado', valor: parseFloat(resultadoLiquido) },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Finanças — Mês Actual</CardTitle>
      </CardHeader>
      <CardContent className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barSize={32}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(value: number) =>
                `MT ${value.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}`
              }
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                borderColor: 'hsl(var(--border))',
                color: 'hsl(var(--card-foreground))',
                fontSize: 12,
              }}
            />
            <Bar dataKey="valor" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
