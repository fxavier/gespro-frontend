'use server';
/**
 * Server Actions da Demonstração de Fluxos de Caixa (spec 22 · WS-2 ·
 * ADR-0037; nó `fatia` do grafo `dfc`, ticket 6.2).
 *
 * Via `createSafeAction`: o retorno é sempre `ActionResult<T>` já serializado
 * (`Prisma.Decimal` → string); nunca se lança para o cliente. Um
 * `BusinessRuleError` do serviço (`DFC_NAO_ARTICULA`, `DFC_ENTRE_EXERCICIOS`,
 * `DFC_INTERVALO_INVERTIDO`) chega como erro da action, com `code` e `details`.
 *
 * `gerarDFCAction` é uma consulta: declara `permiteEmLeitura: true` (ADR-0032),
 * senão um cliente em modo de Leitura deixava de ver a DFC que é dele. A página
 * `/contabilidade/dfc` NÃO passa por aqui — é Server Component e chama o
 * serviço directamente; a action existe para componentes cliente (o nó
 * `pagina` e o E2E).
 *
 * Configuração do mapeamento (nó `config`, ticket 7.2): as escritas com
 * `financas:fluxo-caixa:configurar` e a validação da versão com
 * `financas:fluxo-caixa:validar` (ADR-0037 E5 — só o ADMIN, por omissão).
 * Cada escrita revalida a DFC e o painel de rubricas: a faixa «Mapeamento por
 * validar» depende da versão que a escrita acabou de criar.
 */
import { createSafeAction } from '@/server/safe-action';
import {
  CriarRubricaSchema,
  DefinirContasCaixaSchema,
  DesmapearContaSchema,
  EditarRubricaSchema,
  EliminarRubricaSchema,
  FiltroDFCSchema,
  MapearContaSchema,
  ProcurarContasDFCSchema,
  ValidarVersaoSchema,
} from '@/lib/validations/fluxo-caixa';
import * as dfc from '@/server/services/financas/dfc.service';
import { listarContas } from '@/server/services/financas/contabilidade.service';

const { gerarDFC } = dfc;

const CONFIGURAR = 'financas:fluxo-caixa:configurar';
const REVALIDAR = { paths: ['/contabilidade/dfc', '/contabilidade/fluxo-caixa/rubricas'] };

export const gerarDFCAction = createSafeAction({
  schema: FiltroDFCSchema,
  permission: 'financas:fluxo-caixa:leitura',
  permiteEmLeitura: true,
  handler: (input, ctx) => gerarDFC(input, ctx),
});

// ---------------------------------------------------------------------------
// Configuração do mapeamento (ticket 7.2)
// ---------------------------------------------------------------------------

export const mapearContaAction = createSafeAction({
  schema: MapearContaSchema,
  permission: CONFIGURAR,
  revalidate: REVALIDAR,
  handler: (input, ctx) => dfc.mapearConta(input, ctx),
});

export const desmapearContaAction = createSafeAction({
  schema: DesmapearContaSchema,
  permission: CONFIGURAR,
  revalidate: REVALIDAR,
  handler: (input, ctx) => dfc.desmapearConta(input.contaId, ctx),
});

export const criarRubricaAction = createSafeAction({
  schema: CriarRubricaSchema,
  permission: CONFIGURAR,
  revalidate: REVALIDAR,
  handler: (input, ctx) => dfc.criarRubrica(input, ctx),
});

export const editarRubricaAction = createSafeAction({
  schema: EditarRubricaSchema,
  permission: CONFIGURAR,
  revalidate: REVALIDAR,
  handler: (input, ctx) => dfc.editarRubrica(input, ctx),
});

export const eliminarRubricaAction = createSafeAction({
  schema: EliminarRubricaSchema,
  permission: CONFIGURAR,
  revalidate: REVALIDAR,
  handler: (input, ctx) => dfc.eliminarRubrica(input.id, ctx),
});

export const definirContasCaixaAction = createSafeAction({
  schema: DefinirContasCaixaSchema,
  permission: CONFIGURAR,
  revalidate: REVALIDAR,
  handler: (input, ctx) => dfc.definirContasCaixa(input, ctx),
});

/** E5: permissão própria — quem configura não é, por omissão, quem valida. */
export const validarVersaoAction = createSafeAction({
  schema: ValidarVersaoSchema,
  permission: 'financas:fluxo-caixa:validar',
  revalidate: REVALIDAR,
  handler: (input, ctx) => dfc.validarVersao(input, ctx),
});

/**
 * Pesquisa de contas PGC folha para o `ComboboxRemoto` do «Mapear conta» e das
 * contas de caixa. Leitura: corre em modo de Leitura (ADR-0032).
 */
export const procurarContasDFCAction = createSafeAction({
  schema: ProcurarContasDFCSchema,
  permission: CONFIGURAR,
  permiteEmLeitura: true,
  handler: async (input, ctx) => {
    const pagina = await listarContas({ search: input.q, aceitaLancamento: true, ativo: true, take: 30 }, ctx);
    return pagina.items.map((c) => ({ id: c.id, codigo: c.codigo, nome: c.nome }));
  },
});
