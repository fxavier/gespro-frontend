import 'server-only';

/**
 * O balancete tal como a página o mostra — consulta → hierarquia → filtros de
 * apresentação. Partilhado pela página `/contabilidade/balancete` e pela rota de
 * exportação, para que o ficheiro seja exactamente a tabela (S5, issue #285).
 * Os totais e as igualdades continuam a ser os do balancete completo.
 */
import type { ParametrosBalancete } from '@/lib/balancete-params';
import { filtrarBalancete, hierarquizarBalancete, type LinhaHierarquica } from './balancete-verificacao';
import { gerarBalanceteVerificacao } from './contabilidade.service';
import type { BalanceteVerificacaoResult } from './contabilidade.interface';

type Ctx = { tenantId: string; userId: string };

export async function balanceteApresentado(
  p: Pick<ParametrosBalancete, 'filtroServico' | 'opcoesHierarquia' | 'filtros'>,
  ctx: Ctx,
): Promise<{ balancete: BalanceteVerificacaoResult; linhas: LinhaHierarquica[] }> {
  const balancete = await gerarBalanceteVerificacao(p.filtroServico, ctx);
  const linhas = filtrarBalancete(
    hierarquizarBalancete(balancete, balancete.contas, p.opcoesHierarquia),
    p.filtros,
  );
  return { balancete, linhas };
}
