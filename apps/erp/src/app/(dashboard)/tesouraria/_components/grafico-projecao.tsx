'use client';

/**
 * Gráfico de linha do saldo projectado — CLIENT COMPONENT (Recharts precisa
 * do DOM). É o RESUMO da projecção; a fonte é a `TabelaBuckets` e o gráfico
 * nunca a substitui (R7.2).
 *
 * Usa os `ChartContainer`/`ChartTooltip` partilhados (`src/components/ui/
 * chart.tsx`) e só tokens de tema — os tokens `--chart-*` são cores
 * completas (oklch), pelo que se referenciam com `var(--chart-1)`, nunca
 * `hsl(var(--chart-1))`.
 *
 * O `number` aqui é SÓ para desenhar: a aritmética da projecção vive em
 * `Decimal` no servidor e a tabela apresenta os valores exactos.
 */

import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatMZN, formatMZNCompact } from '@/lib/format-currency';
import { formatarData, formatarDiaMes } from '@/lib/format-date';
import type { BucketSerializado } from './tabela-buckets';

const chartConfig = {
  saldo: {
    label: 'Saldo projectado',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig;

interface GraficoProjecaoProps {
  buckets: BucketSerializado[];
}

export function GraficoProjecao({ buckets }: GraficoProjecaoProps) {
  const dados = buckets.map((b) => ({
    dia: formatarDiaMes(b.inicio),
    inicio: b.inicio,
    saldo: parseFloat(b.saldoFinal),
  }));

  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto h-64 w-full"
      role="img"
      aria-label="Gráfico de linha do saldo projectado por período; os valores exactos estão na tabela de buckets abaixo"
    >
      <LineChart data={dados} margin={{ left: 12, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="dia"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={72}
          tickFormatter={(v: number) => formatMZNCompact(v)}
        />
        {/* Linha de zero: a fronteira da ruptura fica visível mesmo sem cor */}
        <ReferenceLine y={0} stroke="var(--destructive)" strokeDasharray="4 4" />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) =>
                formatarData(payload?.[0]?.payload?.inicio)
              }
              formatter={(value) => (
                <span className="font-medium tabular-nums">
                  {formatMZN(Number(value))}
                </span>
              )}
            />
          }
        />
        <Line
          dataKey="saldo"
          type="monotone"
          stroke="var(--color-saldo)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
