/**
 * Oráculo da issue #144 (lado da UI) — os textos que o ecrã mostra para as recusas do fecho
 * de período e do apuramento de IVA apontam o passo que resolve. Os CÓDIGOS não mudam.
 *
 * Contrato (decisão do orquestrador, D:mensagens-recusa-144):
 *  - Os textos deixam de ser constantes privadas dos componentes `'use client'` e passam a
 *    viver num módulo neutro, `src/lib/textos-recusa-contabilidade.ts` (CLAUDE.md: constantes
 *    partilhadas vivem em `src/lib/*`), que exporta:
 *      TEXTO_IMPEDIMENTO_FECHO:  Record<código, string>                         (fecho de período)
 *      TEXTOS_RECUSA_APURAMENTO: Record<código, { titulo; descricao; isProrataWarning? }> (apuramento)
 *    e os dois componentes importam-nos daí (provado pela fonte, mais abaixo).
 *  - DOCUMENTO_SEM_LANCAMENTO (fecho e apuramento): um lançamento manual não fica ligado ao
 *    documento e não levanta a recusa. O texto não o sugere («Registe os lançamentos em
 *    falta», «Contabilidade → Lançamentos»), di-lo, e aponta o suporte (não há acção do
 *    utilizador no produto que crie a ligação — opção conservadora, sem endpoint novo).
 *  - PRORATA_NAO_SUPORTADO (apuramento): regularizações nas 44341/44342/44343 não levantam a
 *    recusa e repetir não resolve. O texto não sugere nenhuma das duas; recorre ao contabilista.
 *  - Os restantes códigos que os ecrãs já tratam continuam com texto (sem regressão).
 *
 * Escrito pelo verificador; um agente de implementação que o altere é BLOCKER.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

type InfoRecusa = { titulo: string; descricao: string; isProrataWarning?: boolean };
type Modulo = {
  TEXTO_IMPEDIMENTO_FECHO?: Record<string, string>;
  TEXTOS_RECUSA_APURAMENTO?: Record<string, InfoRecusa>;
};

// Import dinâmico por variável: enquanto o módulo não existir, falha cada caso — não o ficheiro.
const CAMINHO_MODULO = '@/lib/textos-recusa-contabilidade';
async function modulo(): Promise<Modulo> {
  return (await import(/* @vite-ignore */ CAMINHO_MODULO)) as Modulo;
}
async function fecho(codigo: string): Promise<string> {
  const m = await modulo();
  const t = m.TEXTO_IMPEDIMENTO_FECHO?.[codigo];
  expect(t, `TEXTO_IMPEDIMENTO_FECHO.${codigo}`).toBeTypeOf('string');
  return t as string;
}
async function apuramento(codigo: string): Promise<InfoRecusa> {
  const m = await modulo();
  const t = m.TEXTOS_RECUSA_APURAMENTO?.[codigo];
  expect(t, `TEXTOS_RECUSA_APURAMENTO.${codigo}`).toBeTruthy();
  return t as InfoRecusa;
}

const SUGERE_LANCAR_EM_FALTA = /\b(registe|gere|lance|crie|registar|gerar|lançar|criar)\b[^.]*lançamentos?\s+em\s+falta/i;
const APONTA_ECRA_LANCAMENTOS = /Contabilidade\s*[→›>]\s*Lançamentos/i;
const DIZ_QUE_MANUAL_NAO_RESOLVE = /lançamentos?\s+manua(l|is)[^.]*\bnão\b|\bnão\b[^.]*lançamentos?\s+manua(l|is)/i;
const SUGERE_REGULARIZAR = /\b(lance|lançar|registe|registar|faça|fazer|efectue|efetue)\b[^.]*regulariza/i;
const SUGERE_REPETIR = /tente\s+novamente|tentar\s+novamente|antes\s+de\s+tentar/i;

describe('#144 — fecho de período: DOCUMENTO_SEM_LANCAMENTO', () => {
  it('não manda registar os lançamentos em falta nem aponta o ecrã de Lançamentos', async () => {
    const t = await fecho('DOCUMENTO_SEM_LANCAMENTO');
    expect(t).not.toMatch(SUGERE_LANCAR_EM_FALTA);
    expect(t).not.toMatch(APONTA_ECRA_LANCAMENTOS);
  });

  it('diz que um lançamento manual não resolve e aponta o suporte', async () => {
    const t = await fecho('DOCUMENTO_SEM_LANCAMENTO');
    expect(t).toMatch(DIZ_QUE_MANUAL_NAO_RESOLVE);
    expect(t).toMatch(/suporte/i);
  });

  it('os sete impedimentos do fecho continuam com texto', async () => {
    for (const c of [
      'RASCUNHOS_NO_PERIODO',
      'SESSAO_CAIXA_ABERTA',
      'RECONCILIACAO_EM_ANDAMENTO',
      'DOCUMENTO_SEM_LANCAMENTO',
      'BALANCETE_DESEQUILIBRADO',
      'PERIODO_ANTERIOR_ABERTO',
      'IVA_NAO_APURADO',
    ]) {
      expect((await fecho(c)).length, c).toBeGreaterThan(20);
    }
  });
});

describe('#144 — apuramento de IVA: DOCUMENTO_SEM_LANCAMENTO', () => {
  it('não manda registar os lançamentos em falta nem aponta o ecrã de Lançamentos', async () => {
    const { descricao } = await apuramento('DOCUMENTO_SEM_LANCAMENTO');
    expect(descricao).not.toMatch(SUGERE_LANCAR_EM_FALTA);
    expect(descricao).not.toMatch(APONTA_ECRA_LANCAMENTOS);
  });

  it('diz que um lançamento manual não resolve e aponta o suporte', async () => {
    const { descricao } = await apuramento('DOCUMENTO_SEM_LANCAMENTO');
    expect(descricao).toMatch(DIZ_QUE_MANUAL_NAO_RESOLVE);
    expect(descricao).toMatch(/suporte/i);
  });
});

describe('#144 — apuramento de IVA: PRORATA_NAO_SUPORTADO', () => {
  it('não sugere lançar regularizações nem repetir a tentativa', async () => {
    const { descricao } = await apuramento('PRORATA_NAO_SUPORTADO');
    expect(descricao).not.toMatch(SUGERE_REGULARIZAR);
    expect(descricao).not.toMatch(/4434[123]/);
    expect(descricao).not.toMatch(SUGERE_REPETIR);
  });

  it('explica o pro rata e as operações isentas, recorre ao contabilista, e continua a ser aviso', async () => {
    const info = await apuramento('PRORATA_NAO_SUPORTADO');
    expect(info.descricao).toMatch(/pro\s?rata/i);
    expect(info.descricao).toMatch(/isent/i);
    expect(info.descricao).toMatch(/contabilista/i);
    expect(info.isProrataWarning).toBe(true);
  });

  it('os códigos que o ecrã de apuramento já tratava continuam com título e texto', async () => {
    for (const c of [
      'PRORATA_NAO_SUPORTADO',
      'PERIODO_COM_RASCUNHOS',
      'DOCUMENTO_SEM_LANCAMENTO',
      'PERIODO_JA_APURADO',
      'APURAMENTO_PERIODO_ENCERRAMENTO',
    ]) {
      const info = await apuramento(c);
      expect(info.titulo.length, `${c}.titulo`).toBeGreaterThan(5);
      expect(info.descricao.length, `${c}.descricao`).toBeGreaterThan(20);
    }
  });
});

describe('#144 — os ecrãs usam os textos do módulo (não uma cópia local)', () => {
  const RAIZ = path.resolve(__dirname, '../../..');
  const fonte = (rel: string) => readFileSync(path.join(RAIZ, rel), 'utf8');
  const IMPORT = /from\s+['"]@\/lib\/textos-recusa-contabilidade['"]/;

  it('periodo-acoes.tsx importa TEXTO_IMPEDIMENTO_FECHO e não define o mapa localmente', () => {
    const src = fonte('src/app/(dashboard)/contabilidade/exercicios/_components/periodo-acoes.tsx');
    expect(src).toMatch(IMPORT);
    expect(src).toMatch(/TEXTO_IMPEDIMENTO_FECHO/);
    expect(src).not.toMatch(/const\s+TEXTO_IMPEDIMENTO\s*[:=]/);
    expect(src).not.toMatch(SUGERE_LANCAR_EM_FALTA);
  });

  it('apurar-iva-form.tsx importa TEXTOS_RECUSA_APURAMENTO e não define o mapa localmente', () => {
    const src = fonte('src/app/(dashboard)/contabilidade/iva/[periodoId]/apurar/_components/apurar-iva-form.tsx');
    expect(src).toMatch(IMPORT);
    expect(src).toMatch(/TEXTOS_RECUSA_APURAMENTO/);
    expect(src).not.toMatch(/const\s+TEXTOS_RECUSA\s*[:=]/);
    expect(src).not.toMatch(SUGERE_LANCAR_EM_FALTA);
    expect(src).not.toMatch(/lance as regularizações manuais/i);
  });
});
