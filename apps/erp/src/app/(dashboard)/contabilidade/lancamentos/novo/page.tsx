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

  let contas: { id: string; codigo: string; nome: string }[] = [];
  let diarios: { id: string; codigo: string; nome: string; tipo: string }[] = [];

  try {
    const [contasResult, diariosResult] = await runWithTenantContext({ tenantId, userId }, () =>
      Promise.all([
        contabilidadeService.listarContas({ aceitaLancamento: true, take: 200 }, { tenantId, userId }),
        contabilidadeService.listarDiarios({ tenantId, userId }),
      ])
    );

    contas = contasResult.items.map((c: any) => ({
      id: c.id,
      codigo: c.codigo,
      nome: c.nome,
    }));

    diarios = diariosResult.map((d: any) => ({
      id: d.id,
      codigo: d.codigo,
      nome: d.nome,
      tipo: d.tipo,
    }));
    // A conta sugerida pode não estar entre as 200 primeiras — sem isto o select apareceria vazio.
    const emFalta = (prefill?.partidas ?? []).map((p) => p.contaId).filter((id) => !contas.some((c) => c.id === id));
    for (const id of new Set(emFalta)) {
      const c = await runWithTenantContext({ tenantId, userId }, () => contabilidadeService.obterConta(id, { tenantId, userId }));
      if (c) contas.push({ id: c.id, codigo: c.codigo, nome: c.nome });
    }
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
