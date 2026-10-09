/**
 * Oráculo das issues #154 e #259 — menus ⋯ das listas de cotações e proformas mostram
 * «Converter»/«Rejeitar» em qualquer estado (nó C:menu-cotacoes-proformas-154-259; escrito pelo
 * VERIFICADOR — alterá-lo do lado de quem implementa é BLOCKER).
 *
 * Contrato:
 * 1. As máquinas de estado `TRANSICOES_COTACAO_COMERCIAL` e `TRANSICOES_PROFORMA` passam a ter um
 *    espelho client-safe em `src/lib/state-machines.ts`, IGUAL ao de
 *    `server/services/financas/faturacao.interface.ts` (o serviço continua a ser quem decide).
 * 2. A decisão de que acções o menu de cada linha oferece é uma função pura e client-safe, ÚNICA,
 *    em `src/lib/faturacao-acoes.ts`, apoiada nesse espelho:
 *
 *      acoesMenuCotacao({ status, permissoes }) → { converter, rejeitar, cancelar }
 *      acoesMenuProforma({ status, permissoes }) → { converter, cancelar }
 *
 *    Cada acção = transição permitida a partir do estado E a permissão da Server Action que a
 *    executa (faturacao.actions.ts):
 *      cotação  converter → 'CONVERTIDA' ∧ faturacao:cotacao:converter (converterCotacaoEmProforma)
 *      cotação  rejeitar  → 'REJEITADA'  ∧ faturacao:cotacao:gerir     (rejeitarCotacaoComercial)
 *      cotação  cancelar  → 'CANCELADA'  ∧ faturacao:cotacao:gerir     (cancelarCotacaoComercial)
 *      proforma converter → 'CONVERTIDA' ∧ faturacao:proforma:converter (converterProformaEmFatura)
 *      proforma cancelar  → 'CANCELADA'  ∧ faturacao:proforma:cancelar  (cancelarProforma)
 *    Decisão conservadora: as permissões já existentes das actions, nenhuma nova; estado
 *    desconhecido ⇒ nenhuma acção (recusar > mostrar um botão que a página de destino recusa).
 *
 * Acesso dinâmico (`as any`) para que, sem o módulo, falhe cada caso e não o ficheiro.
 */
import { describe, it, expect } from 'vitest';
import {
  TRANSICOES_COTACAO_COMERCIAL as SERVIDOR_COTACAO,
  TRANSICOES_PROFORMA as SERVIDOR_PROFORMA,
} from '@/server/services/financas/faturacao.interface';

type AcoesCotacao = { converter: boolean; rejeitar: boolean; cancelar: boolean };
type AcoesProforma = { converter: boolean; cancelar: boolean };
type Entrada = { status: string; permissoes: ReadonlyArray<string> };

const PERM_COTACAO = ['faturacao:leitura', 'faturacao:cotacao:gerir', 'faturacao:cotacao:converter'];
const PERM_PROFORMA = ['faturacao:leitura', 'faturacao:proforma:converter', 'faturacao:proforma:cancelar'];

const ESTADOS_COTACAO = ['RASCUNHO', 'ENVIADA', 'ACEITE', 'REJEITADA', 'CONVERTIDA', 'EXPIRADA', 'CANCELADA'];
const ESTADOS_PROFORMA = ['RASCUNHO', 'ENVIADA', 'ACEITE', 'CONVERTIDA', 'EXPIRADA', 'CANCELADA'];

async function modulo(caminho: string): Promise<any> {
  return (await import(/* @vite-ignore */ caminho).catch(() => ({}))) as any;
}

async function acoesCotacao(entrada: Entrada): Promise<AcoesCotacao> {
  const mod = await modulo('../faturacao-acoes');
  expect(typeof mod.acoesMenuCotacao, 'src/lib/faturacao-acoes.ts exporta acoesMenuCotacao').toBe('function');
  return mod.acoesMenuCotacao(entrada) as AcoesCotacao;
}

async function acoesProforma(entrada: Entrada): Promise<AcoesProforma> {
  const mod = await modulo('../faturacao-acoes');
  expect(typeof mod.acoesMenuProforma, 'src/lib/faturacao-acoes.ts exporta acoesMenuProforma').toBe('function');
  return mod.acoesMenuProforma(entrada) as AcoesProforma;
}

describe('#154/#259 — máquinas de estado client-safe em src/lib/state-machines.ts', () => {
  it('TRANSICOES_COTACAO_COMERCIAL existe e é igual à do serviço', async () => {
    const mod = await modulo('../state-machines');
    expect(mod.TRANSICOES_COTACAO_COMERCIAL, 'state-machines exporta TRANSICOES_COTACAO_COMERCIAL').toBeDefined();
    expect(mod.TRANSICOES_COTACAO_COMERCIAL).toEqual(SERVIDOR_COTACAO);
  });

  it('TRANSICOES_PROFORMA existe e é igual à do serviço', async () => {
    const mod = await modulo('../state-machines');
    expect(mod.TRANSICOES_PROFORMA, 'state-machines exporta TRANSICOES_PROFORMA').toBeDefined();
    expect(mod.TRANSICOES_PROFORMA).toEqual(SERVIDOR_PROFORMA);
  });
});

describe('acoesMenuCotacao (#154/#259) — menu ⋯ da lista de cotações', () => {
  const ESPERADO: Record<string, AcoesCotacao> = {
    RASCUNHO: { converter: false, rejeitar: false, cancelar: true },
    ENVIADA: { converter: false, rejeitar: true, cancelar: false },
    ACEITE: { converter: true, rejeitar: false, cancelar: false },
    REJEITADA: { converter: false, rejeitar: false, cancelar: false },
    CONVERTIDA: { converter: false, rejeitar: false, cancelar: false },
    EXPIRADA: { converter: false, rejeitar: false, cancelar: false },
    CANCELADA: { converter: false, rejeitar: false, cancelar: false },
  };

  it.each(ESTADOS_COTACAO)('estado %s com todas as permissões: só as acções que a transição permite', async (status) => {
    expect(await acoesCotacao({ status, permissoes: PERM_COTACAO })).toEqual(ESPERADO[status]);
  });

  it('a tabela esperada coincide com a máquina do serviço (o oráculo não inventa regras)', () => {
    for (const s of ESTADOS_COTACAO) {
      const t = SERVIDOR_COTACAO[s as keyof typeof SERVIDOR_COTACAO] as string[];
      expect(ESPERADO[s]).toEqual({
        converter: t.includes('CONVERTIDA'),
        rejeitar: t.includes('REJEITADA'),
        cancelar: t.includes('CANCELADA'),
      });
    }
  });

  it('ACEITE sem faturacao:cotacao:converter: Converter não aparece', async () => {
    const r = await acoesCotacao({ status: 'ACEITE', permissoes: ['faturacao:leitura', 'faturacao:cotacao:gerir'] });
    expect(r.converter).toBe(false);
  });

  it('ENVIADA sem faturacao:cotacao:gerir: Rejeitar não aparece (converter não chega)', async () => {
    const r = await acoesCotacao({ status: 'ENVIADA', permissoes: ['faturacao:leitura', 'faturacao:cotacao:converter'] });
    expect(r.rejeitar).toBe(false);
  });

  it('RASCUNHO sem faturacao:cotacao:gerir: Cancelar não aparece', async () => {
    const r = await acoesCotacao({ status: 'RASCUNHO', permissoes: ['faturacao:leitura', 'faturacao:cotacao:converter'] });
    expect(r.cancelar).toBe(false);
  });

  it.each(ESTADOS_COTACAO)('estado %s só com faturacao:leitura: nenhuma acção', async (status) => {
    expect(await acoesCotacao({ status, permissoes: ['faturacao:leitura'] })).toEqual({
      converter: false,
      rejeitar: false,
      cancelar: false,
    });
  });

  it('estado desconhecido: nenhuma acção, sem rebentar', async () => {
    expect(await acoesCotacao({ status: 'INEXISTENTE', permissoes: PERM_COTACAO })).toEqual({
      converter: false,
      rejeitar: false,
      cancelar: false,
    });
  });
});

describe('acoesMenuProforma (#259) — menu ⋯ da lista de proformas', () => {
  const ESPERADO: Record<string, AcoesProforma> = {
    RASCUNHO: { converter: false, cancelar: true },
    ENVIADA: { converter: false, cancelar: true },
    ACEITE: { converter: true, cancelar: true },
    CONVERTIDA: { converter: false, cancelar: false },
    EXPIRADA: { converter: false, cancelar: false },
    CANCELADA: { converter: false, cancelar: false },
  };

  it.each(ESTADOS_PROFORMA)('estado %s com todas as permissões: só as acções que a transição permite', async (status) => {
    expect(await acoesProforma({ status, permissoes: PERM_PROFORMA })).toEqual(ESPERADO[status]);
  });

  it('a tabela esperada coincide com a máquina do serviço (o oráculo não inventa regras)', () => {
    for (const s of ESTADOS_PROFORMA) {
      const t = SERVIDOR_PROFORMA[s as keyof typeof SERVIDOR_PROFORMA] as string[];
      expect(ESPERADO[s]).toEqual({ converter: t.includes('CONVERTIDA'), cancelar: t.includes('CANCELADA') });
    }
  });

  it('ACEITE sem faturacao:proforma:converter: Converter não aparece (gerir não chega)', async () => {
    const r = await acoesProforma({
      status: 'ACEITE',
      permissoes: ['faturacao:leitura', 'faturacao:proforma:gerir', 'faturacao:proforma:cancelar'],
    });
    expect(r).toEqual({ converter: false, cancelar: true });
  });

  it('ENVIADA sem faturacao:proforma:cancelar: Cancelar não aparece (gerir não chega)', async () => {
    const r = await acoesProforma({
      status: 'ENVIADA',
      permissoes: ['faturacao:leitura', 'faturacao:proforma:gerir', 'faturacao:proforma:converter'],
    });
    expect(r.cancelar).toBe(false);
  });

  it.each(ESTADOS_PROFORMA)('estado %s só com faturacao:leitura: nenhuma acção', async (status) => {
    expect(await acoesProforma({ status, permissoes: ['faturacao:leitura'] })).toEqual({
      converter: false,
      cancelar: false,
    });
  });

  it('estado desconhecido: nenhuma acção, sem rebentar', async () => {
    expect(await acoesProforma({ status: 'INEXISTENTE', permissoes: PERM_PROFORMA })).toEqual({
      converter: false,
      cancelar: false,
    });
  });
});
