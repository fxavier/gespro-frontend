'use client';

/**
 * Gráficos do relatório de Produção — CLIENT COMPONENT (recharts precisa do DOM).
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

export function GraficoOrdensPorStatus({ dados }: { dados: { status: string; total: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ordens por Estado</CardTitle>
      </CardHeader>
      <CardContent className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} barSize={36}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="status" tick={{ fontSize: 11 }} className="text-muted-foreground" />
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

export function GraficoCustos({
  estimado,
  realizado,
}: {
  estimado: string;
  realizado: string;
}) {
  const dados = [
    { nome: 'Estimado', valor: parseFloat(estimado) },
    { nome: 'Realizado', valor: parseFloat(realizado) },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Custo (Estimado vs. Realizado)</CardTitle>
      </CardHeader>
      <CardContent className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} barSize={48}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="nome" tick={{ fontSize: 11 }} className="text-muted-foreground" />
            <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
            <Tooltip
              formatter={(v: number) => `MT ${v.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`}
              contentStyle={ESTILO_TOOLTIP}
            />
            <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
              <Cell fill="hsl(var(--chart-2))" />
              <Cell fill="hsl(var(--chart-1))" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
