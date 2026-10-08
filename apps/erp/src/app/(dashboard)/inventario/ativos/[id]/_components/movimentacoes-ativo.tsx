/**
 * Separador «Movimentações» do detalhe de ativo (#118). Sem interactividade: renderiza no servidor.
 */

import { EmptyState } from '@/components/patterns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatarDataHora } from '@/lib/format-date';
import type { MovimentacaoAtivoDto } from '@/server/services/inventario/ativos.interface';

const TIPO_LABELS: Record<string, string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  TRANSFERENCIA: 'Transferência',
  EMPRESTIMO: 'Empréstimo',
  DEVOLUCAO: 'Devolução',
  BAIXA: 'Baixa',
  AJUSTE: 'Ajuste',
};

const traco = <span className="text-muted-foreground">—</span>;

function deParaTexto(origem: string | null | undefined, destino: string | null | undefined) {
  if (!origem && !destino) return traco;
  return (
    <span>
      {origem ?? '—'} <span className="text-muted-foreground">→</span> {destino ?? '—'}
    </span>
  );
}

export function MovimentacoesAtivo({ movimentacoes }: { movimentacoes: MovimentacaoAtivoDto[] }) {
  if (movimentacoes.length === 0) {
    return <EmptyState title="Sem movimentações" description="Este ativo ainda não foi movimentado." />;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Localização</TableHead>
            <TableHead>Responsável</TableHead>
            <TableHead>Motivo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movimentacoes.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="tabular-nums whitespace-nowrap">{formatarDataHora(m.dataMovimentacao)}</TableCell>
              <TableCell>{TIPO_LABELS[m.tipo] ?? m.tipo}</TableCell>
              <TableCell>
                {m.localizacaoDestinoId && m.localizacaoDestinoId !== m.localizacaoOrigemId
                  ? deParaTexto(m.localizacaoOrigemNome, m.localizacaoDestinoNome)
                  : traco}
              </TableCell>
              <TableCell>
                {m.responsavelDestinoId && m.responsavelDestinoId !== m.responsavelOrigemId
                  ? deParaTexto(m.responsavelOrigemNome, m.responsavelDestinoNome)
                  : traco}
              </TableCell>
              <TableCell className="max-w-xs truncate">{m.motivo}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
