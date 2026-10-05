import { Prisma } from '@prisma/client';

/**
 * `documentoOrigemTipo` da abertura GERADA (#363, ADR-0035 §6) e do estorno dela. A abertura
 * guarda em `documentoOrigemId` o exercício anterior; o estorno dela (só
 * `estornarLancamentoAberturaEmTx` o escreve — o estorno genérico recusa) leva a mesma origem,
 * para que este predicado o reconheça sem seguir o `lancamentoEstornoId` (que não é relação
 * Prisma). A origem é reservada: `criarLancamento` recusa-a (`DOCUMENTO_ORIGEM_RESERVADO`).
 */
export const ORIGEM_ABERTURA = 'ExercicioContabil';

/**
 * A abertura GERADA (diário ABERTURA, origem `ORIGEM_ABERTURA`) re-afirma, à data de início
 * do exercício, saldos que já estão no razão — os lançamentos do anterior (ADR-0035 §6, #363).
 * Um leitor que soma «tudo com data ≤ X» contá-la-ia duas vezes; as vistas por PERÍODO
 * (`gerarBalanceteVerificacao`, razão por períodos) usam-na em vez da abertura implícita. O
 * estorno dela tem a mesma origem e sai com ela. Uma abertura MANUAL (sem essa origem — os saldos
 * iniciais de quem migra, ou dados legados) não re-afirma nada e conta sempre.
 */
export const SEM_ABERTURA_REAFIRMADA = {
  // Escrito pela positiva: `NOT { diario AB, origem = X }` perde as linhas de origem NULL (em
  // SQL, NOT (verdadeiro AND NULL) é NULL) — e são essas as aberturas manuais, que contam.
  OR: [
    { diario: { tipo: { not: 'ABERTURA' } } },
    { documentoOrigemTipo: null },
    { documentoOrigemTipo: { not: ORIGEM_ABERTURA } },
  ],
} satisfies Prisma.LancamentoWhereInput;

/**
 * Predicado dos MAPAS e da tesouraria por DATAS (balancete por datas e, por ele, a DFC; DRE;
 * projecção; reconciliação; importação): fora o fecho e a abertura gerada. Os leitores de UMA
 * conta (razão por datas, detalhe da conta, `saldoContabilAte`) usam só `SEM_ABERTURA_REAFIRMADA`:
 * um razão mostra o fecho (ADR-0035, «Decisões de implementação»).
 *  - Período 13 (ADR-0035, «Decisões de implementação», #138): os lançamentos de
 *    encerramento têm a data do fim do exercício e, contados, punham o resultado do ano a
 *    zero.
 *  - Abertura gerada: ver `SEM_ABERTURA_REAFIRMADA`.
 * Os mapas por PERÍODO não o usam. Para SQL cru: `sqlForaDeFechoEAbertura`.
 */
export const FORA_DE_FECHO_E_ABERTURA = {
  periodo: { ordem: { not: 13 } },
  ...SEM_ABERTURA_REAFIRMADA,
} satisfies Prisma.LancamentoWhereInput;

/**
 * `FORA_DE_FECHO_E_ABERTURA` em SQL, para leitores em `$queryRaw`. `alias` é o alias do
 * "Lancamento" na consulta — constante do chamador, nunca entrada do utilizador. Além da origem,
 * segue o `lancamentoEstornoId` até ao original (estorno de uma abertura gerada).
 */
export function sqlForaDeFechoEAbertura(alias: string): Prisma.Sql {
  const l = Prisma.raw(alias);
  return Prisma.sql`NOT EXISTS (
      SELECT 1 FROM "PeriodoContabil" pc
      JOIN "Diario" di ON di.id = ${l}."diarioId"
      WHERE pc.id = ${l}."periodoId"
        AND (
          pc.ordem = 13
          OR (
            di.tipo::text = 'ABERTURA'
            AND (
              ${l}."documentoOrigemTipo" = ${ORIGEM_ABERTURA}
              OR EXISTS (
                SELECT 1 FROM "Lancamento" orig
                WHERE orig.id = ${l}."lancamentoEstornoId" AND orig."tenantId" = ${l}."tenantId"
                  AND orig."documentoOrigemTipo" = ${ORIGEM_ABERTURA}
              )
            )
          )
        )
    )`;
}

/**
 * `FORA_DE_FECHO_E_ABERTURA` sobre um lançamento já lido — para quem pagina por keyset e não
 * pode tirar linhas ao `where` (importação). Campo ausente conta como «não é».
 */
export function eFechoOuAbertura(l: {
  ordem?: number | null;
  diarioTipo?: string | null;
  documentoOrigemTipo?: string | null;
}): boolean {
  return l.ordem === 13 || (l.diarioTipo === 'ABERTURA' && l.documentoOrigemTipo === ORIGEM_ABERTURA);
}
