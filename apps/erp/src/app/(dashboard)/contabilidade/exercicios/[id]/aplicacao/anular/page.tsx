/**
 * Anular a aplicação do resultado (ADR-0035 §5, #364) — rota com formulário de motivo.
 *
 * Estorna o lançamento da aplicação no período dele; depois disso o resultado pode aplicar-se de
 * novo e o exercício pode reabrir. Sem aplicação activa, uma mensagem. Sem
 * `financas:exercicio:aplicar-resultado`, «Sem permissão». Outro tenant → 404.
 *
 * NUNCA 'use client'.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as aplicacaoResultadoService from '@/server/services/financas/aplicacao-resultado.service';
import { formatarData } from '@/lib/format-date';
import { formatMZN } from '@/lib/format-currency';
import { acessoExercicios, obterExercicioDoTenant } from '../../../_lib/acesso';
import { SemPermissao } from '@/components/patterns/sem-permissao';
import { AnularAplicacaoForm } from './_components/anular-aplicacao-form';

export default async function AnularAplicacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acesso = await acessoExercicios();

  const exercicio = await obterExercicioDoTenant(id, acesso.ctx);
  if (!exercicio) notFound();

  const titulo = 'Anular aplicação do resultado';
  const breadcrumbs = [
    { label: 'Contabilidade', href: '/contabilidade' },
    { label: 'Exercícios', href: '/contabilidade/exercicios' },
    { label: `Exercício ${exercicio.codigo}` },
    { label: 'Anular aplicação' },
  ];

  if (!acesso.podeAplicarResultado) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader title={titulo} breadcrumbs={breadcrumbs} />
        <SemPermissao mensagem="Não tem permissão para anular a aplicação do resultado." />
      </div>
    );
  }

  const situacao = await runWithTenantContext(acesso.ctx, () =>
    aplicacaoResultadoService.obterSituacaoAplicacaoResultado(exercicio.id, acesso.ctx),
  );
  if (!situacao) notFound();

  if (!situacao.activa) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader title={titulo} breadcrumbs={breadcrumbs} />
        <div className="max-w-2xl rounded-lg border bg-muted/20 p-5">
          <p className="font-medium">Não há aplicação do resultado em vigor</p>
          <p className="mt-1 text-sm text-muted-foreground">
            O resultado do exercício {exercicio.codigo} não está aplicado — nada a anular.
          </p>
          <div className="mt-3">
            <Button asChild size="sm" variant="outline">
              <Link href="/contabilidade/exercicios">Voltar a Exercícios</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={titulo}
        description={`Estornar a aplicação do resultado do exercício ${exercicio.codigo}`}
        breadcrumbs={breadcrumbs}
      />
      <AnularAplicacaoForm
        aplicacaoId={situacao.activa.id}
        codigo={exercicio.codigo}
        resumo={`Aplicação de ${formatarData(situacao.activa.dataDeliberacao)} (acta ${situacao.activa.referenciaActa}), ${formatMZN(situacao.activa.valor.toString())}`}
      />
    </div>
  );
}
