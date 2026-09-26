/**
 * O mapa da DFC — Server Component (sem 'use client'). Nó `fatia` (ticket 6.3),
 * completado no nó `pagina` (ticket 8 e 9.2).
 *
 * Renderiza no servidor, a partir do `DFC` do serviço. Não atravessa a
 * fronteira RSC com `Decimal` nem com funções: os valores saem já formatados
 * por `formatMZN`, e os componentes cliente (`LinhaRubrica`, `GraficoDFC`,
 * `ExportarPdfDFC`, `StatusBadge`) recebem strings e booleanos. A página não
 * recalcula nada — só EMPARELHA N com N-1 (`compararSeccao`); a única conta
 * feita aqui é a diferença da articulação, que o serviço já garantiu ser zero e
 * que se mostra como a prova que o leitor tem à frente.
 *
 *  - 8.1 Coluna N-1 (`homologo`, E3). Sem exercício anterior, «—» em todas as
 *    linhas; com exercício anterior, uma rubrica sem movimento num dos lados
 *    vale 0,00 (a regra do PDF).
 *  - 8.2 `KpiCard` de OP, INV, FIN e Δcaixa, e o gráfico de barras.
 *  - 8.3 Cada rubrica expande para as suas contas (o `LinhaRubricaDFC.contas`
 *    do serviço), cada uma ligada ao razão do mesmo intervalo.
 *  - 8.4 Reconciliação com a DRE: o resultado líquido que abre a secção
 *    operacional é o `lucroLiquido` de `gerarDRE` do mesmo intervalo (I9), e a
 *    ligação abre a DRE com as mesmas datas.
 *  - 9.2 «Exportar PDF» para quem tem `financas:exportar`.
 */
import Link from 'next/link';
import { Prisma } from '@prisma/client';
import { ArrowRight, Info, TriangleAlert } from 'lucide-react';
import type { ColunaDFC, DFC, SeccaoDFC } from '@/server/services/financas/dfc.interface';
import { formatMZN } from '@/lib/format-currency';
import { formatarData, formatarDiaIso } from '@/lib/format-date';
import { compararSeccao } from '@/lib/dfc-linhas';
import { KpiCard, StatusBadge } from '@/components/patterns';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { LinhaRubrica, type ValorCelula } from './linha-rubrica';
import { GraficoDFC, type BarraDFC } from './grafico-dfc';
import { ExportarPdfDFC } from './exportar-pdf';

type ChaveSeccao = 'operacional' | 'investimento' | 'financiamento';

const SECCOES: { chave: ChaveSeccao; atividade: SeccaoDFC['atividade']; titulo: string; total: string; curto: string }[] = [
  {
    chave: 'operacional',
    atividade: 'OPERACIONAL',
    titulo: 'Actividades operacionais',
    total: 'Fluxo de caixa das actividades operacionais',
    curto: 'Operacionais',
  },
  {
    chave: 'investimento',
    atividade: 'INVESTIMENTO',
    titulo: 'Actividades de investimento',
    total: 'Fluxo de caixa das actividades de investimento',
    curto: 'Investimento',
  },
  {
    chave: 'financiamento',
    atividade: 'FINANCIAMENTO',
    titulo: 'Actividades de financiamento',
    total: 'Fluxo de caixa das actividades de financiamento',
    curto: 'Financiamento',
  },
];

const SEM_VALOR = '—';

/**
 * Sem tinta de fundo ao passar o rato: o `text-destructive` dos negativos sobre
 * o `hover:bg-muted/50` da `TableRow` fica a 4,47:1 no tema claro, abaixo do AA
 * (o axe apanhou-o com o rato em cima da rubrica acabada de expandir). Pela
 * mesma razão as linhas de destaque usam um filete e não fundo.
 */
const TABELA = 'text-sm [&_tr:hover]:bg-transparent';
const ZERO = new Prisma.Decimal(0);

/** Dinheiro para o ecrã: `Decimal` → 2 casas → `formatMZN`. Nunca `number` pelo meio da aritmética. */
function mzn(v: Prisma.Decimal): string {
  return formatMZN(v.toFixed(2));
}

function celula(v: Prisma.Decimal): ValorCelula {
  return { texto: mzn(v), negativo: v.isNegative() };
}

/**
 * Célula N-1: «—» sem exercício anterior; com ele, o valor, ou 0,00 quando
 * aquela linha não teve movimento no homólogo.
 */
function celulaN1(temHomologo: boolean, v: Prisma.Decimal | null | undefined): ValorCelula {
  if (!temHomologo) return { texto: SEM_VALOR, negativo: false };
  return celula(v ?? ZERO);
}

/** `aaaa-mm-dd` (dia civil em Maputo) do intervalo de uma coluna. */
function datasDe(c: ColunaDFC): { dataInicio: string; dataFim: string } {
  return { dataInicio: formatarDiaIso(c.periodoInicio.dataInicio), dataFim: formatarDiaIso(c.periodoFim.dataFim) };
}

function qs(p: Record<string, string>): string {
  return new URLSearchParams(p).toString();
}

function Linha({
  rotulo,
  n,
  n1,
  forte = false,
  destaque = false,
  recuo = false,
  testId,
}: {
  rotulo: string;
  n: ValorCelula;
  n1: ValorCelula;
  forte?: boolean;
  destaque?: boolean;
  recuo?: boolean;
  testId?: string;
}) {
  return (
    <TableRow className={cn(destaque && 'border-t-2', (forte || destaque) && 'font-semibold')} data-testid={testId}>
      <TableCell className={cn(recuo && 'pl-9')}>{rotulo}</TableCell>
      <TableCell className={cn('text-right tabular-nums', n.negativo && 'text-destructive')}>{n.texto}</TableCell>
      <TableCell className={cn('text-right tabular-nums', n1.negativo && 'text-destructive')}>{n1.texto}</TableCell>
    </TableRow>
  );
}

function Seccao({ dfc, s }: { dfc: DFC; s: (typeof SECCOES)[number] }) {
  const { atual, homologo } = dfc;
  const temHomologo = homologo !== null;
  const seccaoN = atual.seccoes[s.chave];
  const seccaoN1 = homologo?.seccoes[s.chave] ?? null;
  const linhas = compararSeccao(seccaoN, seccaoN1);
  const { dataInicio, dataFim } = datasDe(atual);
  const abreResultado = s.chave === 'operacional';

  return (
    <>
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={3} className="pt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {s.titulo}
        </TableCell>
      </TableRow>
      {abreResultado && (
        <Linha
          rotulo="Resultado líquido do período"
          n={celula(atual.seccoes.resultadoLiquido)}
          n1={celulaN1(temHomologo, homologo?.seccoes.resultadoLiquido)}
          recuo
          testId="dfc-linha-resultado-liquido"
        />
      )}
      {linhas.map((l) => (
        <LinhaRubrica
          key={l.rubrica.id}
          id={l.rubrica.id}
          codigo={l.rubrica.codigo}
          designacao={l.rubrica.designacao}
          n={celula(l.n?.valor ?? ZERO)}
          n1={celulaN1(temHomologo, l.n1?.valor)}
          contas={l.contas.map((c) => ({
            id: c.conta.id,
            codigo: c.conta.codigo,
            nome: c.conta.nome,
            variacao: c.n ? mzn(c.n.variacao) : null,
            n: celula(c.n?.efeitoCaixa ?? ZERO),
            n1: celulaN1(temHomologo, c.n1?.efeitoCaixa),
            hrefRazao: `/contabilidade/razao-geral?${qs({ contaId: c.conta.id, dataInicio, dataFim })}`,
          }))}
        />
      ))}
      {linhas.length === 0 && !abreResultado && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={3} className="pl-9 text-sm text-muted-foreground">
            Sem movimentos nesta actividade.
          </TableCell>
        </TableRow>
      )}
      <Linha
        rotulo={s.total}
        n={celula(seccaoN.total)}
        n1={celulaN1(temHomologo, seccaoN1?.total)}
        forte
        testId={`dfc-total-${s.chave}`}
      />
    </>
  );
}

function intervaloTexto(c: ColunaDFC): string {
  return c.periodoInicio.codigo === c.periodoFim.codigo
    ? `Período ${c.periodoInicio.codigo}`
    : `Períodos ${c.periodoInicio.codigo} a ${c.periodoFim.codigo}`;
}

export function MapaDFC({ dfc, podeExportar }: { dfc: DFC; podeExportar: boolean }) {
  const { atual, homologo, versao, provisorio, avisos } = dfc;
  const { seccoes } = atual;
  const temHomologo = homologo !== null;
  const diferenca = atual.caixaInicial.plus(seccoes.somaAtividades).minus(atual.caixaFinal);
  const datas = datasDe(atual);

  const kpis: { chave: BarraDFC['chave']; titulo: string; n: Prisma.Decimal; n1: Prisma.Decimal | null }[] = [
    ...SECCOES.map((s) => ({
      chave: s.chave,
      titulo: `Fluxo ${s.chave === 'operacional' ? 'operacional' : `de ${s.chave}`}`,
      n: seccoes[s.chave].total,
      n1: homologo ? homologo.seccoes[s.chave].total : null,
    })),
    { chave: 'variacao', titulo: 'Variação de caixa (Δcaixa)', n: atual.variacaoCaixa, n1: homologo?.variacaoCaixa ?? null },
  ];
  const barras: BarraDFC[] = kpis.map((k, i) => ({
    chave: k.chave,
    rotulo: i < SECCOES.length ? SECCOES[i]!.curto : 'Δcaixa',
    valor: k.n.toFixed(2),
    texto: mzn(k.n),
  }));

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
        <Alert data-testid="dfc-avisos">
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="dfc-kpis">
        {kpis.map((k) => (
          <KpiCard
            key={k.chave}
            title={k.titulo}
            value={mzn(k.n)}
            description={`N-1: ${k.n1 ? mzn(k.n1) : SEM_VALOR}`}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fluxos por actividade</CardTitle>
          <CardDescription>{intervaloTexto(atual)} — resumo; os valores exactos estão na tabela.</CardDescription>
        </CardHeader>
        <CardContent>
          <GraficoDFC barras={barras} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start gap-2 space-y-0">
          <CardTitle className="text-base">
            {intervaloTexto(atual)}{' '}
            <span className="font-normal text-muted-foreground">
              ({formatarData(atual.periodoInicio.dataInicio)} – {formatarData(atual.periodoFim.dataFim)})
            </span>
          </CardTitle>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {provisorio && <StatusBadge status="PROVISORIO" />}
            {/* O rótulo do estado vem do mapa único (`STATUS_LABELS`, dentro do
                StatusBadge): «Por validar»/«Validado». O número da versão fica ao lado. */}
            <span className="text-xs text-muted-foreground" data-testid="dfc-versao">
              Mapeamento v{versao.numero}
            </span>
            <StatusBadge status={versao.estado} />
          </div>
          {/* Filho directo do cabeçalho (flex-wrap): o botão fica na linha dos
              badges e o erro do 422 ocupa uma linha inteira por baixo. */}
          {podeExportar && <ExportarPdfDFC href={`/api/contabilidade/dfc/export?${qs(datas)}`} />}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className={TABELA}>
            <TableHeader>
              <TableRow>
                <TableHead>Método indirecto</TableHead>
                <TableHead className="text-right">Exercício {atual.exercicio.codigo}</TableHead>
                <TableHead className="text-right" data-testid="dfc-coluna-n1">
                  {homologo ? `Exercício ${homologo.exercicio.codigo} (N-1)` : 'N-1'}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SECCOES.map((s) => (
                <Seccao key={s.chave} dfc={dfc} s={s} />
              ))}
              <Linha
                rotulo="Variação de caixa e equivalentes (actividades)"
                n={celula(seccoes.somaAtividades)}
                n1={celulaN1(temHomologo, homologo?.seccoes.somaAtividades)}
                destaque
                testId="dfc-soma-atividades"
              />
            </TableBody>
          </Table>
          {!temHomologo && (
            <p className="mt-3 text-xs text-muted-foreground" data-testid="dfc-sem-homologo">
              Sem exercício anterior: a coluna N-1 mostra «—». Não se calcula um comparativo parcial.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card data-testid="dfc-reconciliacao-dre">
          <CardHeader>
            <CardTitle className="text-base">Reconciliação com a DRE</CardTitle>
            <CardDescription>
              O resultado líquido que abre as actividades operacionais é o da Demonstração de Resultados do
              mesmo intervalo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-sm">Resultado líquido do período</span>
              <span
                className={cn(
                  'text-lg font-semibold tabular-nums',
                  seccoes.resultadoLiquido.isNegative() && 'text-destructive',
                )}
                data-testid="dfc-resultado-liquido"
              >
                {mzn(seccoes.resultadoLiquido)}
              </span>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/contabilidade/dre?${qs(datas)}`} prefetch={false} data-testid="dfc-ligacao-dre">
                Abrir a DRE de {formatarData(atual.periodoInicio.dataInicio)} a {formatarData(atual.periodoFim.dataFim)}
                <ArrowRight className="h-4 w-4 ml-1" aria-hidden="true" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card data-testid="dfc-articulacao">
          <CardHeader>
            <CardTitle className="text-base">Articulação</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table className={TABELA}>
              <TableBody>
                <TableRow data-testid="dfc-caixa-inicial">
                  <TableCell>Caixa e equivalentes no início do período</TableCell>
                  <TableCell className="text-right tabular-nums">{mzn(atual.caixaInicial)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>(+) Fluxo das actividades</TableCell>
                  <TableCell className={cn('text-right tabular-nums', seccoes.somaAtividades.isNegative() && 'text-destructive')}>
                    {mzn(seccoes.somaAtividades)}
                  </TableCell>
                </TableRow>
                <TableRow className="font-semibold" data-testid="dfc-caixa-final">
                  <TableCell>Caixa e equivalentes no fim do período</TableCell>
                  <TableCell className="text-right tabular-nums">{mzn(atual.caixaFinal)}</TableCell>
                </TableRow>
                <TableRow data-testid="dfc-articulacao-diferenca" className="border-t-2 font-semibold">
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
    </div>
  );
}
