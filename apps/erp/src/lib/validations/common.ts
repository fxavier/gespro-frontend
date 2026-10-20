/**
 * Helpers de validação comuns a vários módulos (WS C, WS B, etc.).
 * Partilhado cliente/servidor: sem 'server-only', sem imports de Prisma.
 *
 * Exporta:
 *  - nuit()          — Zod schema para NUIT moçambicano (9 dígitos)
 *  - biMocambicano() — Zod schema para BI moçambicano (12 dígitos + letra)
 *  - provinciaSchema — Zod enum das 11 províncias de Moçambique
 *  - PROVINCIAS_MZ   — array das províncias (para uso em UI/seed)
 */

import { z } from 'zod';
import { validarNUIT } from '@/lib/validacao-nuit';
import { validarBI } from '@/lib/validacao-bi';
import { getProvincias } from '@/lib/provincias-mocambique';
import { inicioDoDiaMaputo, fimDoDiaMaputo } from '@/lib/periodo-fiscal';

// ---------------------------------------------------------------------------
// Limites de intervalo por datas (#88, #349)
// ---------------------------------------------------------------------------

/**
 * `aaaa-mm-dd` é o dia civil INTEIRO de Maputo — início às 00:00, fim às
 * 23:59:59.999 (+02:00). `z.coerce.date` sozinho dava a meia-noite UTC e, como
 * `lte`, deixava de fora o próprio último dia. Dates e strings com hora passam
 * inalterados. Não usar em colunas `@db.Date` (aí a meia-noite UTC é o dia certo).
 */
export const inicioDoDia = () => z.preprocess(inicioDoDiaMaputo, z.coerce.date());
export const fimDoDia = () => z.preprocess(fimDoDiaMaputo, z.coerce.date());

// ---------------------------------------------------------------------------
// Dinheiro (#568)
// ---------------------------------------------------------------------------

/**
 * Valor monetário: número com no máximo duas casas decimais, como a coluna `Decimal(18,2)`.
 * O `multipleOf` do Zod 3 compara em inteiros (escala pelas casas de `toString`), por isso
 * aceita 0.07/1.15/86.21 e recusa 86.205 sem erro de vírgula flutuante.
 */
export const dinheiro = (msg = 'O valor tem no máximo duas casas decimais') =>
  z.number().multipleOf(0.01, msg);

// ---------------------------------------------------------------------------
// NUIT
// ---------------------------------------------------------------------------

/**
 * Retorna um Zod schema que valida NUIT moçambicano (9 dígitos, não todos iguais).
 * Uso: `nuit()` como campo num z.object({...}).
 */
export function nuit(msg = 'NUIT inválido — deve ter 9 dígitos não repetidos') {
  return z
    .string()
    .min(9, 'NUIT deve ter exactamente 9 dígitos')
    .max(9, 'NUIT deve ter exactamente 9 dígitos')
    .refine((v) => validarNUIT(v), { message: msg });
}

// ---------------------------------------------------------------------------
// BI
// ---------------------------------------------------------------------------

/**
 * Retorna um Zod schema que valida Bilhete de Identidade moçambicano.
 * Formato: 12 dígitos seguidos de uma letra maiúscula (ex: 110100123456A).
 */
export function biMocambicano(
  msg = 'BI inválido — formato: 12 dígitos seguidos de uma letra maiúscula (ex: 110100123456A)',
) {
  return z.string().refine((v) => validarBI(v), { message: msg });
}

// ---------------------------------------------------------------------------
// Províncias
// ---------------------------------------------------------------------------

const _provincias = getProvincias();

/** Lista das províncias moçambicanas. Usada no provinciaSchema e no seed. */
export const PROVINCIAS_MZ = _provincias as [string, ...string[]];

/**
 * Zod schema para validar uma província moçambicana.
 * Valida contra a lista oficial de 11 províncias + Maputo Cidade.
 */
export const provinciaSchema = z.enum(PROVINCIAS_MZ);

// ---------------------------------------------------------------------------
// Identificadores de entidade
// ---------------------------------------------------------------------------

/**
 * Id de entidade: aceita **cuid ou uuid**.
 *
 * O Prisma gera cuid por omissão, mas o bootstrap do plano de contas
 * (`tenant-bootstrap.ts`) tem de atribuir os ids à mão — o `createMany` insere
 * por níveis e o filho precisa de saber o id do pai antes de existir — e usa
 * `crypto.randomUUID()`. Resultado: TODAS as contas PGC de TODOS os tenants,
 * em produção inclusive, têm uuid. Um `z.string().cuid()` num campo que
 * carregue um id de conta rejeita-as a todas.
 */
export const idEntidade = (mensagem = 'ID inválido') =>
  z.string().refine(
    (v) =>
      /^c[a-z0-9]{20,}$/i.test(v) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
    { message: mensagem },
  );

// ---------------------------------------------------------------------------
// Datas de documento
// ---------------------------------------------------------------------------

/**
 * Forma ÚNICA de um código de `Plano` (ADR-0049 §1, #526): SCREAMING_SNAKE, começa por letra,
 * 2 a 31 caracteres. Partilhada pelo `codigoPlano()`, pelo registo público (`planoSeguro`) e pelo
 * `plano-admin.service` (`PLANO_CODIGO_INVALIDO`) — não a repitas noutro sítio.
 */
export const RE_CODIGO_PLANO = /^[A-Z][A-Z0-9_]{1,30}$/;

/**
 * Código de um `Plano` (ADR-0049 §1). O Zod não fixa a lista — os planos vivem na tabela e um
 * plano novo não pode exigir deploy; a existência e o estado (arquivado) verificam-se no serviço
 * contra a tabela (`PLANO_INDISPONIVEL`). Só a FORMA é fixa (`RE_CODIGO_PLANO`).
 */
export const codigoPlano = () =>
  z
    .string()
    .trim()
    .min(1, 'Plano obrigatório')
    .regex(RE_CODIGO_PLANO, 'Código de plano inválido: maiúsculas, algarismos e _, começando por letra (2 a 31 caracteres)');

/** Intervalo de anos aceite numa data de documento (emissão, vencimento, validade). */
export const ANO_DOCUMENTO_MIN = 2000;
export const ANO_DOCUMENTO_MAX = 2100;

/**
 * Data de um documento emitido. Um `<input type="date">` aceita anos de cinco
 * algarismos (`92026-09-26`) e o `z.coerce.date()` também: a emissão seguia até
 * ao serviço e falhava com «série do ano 92026 não encontrada». Fora do
 * intervalo o erro é do campo, antes de sair do formulário.
 */
export function dataDocumento(rotulo = 'Data') {
  return z.coerce
    .date({ errorMap: () => ({ message: `${rotulo} inválida` }) })
    .refine(
      (d) => {
        const ano = d.getUTCFullYear();
        return ano >= ANO_DOCUMENTO_MIN && ano <= ANO_DOCUMENTO_MAX;
      },
      { message: `${rotulo} inválida: o ano tem de estar entre ${ANO_DOCUMENTO_MIN} e ${ANO_DOCUMENTO_MAX}` },
    );
}
