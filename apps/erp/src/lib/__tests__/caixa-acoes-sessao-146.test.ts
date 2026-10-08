/**
 * Oráculo da issue #146 — sem UI para sangria, reforço e cancelamento da sessão de caixa
 * (nó C:caixa-sangria-reforco-146; escrito pelo VERIFICADOR — alterá-lo do lado de quem
 * implementa é BLOCKER).
 *
 * Contrato: o detalhe da sessão (`/caixa/[id]`) oferece três acções, cada uma numa rota dedicada
 * (`/caixa/[id]/sangria`, `/caixa/[id]/reforco`, `/caixa/[id]/cancelar`). A decisão de QUAIS
 * acções aparecem é uma função pura e client-safe, ÚNICA, em `src/lib/caixa-acoes.ts`:
 *
 *   acoesSessaoCaixa({ status, movimentos: { tipo }[], permissoes: string[] })
 *     → { sangria: boolean; reforco: boolean; cancelar: boolean }
 *
 * Regras (espelham o servidor; o servidor continua a ser quem decide):
 * - Só uma sessão ABERTA tem acções (`assertSessaoAberta` / `TRANSICOES_SESSAO_CAIXA`).
 * - Cada acção exige a permissão da Server Action que a executa — `caixa:sangria`,
 *   `caixa:reforco`, `caixa:cancelar` (caixa.actions.ts). `caixa:operar` NÃO chega: mostrar um
 *   botão que a action recusa com «Sem permissão» é o defeito que se quer evitar (decisão
 *   conservadora: as permissões já existentes das actions, nenhuma nova).
 * - Cancelar só com a ABERTURA como único movimento: `cancelarSessao` recusa com
 *   CAIXA_COM_PENDENCIAS quando há qualquer outro (o caminho é o fecho).
 *
 * Acesso dinâmico (`as any`) para que, sem o módulo, falhe cada caso e não o ficheiro.
 */
import { describe, it, expect } from 'vitest';

type Acoes = { sangria: boolean; reforco: boolean; cancelar: boolean };
type Entrada = {
  status: string;
  movimentos: ReadonlyArray<{ tipo: string }>;
  permissoes: ReadonlyArray<string>;
};

const TODAS = ['caixa:leitura', 'caixa:sangria', 'caixa:reforco', 'caixa:cancelar'];
const SO_ABERTURA = [{ tipo: 'ABERTURA' }];

async function acoes(entrada: Entrada): Promise<Acoes> {
  const caminho = '../caixa-acoes';
  const mod = (await import(/* @vite-ignore */ caminho).catch(() => ({}))) as any;
  expect(typeof mod.acoesSessaoCaixa, 'src/lib/caixa-acoes.ts exporta acoesSessaoCaixa').toBe('function');
  return mod.acoesSessaoCaixa(entrada) as Acoes;
}

describe('acoesSessaoCaixa (#146) — que acções o detalhe da sessão oferece', () => {
  it('sessão ABERTA só com a abertura e todas as permissões: as três acções', async () => {
    expect(await acoes({ status: 'ABERTA', movimentos: SO_ABERTURA, permissoes: TODAS })).toEqual({
      sangria: true,
      reforco: true,
      cancelar: true,
    });
  });

  it('sessão ABERTA sem movimentos nenhuns (nem a abertura): pode cancelar', async () => {
    expect((await acoes({ status: 'ABERTA', movimentos: [], permissoes: TODAS })).cancelar).toBe(true);
  });

  it.each(['VENDA', 'SANGRIA', 'REFORCO', 'RECEBIMENTO', 'DEVOLUCAO', 'PAGAMENTO', 'AJUSTE'])(
    'com um movimento %s além da abertura, cancelar desaparece (o servidor recusa — CAIXA_COM_PENDENCIAS); sangria e reforço ficam',
    async (tipo) => {
      expect(
        await acoes({ status: 'ABERTA', movimentos: [...SO_ABERTURA, { tipo }], permissoes: TODAS }),
      ).toEqual({ sangria: true, reforco: true, cancelar: false });
    },
  );

  it.each(['FECHADA', 'CANCELADA'])('sessão %s: nenhuma acção, mesmo com todas as permissões', async (status) => {
    expect(await acoes({ status, movimentos: SO_ABERTURA, permissoes: TODAS })).toEqual({
      sangria: false,
      reforco: false,
      cancelar: false,
    });
  });

  it('cada acção depende só da sua permissão', async () => {
    const sem = (p: string) => TODAS.filter((c) => c !== p);
    expect(await acoes({ status: 'ABERTA', movimentos: SO_ABERTURA, permissoes: sem('caixa:sangria') })).toEqual({
      sangria: false,
      reforco: true,
      cancelar: true,
    });
    expect(await acoes({ status: 'ABERTA', movimentos: SO_ABERTURA, permissoes: sem('caixa:reforco') })).toEqual({
      sangria: true,
      reforco: false,
      cancelar: true,
    });
    expect(await acoes({ status: 'ABERTA', movimentos: SO_ABERTURA, permissoes: sem('caixa:cancelar') })).toEqual({
      sangria: true,
      reforco: true,
      cancelar: false,
    });
  });

  it('permissões do OPERADOR (caixa:operar, sangria, reforço, sem cancelar): sangria e reforço, sem cancelar', async () => {
    const operador = ['caixa:ver', 'caixa:operar', 'caixa:abertura', 'caixa:fecho', 'caixa:leitura', 'caixa:reforco', 'caixa:sangria'];
    expect(await acoes({ status: 'ABERTA', movimentos: SO_ABERTURA, permissoes: operador })).toEqual({
      sangria: true,
      reforco: true,
      cancelar: false,
    });
  });

  it('caixa:operar sozinho não abre nenhuma acção (as actions exigem caixa:sangria/reforco/cancelar)', async () => {
    expect(
      await acoes({ status: 'ABERTA', movimentos: SO_ABERTURA, permissoes: ['caixa:operar', 'caixa:leitura'] }),
    ).toEqual({ sangria: false, reforco: false, cancelar: false });
  });

  it('sem permissões (LEITURA): nenhuma acção', async () => {
    expect(await acoes({ status: 'ABERTA', movimentos: SO_ABERTURA, permissoes: [] })).toEqual({
      sangria: false,
      reforco: false,
      cancelar: false,
    });
  });
});
