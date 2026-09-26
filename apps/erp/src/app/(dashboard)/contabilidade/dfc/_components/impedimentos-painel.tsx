/**
 * Painel de impedimentos da DFC — Server Component (nó `pagina`, ticket 8.5).
 *
 * Conta com movimento e sem mapeamento é impedimento, não zero (ADR-0037 §4,
 * I7): o mapa NÃO sai e a página mostra TODAS as contas de uma vez, como o
 * `fecharPeriodo`. Aqui vão:
 *  - os avisos de coerência da configuração de caixa, ACIMA da tabela (E2);
 *  - as frases do serviço (`impedimentos`), todas;
 *  - a tabela das contas com movimento e saldo final, a dizer de que coluna são
 *    os valores (`comparativo`, MINOR-1).
 *
 * Quem tem `financas:fluxo-caixa:configurar` vê «Mapear» em cada linha, que
 * abre `/contabilidade/fluxo-caixa/rubricas/mapear?contaId=…&voltar=…` com o
 * `voltar` a apontar para esta DFC, com o mesmo intervalo (a rota de mapear
 * passa-o por `voltarSeguro`). Os outros vêem a quem pedir.
 */
import Link from 'next/link';
import { TriangleAlert, Info, ArrowRight } from 'lucide-react';
import type { ImpedimentosDFC } from '@/server/services/financas/dfc.interface';
import { formatMZN } from '@/lib/format-currency';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function hrefMapearConta(contaId: string, voltar: string): string {
  return `/contabilidade/fluxo-caixa/rubricas/mapear?contaId=${encodeURIComponent(contaId)}&voltar=${encodeURIComponent(voltar)}`;
}

export function ImpedimentosPainel({
  resultado,
  podeConfigurar,
  voltar,
}: {
  resultado: ImpedimentosDFC;
  podeConfigurar: boolean;
  /** Caminho desta DFC com o mesmo intervalo, ex.: `/contabilidade/dfc?dataInicio=…&dataFim=…`. */
  voltar: string;
}) {
  const { impedimentos, contasNaoMapeadas, avisos } = resultado;
  return (
    <div className="space-y-4" data-testid="dfc-impedimentos">
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

      <Alert variant="destructive">
        <TriangleAlert className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>
          A DFC não pode ser gerada: {impedimentos.length}{' '}
          {impedimentos.length === 1 ? 'impedimento' : 'impedimentos'}
        </AlertTitle>
        <AlertDescription>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {impedimentos.map((frase, i) => (
              <li key={`${i}-${frase}`}>{frase}</li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>

      {contasNaoMapeadas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contas com movimento sem mapeamento</CardTitle>
            <CardDescription data-testid="dfc-impedimentos-quem">
              {podeConfigurar
                ? 'Atribua cada conta a uma rubrica em «Mapear». Depois de gravar, volta a esta demonstração com o mesmo intervalo.'
                : 'Não tem permissão para configurar o mapeamento. Peça a quem configura o fluxo de caixa (por omissão, o Administrador ou o perfil Financeiro) que atribua estas contas a uma rubrica.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Conta</TableHead>
                  <TableHead>Designação</TableHead>
                  <TableHead>Movimento em</TableHead>
                  <TableHead className="text-right">Movimento</TableHead>
                  <TableHead className="text-right">Saldo final</TableHead>
                  {podeConfigurar && (
                    <TableHead>
                      <span className="sr-only">Acções</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {contasNaoMapeadas.map((c) => (
                  <TableRow key={c.conta.id} data-testid={`dfc-nao-mapeada-${c.conta.codigo}`}>
                    <TableCell className="tabular-nums">{c.conta.codigo}</TableCell>
                    <TableCell>{c.conta.nome}</TableCell>
                    <TableCell>{c.comparativo ? 'Comparativo N-1' : 'Intervalo pedido'}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMZN(c.movimento.toFixed(2))}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMZN(c.saldoFinal.toFixed(2))}</TableCell>
                    {podeConfigurar && (
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={hrefMapearConta(c.conta.id, voltar)}
                            prefetch={false}
                            data-testid={`dfc-mapear-${c.conta.codigo}`}
                          >
                            Mapear
                            <span className="sr-only"> a conta {c.conta.codigo}</span>
                            <ArrowRight className="h-4 w-4 ml-1" aria-hidden="true" />
                          </Link>
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
