/**
 * Painel lateral de inspecção rápida de requisição.
 * Rota interceptada: activa durante navegação client-side de lista → /[id].
 * Acesso directo ao URL renderiza [id]/page.tsx (detalhe completo).
 *
 * Este componente é um Server Component — busca os dados do servidor.
 *
 * O interceptor `(.)[id]` também captura o segmento literal `novo` (é um valor
 * válido para `[id]`): na navegação lista → «Nova Requisição» este painel
 * corre com `id = 'novo'`. Duas armadilhas:
 *  - um `notFound()` aqui não fica no slot — sobe e substitui a página inteira
 *    por um 404. O painel NUNCA chama `notFound()`: o que não é uma requisição
 *    devolve `null`;
 *  - devolver `null` não chega para `novo`: o `children` continua a listagem.
 *    Para os segmentos estáticos o painel pede uma navegação completa ao mesmo
 *    URL (`AbrirRotaReal`), que não é interceptada.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comprasService } from '@/server/services/compras/compras.service';
import { RequisicaoPainel } from '../../_components/requisicao-panel';
import { AbrirRotaReal } from '../../_components/abrir-rota-real';

interface Props {
  params: Promise<{ id: string }>;
}

/** Segmentos estáticos irmãos de `[id]` que o interceptor também apanha. */
const SEGMENTOS_ESTATICOS = new Set(['novo']);

export default async function RequisicaoPanelPage({ params }: Props) {
  const { id } = await params;
  if (SEGMENTOS_ESTATICOS.has(id)) return <AbrirRotaReal href={`/compras/requisicoes/${id}`} />;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  let requisicao;
  try {
    requisicao = await runWithTenantContext({ tenantId, userId }, () =>
      comprasService.obterRequisicao(id, { tenantId, userId })
    );
  } catch {
    return null;
  }

  if (!requisicao) return null;

  return <RequisicaoPainel requisicao={requisicao} />;
}
