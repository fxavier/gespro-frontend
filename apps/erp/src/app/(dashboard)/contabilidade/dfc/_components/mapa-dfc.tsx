/**
 * O mapa da DFC — Server Component (sem 'use client'; nó `fatia`, ticket 6.3).
 *
 * Renderiza no servidor, a partir do `DFC` do serviço, sem atravessar a
 * fronteira RSC com `Decimal` nem com funções: os valores saem já formatados
 * por `formatMZN`. Só a coluna N (a N-1, com «—» sem exercício anterior, é do
 * nó `pagina`). O único componente cliente é o `StatusBadge`, que recebe
 * strings.
 *
 * A linha de articulação mostra `caixa inicial + fluxo das actividades = caixa
 * final` e a diferença. O serviço já garantiu que a diferença é zero —
 * `verificarArticulacao` corre em produção e, se falhasse, este componente
 * nunca receberia o mapa —, mas a demonstração mostra-a na mesma: é a prova
 * que o leitor tem à frente.
 */
import type { Prisma } from '@prisma/client';
import { Info, TriangleAlert } from 'lucide-react';
import type { DFC, SeccaoDFC } from '@/server/services/financas/dfc.interface';
import { formatMZN } from '@/lib/format-currency';
import { formatarData } from '@/lib/format-date';
import { StatusBadge } from '@/components/patterns';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const TITULO_SECCAO: Record<SeccaoDFC['atividade'], { titulo: string; total: string }> = {
  OPERACIONAL: {
    titulo: 'Actividades operacionais',
    total: 'Fluxo de caixa das actividades operacionais',
  },
  INVESTIMENTO: {
    titulo: 'Actividades de investimento',
    total: 'Fluxo de caixa das actividades de investimento',
  },
  FINANCIAMENTO: {
    titulo: 'Actividades de financiamento',
    total: 'Fluxo de caixa das actividades de financiamento',
  },
};

/** Dinheiro para o ecrã: `Decimal` → 2 casas → `formatMZN`. Nunca `number` pelo meio da aritmética. */
function mzn(v: Prisma.Decimal): string {
  return formatMZN(v.toFixed(2));
}

function Linha({
  rotulo,
  valor,
  nivel = 0,
  forte = false,
  destaque = false,
  testId,
}: {
  rotulo: string;
  valor: Prisma.Decimal;
  nivel?: 0 | 1;
  forte?: boolean;
  destaque?: boolean;
  testId?: string;
}) {
  return (
    <TableRow className={cn(destaque && 'bg-muted/50', (forte || destaque) && 'font-semibold')} data-testid={testId}>
      <TableCell className={cn(nivel === 1 && 'pl-8')}>{rotulo}</TableCell>
      <TableCell className={cn('text-right tabular-nums', valor.isNegative() && 'text-destructive')}>
        {mzn(valor)}
      </TableCell>
    </TableRow>
  );
}

function Seccao({ seccao, resultadoLiquido }: { seccao: SeccaoDFC; resultadoLiquido?: Prisma.Decimal }) {
  const t = TITULO_SECCAO[seccao.atividade];
  return (
    <>
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={2} className="pt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t.titulo}
        </TableCell>
      </TableRow>
      {resultadoLiquido && <Linha rotulo="Resultado líquido do período" valor={resultadoLiquido} nivel={1} />}
      {seccao.rubricas.map((l) => (
        <Linha key={l.rubrica.id} rotulo={`${l.rubrica.codigo} · ${l.rubrica.designacao}`} valor={l.valor} nivel={1} />
      ))}
      {seccao.rubricas.length === 0 && !resultadoLiquido && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={2} className="pl-8 text-sm text-muted-foreground">
            Sem movimentos nesta actividade.
          </TableCell>
        </TableRow>
      )}
      <Linha rotulo={t.total} valor={seccao.total} forte testId={`dfc-total-${seccao.atividade.toLowerCase()}`} />
    </>
  );
}

export function MapaDFC({ dfc }: { dfc: DFC }) {
  const { atual, versao, provisorio, avisos } = dfc;
  const { seccoes } = atual;
  const diferenca = atual.caixaInicial.plus(seccoes.somaAtividades).minus(atual.caixaFinal);

  return (
    <div className="space-y-4">
      {versao.estado === 'PENDING' && (
        <Alert data-testid="dfc-faixa-por-validar" className="border-warning/40 bg-warning/10">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Mapeamento por validar · versão {versao.numero}</AlertTitle>
          <AlertDescription>
            A classificação das contas nas actividades desta demonstração ainda não foi validada por um
            contabilista. Os totais articulam; a atribuição de cada conta a uma actividade pode mudar.
          </AlertDescription>
        </Alert>
      )}

      {avisos.length > 0 && (
        <Alert>
          <Info className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Avisos da configuração de caixa</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {avisos.map((a) => (
                <li key={`${a.codigo}-${a.conta.id}`}>{a.mensagem}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">
            {atual.periodoInicio.codigo === atual.periodoFim.codigo
              ? `Período ${atual.periodoInicio.codigo}`
              : `Períodos ${atual.periodoInicio.codigo} a ${atual.periodoFim.codigo}`}{' '}
            <span className="font-normal text-muted-foreground">
              ({formatarData(atual.periodoInicio.dataInicio)} – {formatarData(atual.periodoFim.dataFim)})
            </span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {provisorio && <StatusBadge status="PROVISORIO" />}
            <StatusBadge status={versao.estado} label={`Mapeamento v${versao.numero} · ${versao.estado === 'PENDING' ? 'Por validar' : 'Validado'}`} />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Método indirecto</TableHead>
                <TableHead className="text-right">Exercício {atual.exercicio.codigo}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <Seccao seccao={seccoes.operacional} resultadoLiquido={seccoes.resultadoLiquido} />
              <Seccao seccao={seccoes.investimento} />
              <Seccao seccao={seccoes.financiamento} />
              <Linha
                rotulo="Variação de caixa e equivalentes (actividades)"
                valor={seccoes.somaAtividades}
                destaque
                testId="dfc-soma-atividades"
              />
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card data-testid="dfc-articulacao">
        <CardHeader>
          <CardTitle className="text-base">Articulação</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="text-sm">
            <TableBody>
              <Linha rotulo="Caixa e equivalentes no início do período" valor={atual.caixaInicial} testId="dfc-caixa-inicial" />
              <Linha rotulo="(+) Fluxo das actividades" valor={seccoes.somaAtividades} />
              <Linha rotulo="Caixa e equivalentes no fim do período" valor={atual.caixaFinal} forte testId="dfc-caixa-final" />
              <TableRow data-testid="dfc-articulacao-diferenca" className="bg-muted/50 font-semibold">
                <TableCell>Diferença (caixa inicial + variação − caixa final)</TableCell>
                <TableCell className={cn('text-right tabular-nums', !diferenca.isZero() && 'text-destructive')}>
                  {mzn(diferenca)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
