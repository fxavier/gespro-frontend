/**
 * Impedimentos da DFC — Server Component (nó `fatia`, versão simples).
 *
 * Conta com movimento e sem mapeamento é impedimento, não zero (ADR-0037 §4,
 * I7): o mapa NÃO sai e a página mostra TODAS as contas de uma vez, como o
 * `fecharPeriodo`. Aqui vão as frases do serviço e a tabela das contas com
 * movimento e saldo final, a dizer de que coluna são os valores
 * (`comparativo`, MINOR-1). O painel completo, com «Mapear» por linha para
 * quem tem `financas:fluxo-caixa:configurar`, é do nó `pagina`.
 */
import { TriangleAlert, Info } from 'lucide-react';
import type { ImpedimentosDFC as Impedimentos } from '@/server/services/financas/dfc.interface';
import { formatMZN } from '@/lib/format-currency';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function ImpedimentosDFC({ resultado }: { resultado: Impedimentos }) {
  const { impedimentos, contasNaoMapeadas, avisos } = resultado;
  return (
    <div className="space-y-4" data-testid="dfc-impedimentos">
      <Alert variant="destructive">
        <TriangleAlert className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>
          A DFC não pode ser gerada: {impedimentos.length}{' '}
          {impedimentos.length === 1 ? 'impedimento' : 'impedimentos'}
        </AlertTitle>
        <AlertDescription>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {impedimentos.map((frase) => (
              <li key={frase}>{frase}</li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>

      {contasNaoMapeadas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contas com movimento sem mapeamento</CardTitle>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {contasNaoMapeadas.map((c) => (
                  <TableRow key={c.conta.id}>
                    <TableCell className="tabular-nums">{c.conta.codigo}</TableCell>
                    <TableCell>{c.conta.nome}</TableCell>
                    <TableCell>{c.comparativo ? 'Comparativo N-1' : 'Intervalo pedido'}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMZN(c.movimento.toFixed(2))}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMZN(c.saldoFinal.toFixed(2))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
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
    </div>
  );
}
