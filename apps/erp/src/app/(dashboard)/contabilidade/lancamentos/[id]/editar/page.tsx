/**
 * Editar um lançamento em RASCUNHO — Server Component (#137, D2).
 *
 * Reutiliza o formulário do novo em modo edição: tudo muda menos o diário (o
 * número pertence-lhe) e o período (a data fica no mesmo mês). Um lançamento
 * que já não seja rascunho não mostra formulário: explica porquê e para onde ir.
 */

import Link from 'next/link';
import { dataParaDiaIso } from '@/lib/format-date';
import { notFound } from 'next/navigation';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';
import { acessoLancamentos } from '../../_lib/acesso';
import { NovoLancamentoForm } from '../../novo/_components/novo-lancamento-form';

/** Primeiro e último dia (`aaaa-mm-dd`) do mês de um período `aaaa-mm`. */
function limitesDoPeriodo(periodoFiscal: string): { dataMin?: string; dataMax?: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(periodoFiscal);
  if (!m) return {};
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return {}; // período 13 (encerramento): sem limites de calendário
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return { dataMin: `${periodoFiscal}-01`, dataMax: `${periodoFiscal}-${String(ultimoDia).padStart(2, '0')}` };
}

export default async function EditarLancamentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { ctx, podeEscrever } = await acessoLancamentos();
  const { id } = await params;

  const lancamento = await runWithTenantContext(ctx, () =>
    contabilidadeService.obterLancamento(id, ctx)
  );
  if (!lancamento) notFound();

  const detalhe = `/contabilidade/lancamentos/${lancamento.id}`;

  const cabecalho = (
    <PageHeader
      title={`Editar lançamento ${lancamento.numero}`}
      description="Histórico, observações, data e partidas. O número e o diário não mudam."
      breadcrumbs={[
        { label: 'Contabilidade', href: '/contabilidade' },
        { label: 'Lançamentos', href: '/contabilidade/lancamentos' },
        { label: lancamento.numero, href: detalhe },
        { label: 'Editar' },
      ]}
    />
  );

  const aviso = (texto: string) => (
    <div className="p-6 space-y-6">
      {cabecalho}
      <div className="rounded-lg border border-warning/40 bg-warning/10 p-6 text-sm">
        <p>{texto}</p>
        <Button asChild size="sm" variant="outline" className="mt-4">
          <Link href={detalhe}>Voltar ao lançamento</Link>
        </Button>
      </div>
    </div>
  );

  if (lancamento.status !== 'RASCUNHO') {
    return aviso(
      lancamento.status === 'ANULADO'
        ? 'Este rascunho foi anulado e já não se edita. Para registar o movimento, crie um lançamento novo.'
        : 'Só um lançamento em rascunho se edita. Este já foi confirmado: a correcção faz-se por estorno, a partir do detalhe.'
    );
  }
  if (!podeEscrever) {
    return aviso(
      'Não tem permissão para editar lançamentos. Peça a quem tenha «Criar e editar lançamentos» para corrigir este rascunho.'
    );
  }

  const listadas = await runWithTenantContext(ctx, () =>
    contabilidadeService.listarContas({ aceitaLancamento: true, take: 200 }, ctx)
  );
  const contas = listadas.items.map((c) => ({ id: c.id, codigo: c.codigo, nome: c.nome }));
  // As contas do rascunho podem não estar entre as 200 primeiras — sem isto o campo aparece vazio.
  for (const p of lancamento.partidas) {
    if (p.conta && !contas.some((c) => c.id === p.conta.id)) {
      contas.push({ id: p.conta.id, codigo: p.conta.codigo, nome: p.conta.nome });
    }
  }

  const partidas = lancamento.partidas.map((p) => ({
    contaId: p.contaId,
    tipo: p.tipo,
    valor: Number(p.valor.toString()),
    historico: p.historico ?? '',
    ...(p.centroCustoId ? { centroCustoId: p.centroCustoId } : {}),
  }));

  return (
    <div className="min-h-screen flex flex-col">
      <div className="p-6 pb-0">{cabecalho}</div>

      <NovoLancamentoForm
        contas={contas}
        diarios={[]}
        valoresIniciais={{
          data: dataParaDiaIso(lancamento.data),
          historico: lancamento.historico,
          observacoes: lancamento.observacoes ?? undefined,
          partidas,
        }}
        edicao={{
          id: lancamento.id,
          diario: lancamento.diario
            ? `${lancamento.diario.codigo} — ${lancamento.diario.nome}`
            : '—',
          ...limitesDoPeriodo(lancamento.periodoFiscal),
        }}
      />
    </div>
  );
}
