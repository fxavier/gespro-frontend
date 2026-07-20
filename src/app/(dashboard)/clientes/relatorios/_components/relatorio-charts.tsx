'use client';

/**
 * Gráficos do relatório de Clientes — CLIENT COMPONENT (recharts precisa do DOM).
 * Cores apenas por tokens (`hsl(var(--chart-*))`); dark-mode automático.
 */
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const CORES = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

const ESTILO_TOOLTIP = {
  backgroundColor: 'hsl(var(--card))',
  borderColor: 'hsl(var(--border))',
  color: 'hsl(var(--card-foreground))',
  fontSize: 12,
} as const;

export function GraficoPorCategoria({
  dados,
}: {
  dados: { categoria: string; total: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Clientes por Categoria</CardTitle>
      </CardHeader>
      <CardContent className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} barSize={36}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="categoria" tick={{ fontSize: 11 }} className="text-muted-foreground" />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="text-muted-foreground" />
            <Tooltip contentStyle={ESTILO_TOOLTIP} />
            <Bar dataKey="total" radius={[4, 4, 0, 0]}>
              {dados.map((_, i) => (
                <Cell key={i} fill={CORES[i % CORES.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function GraficoTopDivida({
  dados,
}: {
  dados: { nome: string; divida: string }[];
}) {
  const data = dados.map((d) => ({ nome: d.nome, valor: parseFloat(d.divida) }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Maiores Dívidas (Top 5)</CardTitle>
      </CardHeader>
      <CardContent className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" barSize={22}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis type="number" tick={{ fontSize: 11 }} className="text-muted-foreground" />
            <YAxis
              type="category"
              dataKey="nome"
              width={120}
              tick={{ fontSize: 11 }}
              className="text-muted-foreground"
            />
            <Tooltip
              formatter={(v: number) => `MT ${v.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`}
              contentStyle={ESTILO_TOOLTIP}
            />
            <Bar dataKey="valor" radius={[0, 4, 4, 0]} fill="hsl(var(--chart-1))" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
