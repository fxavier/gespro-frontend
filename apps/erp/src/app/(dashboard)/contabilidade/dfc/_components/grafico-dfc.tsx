'use client';

/**
 * Gráfico de barras da DFC por actividade — CLIENT COMPONENT (o Recharts
 * precisa do DOM). Nó `pagina`, ticket 8.2.
 *
 * É um RESUMO: a fonte é a tabela do mapa, e o gráfico não a substitui. Os
 * valores chegam como strings decimais (serializadas no servidor a partir do
 * `Decimal` do `gerarDFC`); o `parseFloat` aqui é só para desenhar a barra —
 * nenhuma aritmética de dinheiro acontece no cliente, e a dica mostra o texto
 * já formatado que veio do servidor.
 *
 * Cores só por tokens de tema (`var(--chart-n)`, oklch completas, e
 * `var(--border)`), que mudam no tema escuro. Nada de hex.
 */

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { formatMZNCompact } from '@/lib/format-currency';

export interface BarraDFC {
  chave: 'operacional' | 'investimento' | 'financiamento' | 'variacao';
  rotulo: string;
  /** String decimal (ex.: "-1234.50"), vinda do `Decimal` do serviço. */
  valor: string;
  /** O mesmo valor já formatado por `formatMZN` no servidor. */
  texto: string;
}

const chartConfig = {
  operacional: { label: 'Operacionais', color: 'var(--chart-1)' },
  investimento: { label: 'Investimento', color: 'var(--chart-2)' },
  financiamento: { label: 'Financiamento', color: 'var(--chart-3)' },
  variacao: { label: 'Variação de caixa', color: 'var(--chart-4)' },
} satisfies ChartConfig;

export function GraficoDFC({ barras }: { barras: BarraDFC[] }) {
  const dados = barras.map((b) => ({ ...b, numero: parseFloat(b.valor) }));
  const resumo = barras.map((b) => `${b.rotulo}: ${b.texto}`).join('; ');

  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto h-64 w-full"
      role="img"
      aria-label={`Gráfico de barras dos fluxos de caixa por actividade — ${resumo}. Os valores exactos estão na tabela abaixo.`}
      data-testid="dfc-grafico"
    >
      <BarChart data={dados} margin={{ left: 12, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={72} tickFormatter={(v: number) => formatMZNCompact(v)} />
        <ReferenceLine y={0} stroke="var(--border)" />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              hideIndicator
              formatter={(_valor, _nome, item) => (
                <span className="font-medium tabular-nums">{(item?.payload as { texto?: string } | undefined)?.texto}</span>
              )}
            />
          }
        />
        <Bar dataKey="numero" radius={4}>
          {dados.map((d) => (
            <Cell key={d.chave} fill={`var(--color-${d.chave})`} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
