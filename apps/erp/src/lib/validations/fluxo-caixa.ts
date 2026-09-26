/**
 * Validações Zod da Demonstração de Fluxos de Caixa (spec 22 · WS-2 · ADR-0037
 * com a emenda de 2026-09-25).
 *
 * Ficheiro NOVO e próprio — não estende `validations/contabilidade.ts` (ponto
 * de conflito com o spec 04) nem `validations/tesouraria.ts` (WS-1).
 *
 * Partilhado cliente/servidor: sem 'server-only', sem imports de Prisma.
 * Ids sempre por `idEntidade()` — nunca `z.string().cuid()`: o tenant-bootstrap
 * atribui uuid às contas PGC e um `.cuid()` rejeitaria todas as contas reais.
 *
 * Os limites da DFC são PERÍODOS CONTABILÍSTICOS (ADR-0037 §6, E3), não datas
 * livres: por isso não há aqui nenhum `z.coerce.date()`. O defeito «`dataFim`
 * à meia-noite UTC deixa de fora o último dia» (CLAUDE.md) não tem por onde
 * entrar quando o intervalo é um par de ids de `PeriodoContabil`.
 */

import { z } from 'zod';
import { idEntidade } from '@/lib/validations/common';

// ---------------------------------------------------------------------------
// Enums (espelham prisma/schema/financas.prisma — ADR-0037 §2, E1, E2, E6)
// ---------------------------------------------------------------------------

/** `CAIXA` é a rubrica «Caixa e equivalentes» (E2), não uma secção do mapa. */
export const AtividadeFluxoEnum = z.enum([
  'OPERACIONAL',
  'INVESTIMENTO',
  'FINANCIAMENTO',
  'CAIXA',
]);
export const SinalFluxoEnum = z.enum(['ENTRADA', 'SAIDA', 'VARIACAO']);
export const OrigemRubricaEnum = z.enum(['SISTEMA', 'TENANT']);
/** Nomes em inglês por decisão humana (E6); na UI «Por validar» / «Validado». */
export const EstadoVersaoMapeamentoEnum = z.enum(['PENDING', 'VALIDATED']);

export type AtividadeFluxo = z.infer<typeof AtividadeFluxoEnum>;
export type SinalFluxo = z.infer<typeof SinalFluxoEnum>;
export type OrigemRubrica = z.infer<typeof OrigemRubricaEnum>;
export type EstadoVersaoMapeamento = z.infer<typeof EstadoVersaoMapeamentoEnum>;

/** As três secções do mapa — `CAIXA` fica de fora por construção. */
export const AtividadeSeccaoEnum = AtividadeFluxoEnum.exclude(['CAIXA']);
export type AtividadeSeccao = z.infer<typeof AtividadeSeccaoEnum>;

// ---------------------------------------------------------------------------
// DFC — filtro (searchParams da página e input da action de leitura)
// ---------------------------------------------------------------------------

/**
 * Um período ou um intervalo de períodos do MESMO exercício (E3). O mesmo id
 * nos dois campos é um período só. Sem `.default()`: a página escolhe o
 * período corrente a partir do calendário, não o Zod.
 *
 * O que o Zod NÃO consegue verificar, e fica para o serviço:
 *  - início e fim no mesmo exercício → `DFC_ENTRE_EXERCICIOS` (V4);
 *  - fim anterior ao início (por `ordem`) → `DFC_INTERVALO_INVERTIDO`;
 *  - ids de outro tenant → `NotFoundError` (I10).
 */
export const FiltroDFCSchema = z.object({
  periodoInicioId: idEntidade('ID do período inicial inválido'),
  periodoFimId: idEntidade('ID do período final inválido'),
});

export type FiltroDFCInput = z.infer<typeof FiltroDFCSchema>;

// ---------------------------------------------------------------------------
// Configuração do mapeamento (financas:fluxo-caixa:configurar)
// ---------------------------------------------------------------------------

/**
 * Reatribui a rubrica de uma conta. É a escrita que resolve um impedimento
 * (ADR-0037 §4): a conta passa a ter exactamente um mapeamento. Cria a versão
 * n+1 em PENDING se mudar alguma coisa (V2).
 */
export const MapearContaSchema = z.object({
  contaId: idEntidade('ID de conta inválido'),
  rubricaId: idEntidade('ID de rubrica inválido'),
});

export type MapearContaInput = z.infer<typeof MapearContaSchema>;

/** Retira o mapeamento de uma conta (fica não mapeada: impedimento se tiver movimento). */
export const DesmapearContaSchema = z.object({
  contaId: idEntidade('ID de conta inválido'),
});

export type DesmapearContaInput = z.infer<typeof DesmapearContaSchema>;

/**
 * Código de rubrica: prefixo alfabético, hífen, dígitos (`OP-01`, `INV-02`,
 * `FIN-03`, `CX-01`). Maiúsculas obrigatórias — o `@@unique([tenantId,
 * codigo])` é sensível a maiúsculas e um `op-01` ao lado de um `OP-01` seriam
 * duas rubricas para o olho humano iguais.
 */
export const CODIGO_RUBRICA_REGEX = /^[A-Z]{2,4}-\d{2,3}$/;

const RubricaCamposSchema = z.object({
  codigo: z
    .string()
    .trim()
    .regex(CODIGO_RUBRICA_REGEX, 'Código no formato XX-00 (ex.: OP-01)'),
  designacao: z.string().trim().min(1, 'Designação obrigatória').max(120),
  atividade: AtividadeFluxoEnum,
  sinal: SinalFluxoEnum,
  ordem: z.coerce.number().int().min(0).max(9999),
});

/** Rubricas criadas pelo tenant nascem `origem: TENANT` — o serviço fixa-o, nunca o input. */
export const CriarRubricaSchema = RubricaCamposSchema;

export type CriarRubricaInput = z.infer<typeof CriarRubricaSchema>;

/**
 * Edição parcial. `origem` não é editável (uma rubrica SISTEMA não passa a
 * TENANT para ficar apagável); `ativo` é a única forma de «desligar» uma
 * rubrica SISTEMA, porque apagá-la recusa com `RUBRICA_DE_SISTEMA`.
 */
export const EditarRubricaSchema = RubricaCamposSchema.partial().extend({
  id: idEntidade('ID de rubrica inválido'),
  ativo: z.boolean().optional(),
});

export type EditarRubricaInput = z.infer<typeof EditarRubricaSchema>;

/** Elimina (soft delete) uma rubrica `TENANT` sem contas. */
export const EliminarRubricaSchema = z.object({
  id: idEntidade('ID de rubrica inválido'),
});

export type EliminarRubricaInput = z.infer<typeof EliminarRubricaSchema>;

/**
 * Define o conjunto das contas de caixa e equivalentes (E2): as contas
 * mapeadas à rubrica `CAIXA`. É um conjunto, não uma lista: repetições são
 * rejeitadas em vez de contadas duas vezes. Pelo menos uma — sem contas de
 * caixa não há Δcaixa nem articulação (E2: é um impedimento na DFC, e não
 * faz sentido gravar de propósito um estado que a DFC recusa).
 * As contas que saírem do conjunto ficam NÃO MAPEADAS (impedimento até
 * alguém as reatribuir) — nunca se adivinha uma actividade para elas.
 */
export const DefinirContasCaixaSchema = z.object({
  contaIds: z
    .array(idEntidade('ID de conta inválido'))
    .min(1, 'Indique pelo menos uma conta de caixa')
    .max(200)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Conta repetida na lista de contas de caixa',
    }),
});

export type DefinirContasCaixaInput = z.infer<typeof DefinirContasCaixaSchema>;

// ---------------------------------------------------------------------------
// Validação de uma versão (financas:fluxo-caixa:validar — E5)
// ---------------------------------------------------------------------------

/**
 * Valida a versão indicada. O serviço recusa com `VERSAO_DESACTUALIZADA` se
 * não for a mais recente (V3): o parecer do contabilista fica preso à versão
 * concreta que ele viu, não «à actual», que pode ter mudado entretanto.
 * A observação é um campo de texto — vai numa rota própria, não num
 * `AlertDialog` (ui-conventions).
 */
export const ValidarVersaoSchema = z.object({
  versaoId: idEntidade('ID de versão inválido'),
  observacao: z
    .string()
    .trim()
    .max(1000, 'Observação demasiado longa (máx. 1000 caracteres)')
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
});

export type ValidarVersaoInput = z.infer<typeof ValidarVersaoSchema>;

// ---------------------------------------------------------------------------
// UI de configuração
// ---------------------------------------------------------------------------

/** Pesquisa de contas para o `ComboboxRemoto` (código ou nome). */
export const ProcurarContasDFCSchema = z.object({
  q: z.string().trim().max(100).default(''),
});

export type ProcurarContasDFCInput = z.infer<typeof ProcurarContasDFCSchema>;

/**
 * Destino depois de gravar (`?voltar=`). Só caminhos internos da
 * contabilidade: um `voltar` arbitrário seria um redireccionamento aberto
 * (`//evil.example`, `https://…`, `/\evil`). Devolve `null` se não for seguro.
 *
 * Duas camadas, porque a verificação textual sozinha não chega: o browser e o
 * router normalizam o caminho DEPOIS de o validarmos, e `%2e%2e` é um `..`
 * para o parser de URL (WHATWG) — `/contabilidade/%2e%2e/vendas` passava no
 * `startsWith` e aterrava em `/vendas`.
 *  1. texto em bruto: prefixo, sem `\`, sem `://`, sem `..`, sem caracteres de
 *     controlo (o parser de URL apaga CR/LF/TAB em silêncio, por isso vêm antes);
 *  2. normalizado: `new URL(voltar, base)` tem de ficar na mesma origem, com o
 *     caminho resolvido ainda dentro de `/contabilidade/`, e o caminho não pode
 *     trazer percent-encoding NENHUM: um `..%2f..%2fvendas` é inofensivo para o
 *     parser mas não para quem o descodificar a seguir, e `%252e%252e` só vira
 *     `..` à segunda descodificação. Nenhuma rota da contabilidade precisa de
 *     `%` no caminho (ids são cuid/uuid); a query-string pode tê-lo.
 * Devolve o caminho normalizado (`pathname + search`, sem fragmento).
 */
export function voltarSeguro(voltar: string | null | undefined): string | null {
  if (!voltar) return null;
  if (!voltar.startsWith('/contabilidade/')) return null;
  if (voltar.includes('\\') || voltar.includes('://') || voltar.includes('..')) return null;
  for (let i = 0; i < voltar.length; i++) {
    const c = voltar.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return null;
  }

  const BASE = 'http://gespro.invalido';
  let url: URL;
  try {
    url = new URL(voltar, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  if (!url.pathname.startsWith('/contabilidade/') || url.pathname.includes('//')) return null;
  if (url.pathname.includes('%')) return null;
  return url.pathname + url.search;
}
