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
 * As escritas de configuração (`financas:fluxo-caixa:configurar`) e a
 * validação da versão (`:validar`) chegam com o nó `config`.
 */
import { createSafeAction } from '@/server/safe-action';
import { FiltroDFCSchema } from '@/lib/validations/fluxo-caixa';
import { gerarDFC } from '@/server/services/financas/dfc.service';

export const gerarDFCAction = createSafeAction({
  schema: FiltroDFCSchema,
  permission: 'financas:fluxo-caixa:leitura',
  permiteEmLeitura: true,
  handler: (input, ctx) => gerarDFC(input, ctx),
});
