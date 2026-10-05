import { Prisma } from '@prisma/client';

/**
 * O lançamento de abertura (diário ABERTURA) de um exercício COM anterior re-afirma, à data
 * de início do exercício, saldos que já estão no razão — os lançamentos do anterior (ADR-0035
 * §6, #363). Um leitor que soma «tudo com data ≤ X» contá-los-ia duas vezes; as vistas por
 * PERÍODO (`gerarBalanceteVerificacao`, razão por períodos) usam-no em vez da abertura
 * implícita. O AB do PRIMEIRO exercício (sem anterior) não re-afirma nada — é a única origem
 * dos saldos iniciais de quem migra — e por isso conta. O estorno do AB fica no mesmo diário
 * e no mesmo exercício: sai com ele.
 */
export const SEM_ABERTURA_REAFIRMADA = {
  NOT: { diario: { tipo: 'ABERTURA' }, periodo: { exercicio: { anteriorId: { not: null } } } },
} satisfies Prisma.LancamentoWhereInput;

/**
 * Predicado dos MAPAS e da tesouraria por DATAS (balancete por datas e, por ele, a DFC; DRE;
 * projecção; reconciliação; importação): fora o fecho e a abertura. Os leitores de UMA conta
 * (razão por datas, detalhe da conta, `saldoContabilAte`) usam só `SEM_ABERTURA_REAFIRMADA`:
 * um razão mostra o fecho (ADR-0035, «Decisões de implementação»).
 *  - Período 13 (ADR-0035, «Decisões de implementação», #138): os lançamentos de
 *    encerramento têm a data do fim do exercício e, contados, punham o resultado do ano a
 *    zero.
 *  - Abertura re-afirmada: ver `SEM_ABERTURA_REAFIRMADA`.
 * Os mapas por PERÍODO não o usam. Para SQL cru: `sqlForaDeFechoEAbertura`.
 */
export const FORA_DE_FECHO_E_ABERTURA = {
  periodo: { ordem: { not: 13 } },
  ...SEM_ABERTURA_REAFIRMADA,
} satisfies Prisma.LancamentoWhereInput;

/**
 * `FORA_DE_FECHO_E_ABERTURA` em SQL, para leitores em `$queryRaw`. `alias` é o alias do
 * "Lancamento" na consulta — constante do chamador, nunca entrada do utilizador.
 */
export function sqlForaDeFechoEAbertura(alias: string): Prisma.Sql {
  const l = Prisma.raw(alias);
  return Prisma.sql`NOT EXISTS (
      SELECT 1 FROM "PeriodoContabil" pc
      JOIN "ExercicioContabil" ex ON ex.id = pc."exercicioId"
      JOIN "Diario" di ON di.id = ${l}."diarioId"
      WHERE pc.id = ${l}."periodoId"
        AND (pc.ordem = 13 OR (di.tipo::text = 'ABERTURA' AND ex."anteriorId" IS NOT NULL))
    )`;
}

/**
 * `FORA_DE_FECHO_E_ABERTURA` sobre um lançamento já lido — para quem pagina por keyset e não
 * pode tirar linhas ao `where` (importação). Campo ausente conta como «não é».
 */
export function eFechoOuAbertura(l: {
  ordem?: number | null;
  diarioTipo?: string | null;
  anteriorId?: string | null;
}): boolean {
  return l.ordem === 13 || (l.diarioTipo === 'ABERTURA' && l.anteriorId != null);
}
