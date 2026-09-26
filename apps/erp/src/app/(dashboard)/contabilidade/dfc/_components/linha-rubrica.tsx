'use client';

/**
 * Uma rubrica da DFC que expande para as suas contas — CLIENT COMPONENT (só o
 * estado aberto/fechado). Nó `pagina`, ticket 8.3.
 *
 * Recebe tudo já pronto do Server Component `MapaDFC`: textos formatados por
 * `formatMZN` e ligações montadas no servidor. Nada de `Decimal` nem de funções
 * atravessa a fronteira RSC, e o cliente não calcula nada — o valor de cada
 * conta é o `efeitoCaixa` que o `gerarDFC` devolveu, e a soma das contas é o
 * valor da rubrica por construção do serviço.
 *
 * Linhas `<tr>` irmãs dentro do `<tbody>` do mapa (HTML válido): o botão tem
 * `aria-expanded` e, aberto, `aria-controls` com os ids (únicos) das linhas
 * das contas — só quando elas existem no DOM.
 */

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export interface ValorCelula {
  texto: string;
  negativo: boolean;
}

export interface ContaDaRubrica {
  id: string;
  codigo: string;
  nome: string;
  /** Variação do saldo no intervalo N, pela natureza da conta (texto), ou `null` se a conta só se moveu em N-1. */
  variacao: string | null;
  n: ValorCelula;
  n1: ValorCelula;
  /** `/contabilidade/razao-geral?contaId=…&dataInicio=…&dataFim=…` do intervalo N. */
  hrefRazao: string;
}

export interface LinhaRubricaProps {
  id: string;
  codigo: string;
  designacao: string;
  n: ValorCelula;
  n1: ValorCelula;
  contas: ContaDaRubrica[];
}

function Valor({ v, className }: { v: ValorCelula; className?: string }) {
  return (
    <TableCell className={cn('text-right tabular-nums', v.negativo && 'text-destructive', className)}>{v.texto}</TableCell>
  );
}

export function LinhaRubrica({ id, codigo, designacao, n, n1, contas }: LinhaRubricaProps) {
  const [aberta, setAberta] = useState(false);
  const idConta = (contaId: string) => `dfc-${id}-conta-${contaId}`;
  return (
    <>
      <TableRow data-testid={`dfc-rubrica-${codigo}`}>
        <TableCell className="pl-4">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={aberta}
            aria-controls={aberta && contas.length > 0 ? contas.map((c) => idConta(c.id)).join(' ') : undefined}
            onClick={() => setAberta((a) => !a)}
            data-testid={`dfc-rubrica-${codigo}-expandir`}
          >
            <ChevronRight
              className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', aberta && 'rotate-90')}
              aria-hidden="true"
            />
            <span>
              {codigo} · {designacao}
            </span>
            <span className="sr-only">
              {aberta ? ' — esconder' : ' — mostrar'} {contas.length} {contas.length === 1 ? 'conta' : 'contas'}
            </span>
          </button>
        </TableCell>
        <Valor v={n} />
        <Valor v={n1} />
      </TableRow>
      {aberta &&
        contas.map((c) => (
          <TableRow key={c.id} id={idConta(c.id)} data-testid={`dfc-conta-${c.codigo}`}>
            <TableCell className="pl-14 text-sm">
              <Link
                href={c.hrefRazao}
                prefetch={false}
                className="text-primary underline-offset-4 hover:underline"
                data-testid={`dfc-conta-${c.codigo}-razao`}
              >
                {c.codigo} · {c.nome}
              </Link>
              {c.variacao !== null && (
                <span className="block text-xs text-muted-foreground">Variação do saldo: {c.variacao}</span>
              )}
            </TableCell>
            <Valor v={c.n} className="text-sm" />
            <Valor v={c.n1} className="text-sm" />
          </TableRow>
        ))}
    </>
  );
}
