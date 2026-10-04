/**
 * Novo Lançamento Contabilístico — Server Component.
 * Carrega contas e diários do servidor para o formulário inline.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { PageHeader } from '@/components/patterns';
import { NovoLancamentoForm } from './_components/novo-lancamento-form';

/**
 * Pré-preenchimento por `searchParams` (ADR-0038, RF §9): a reconciliação sugere
 * o lançamento de um movimento bancário por contabilizar e manda para aqui.
 * `?data=aaaa-mm-dd&historico=…&p=contaId:DEBITO:500.00&p=…` — o utilizador revê e grava.
 * Com UMA só partida (movimento sem regra que case) acrescenta-se a contrapartida em
 * branco, do lado oposto e pelo mesmo valor: falta só escolher a conta.
 */
function lerPrefill(sp: { data?: string; historico?: string; p?: string | string[] }) {
  const partidas = [sp.p ?? []].flat().flatMap((raw) => {
    const [contaId, tipo, valor] = raw.split(':');
    // O formulário existente trabalha em `number` (CriarLancamentoSchema); só entra um
    // montante com até 2 casas, e o utilizador revê-o antes de gravar.
    const v = /^\d+(\.\d{1,2})?$/.test(valor ?? '') ? Number(valor) : NaN;
    return contaId && (tipo === 'DEBITO' || tipo === 'CREDITO') && Number.isFinite(v) && v > 0
      ? [{ contaId, tipo: tipo as 'DEBITO' | 'CREDITO', valor: v, historico: '' }]
      : [];
  });
  if (partidas.length === 1) {
    const [p] = partidas;
    partidas.push({ contaId: '', tipo: p.tipo === 'DEBITO' ? 'CREDITO' : 'DEBITO', valor: p.valor, historico: '' });
  }
  const data = sp.data && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : undefined;
  if (!data && !sp.historico && partidas.length < 2) return undefined;
  return { data, historico: sp.historico?.slice(0, 500), partidas: partidas.length >= 2 ? partidas : undefined };
}

export default async function NovoLancamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; historico?: string; p?: string | string[] }>;
}) {
  const prefill = lerPrefill(await searchParams);
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;

  // Opções iniciais para o ComboboxRemoto: primeira página (50 contas) + contas
  // do pré-preenchimento que possam estar fora dela (ex.: classes 6-8).
  // Padrão: `opcoes.ts` da reconciliação — Map por id para deduplicar.
  let contas: { id: string; codigo: string; nome: string }[] = [];
  let diarios: { id: string; codigo: string; nome: string; tipo: string }[] = [];

  try {
    const ctx = { tenantId, userId };
    const prefillIds = [
      ...new Set((prefill?.partidas ?? []).map((p) => p.contaId).filter(Boolean)),
    ];

    await runWithTenantContext(ctx, async () => {
      const [pagina, listarDiariosResult, prefillResolvidas] = await Promise.all([
        contabilidadeService.listarContas({ aceitaLancamento: true, ativo: true, take: 50 }, ctx),
        contabilidadeService.listarDiarios(ctx),
        Promise.all(prefillIds.map((id) => contabilidadeService.obterConta(id, ctx))),
      ]);

      diarios = listarDiariosResult.map((d: any) => ({
        id: d.id,
        codigo: d.codigo,
        nome: d.nome,
        tipo: d.tipo,
      }));

      // Primeira página de contas + pré-preenchimento fora da primeira página.
      const contasMap = new Map(
        pagina.items.map((c: any) => [c.id, { id: c.id, codigo: c.codigo, nome: c.nome }]),
      );
      for (const c of prefillResolvidas) {
        if (c && !contasMap.has(c.id)) {
          contasMap.set(c.id, { id: c.id, codigo: c.codigo, nome: c.nome });
        }
      }
      contas = [...contasMap.values()];
    });
  } catch {
    // Se o serviço falhar, formulário mostra selects vazios
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="p-6 pb-0">
        <PageHeader
          title="Novo Lançamento Contabilístico"
          description="Registar lançamento com partidas dobradas (débito = crédito)"
          breadcrumbs={[
            { label: 'Contabilidade', href: '/contabilidade' },
            { label: 'Lançamentos', href: '/contabilidade/lancamentos' },
            { label: 'Novo' },
          ]}
        />
      </div>

      <NovoLancamentoForm contas={contas} diarios={diarios} valoresIniciais={prefill} />
    </div>
  );
}
