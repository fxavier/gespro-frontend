/**
 * Oráculo (unit + estático) — issue #173: «Cancelar» aparece em RESOLVIDO; KPI «Em Progresso»
 * sempre 0. O lado do servidor (SLA derivado na leitura, `contarTickets`) prova-se contra
 * Postgres real em `test/integration/tickets-cancelar-sla-kpi-173.test.ts`.
 *
 * Contrato:
 *   1. Acções pela máquina de estados, client-safe — fixado aqui, molde `assinaturaCancelavel`:
 *        `ticketCancelavel(estado: string): boolean` exportada de `@/lib/state-machines`,
 *        verdadeira sse `TRANSICOES_TICKET[estado]` contém 'CANCELADO' (RESOLVIDO, FECHADO e
 *        CANCELADO → false). `ticket-acoes.tsx` decide o botão «Cancelar» com ela — sem lista
 *        de estados à mão — e continua sem value-import de módulos `server-only`.
 *      O mapa client-safe e o do serviço (`ticket.interface.ts`) não podem divergir.
 *   2. KPI pelo estado real, por `count`: `/tickets` e `/tickets/lista` deixam de tirar KPIs de
 *      uma página (`.items.length`/`.items.filter`, `take: 1`/`take: 50`) e chamam
 *      `ticketService.contarTickets(`; o KPI «Em Progresso» (das duas páginas) conta
 *      `estado: 'EM_PROGRESSO'` — o da lista contava os não-terminais de uma página de 1.
 *
 * Escrito pelo verificador do nó B:tickets-cancelar-sla-kpi-173; um agente de implementação que o
 * altere é BLOCKER.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import * as maquinas from '@/lib/state-machines';
import { TRANSICOES_TICKET as TRANSICOES_SERVICO } from '@/server/services/operacoes/ticket.interface';

const TICKETS = path.resolve(__dirname, '..'); // apps/erp/src/app/(dashboard)/tickets

const ESTADOS = [
  'ABERTO',
  'EM_PROGRESSO',
  'AGUARDANDO_CLIENTE',
  'AGUARDANDO_TERCEIRO',
  'RESOLVIDO',
  'FECHADO',
  'CANCELADO',
] as const;

/** Código sem comentários — um comentário a citar o defeito antigo não conta como uso. */
function codigo(ficheiro: string): string {
  const src = fs.readFileSync(path.join(TICKETS, ficheiro), 'utf8');
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function ticketCancelavel(): (estado: string) => boolean {
  // Acesso dinâmico: a função ainda não existe — falha o caso, não o ficheiro.
  const f = (maquinas as Record<string, unknown>).ticketCancelavel;
  expect(typeof f, 'ticketCancelavel não está exportada de @/lib/state-machines').toBe('function');
  return f as (estado: string) => boolean;
}

describe('#173 — «Cancelar» pela máquina de estados (client-safe)', () => {
  it('o mapa client-safe e o do serviço são o mesmo', () => {
    for (const e of ESTADOS) {
      expect([...(maquinas.TRANSICOES_TICKET[e] ?? [])].sort(), e).toEqual([...TRANSICOES_SERVICO[e]].sort());
    }
    expect(Object.keys(maquinas.TRANSICOES_TICKET).sort()).toEqual([...ESTADOS].sort());
  });

  it('ticketCancelavel(estado) ⇔ TRANSICOES_TICKET[estado] contém CANCELADO, para todos os estados', () => {
    const f = ticketCancelavel();
    for (const e of ESTADOS) {
      expect(f(e), e).toBe(TRANSICOES_SERVICO[e].includes('CANCELADO'));
    }
  });

  it('RESOLVIDO, FECHADO e CANCELADO não se cancelam; ABERTO, EM_PROGRESSO e os AGUARDANDO_* sim', () => {
    const f = ticketCancelavel();
    expect(f('RESOLVIDO')).toBe(false);
    expect(f('FECHADO')).toBe(false);
    expect(f('CANCELADO')).toBe(false);
    for (const e of ['ABERTO', 'EM_PROGRESSO', 'AGUARDANDO_CLIENTE', 'AGUARDANDO_TERCEIRO']) {
      expect(f(e), e).toBe(true);
    }
    expect(f('DESCONHECIDO')).toBe(false);
  });

  it('ticket-acoes.tsx decide o botão com ticketCancelavel, sem lista de estados à mão', () => {
    const src = codigo('_components/ticket-acoes.tsx');
    expect(src.includes('ticketCancelavel('), 'ticket-acoes.tsx não usa ticketCancelavel(…)').toBe(true);
    expect(/from\s+['"]@\/lib\/state-machines['"]/.test(src), 'importa de @/lib/state-machines').toBe(true);
    expect(
      src.match(/estado\s*!==\s*['"](CANCELADO|FECHADO|RESOLVIDO)['"]/g) ?? [],
      'podeCancelar ainda é uma lista de estados à mão',
    ).toEqual([]);
  });

  it('ticket-acoes.tsx não faz value-import de módulos server-only', () => {
    const src = codigo('_components/ticket-acoes.tsx');
    const valueImports = src.match(/^import\s+(?!type\b)[^;]*from\s+['"]@\/server\/services\/[^'"]+['"]/gm) ?? [];
    expect(valueImports).toEqual([]);
  });
});

describe('#173 — KPIs de tickets por count, pelo estado real', () => {
  for (const ficheiro of ['page.tsx', 'lista/page.tsx']) {
    describe(ficheiro, () => {
      it('não calcula KPIs com items.length/items.filter', () => {
        const src = codigo(ficheiro);
        expect(src.match(/\.items\.(length|filter)\b/g) ?? [], `${ficheiro}: KPI tirado da página`).toEqual([]);
      });

      it('não pede páginas cortadas (take: 1 / take: 50) para KPIs', () => {
        const src = codigo(ficheiro);
        expect(src.match(/\btake:\s*(1|50)\b/g) ?? [], `${ficheiro}: KPI sobre página cortada`).toEqual([]);
      });

      it('usa ticketService.contarTickets(', () => {
        expect(codigo(ficheiro).includes('ticketService.contarTickets('), `${ficheiro} não chama contarTickets`).toBe(
          true,
        );
      });
    });
  }

  it.each(['page.tsx', 'lista/page.tsx'])(
    '%s: o KPI «Em Progresso» conta estado EM_PROGRESSO (não um filtro dentro de outra lista)',
    (ficheiro) => {
      const src = codigo(ficheiro);
      expect(
        /contarTickets\(\s*\{[^}]*estado:\s*['"]EM_PROGRESSO['"]/.test(src),
        `${ficheiro}: contarTickets({ estado: 'EM_PROGRESSO' })`,
      ).toBe(true);
    },
  );
});
