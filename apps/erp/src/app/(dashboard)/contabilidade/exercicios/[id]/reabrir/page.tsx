/**
 * Reabrir exercício encerrado provisoriamente (ADR-0035 §1, #138) — rota com formulário de motivo.
 *
 * Espelha a página de reabrir período: fora de ENCERRADO_PROVISORIO mostra uma mensagem e nenhum
 * formulário. Sem `financas:exercicio:reabrir`, «Sem permissão».
 *
 * NUNCA 'use client'.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/patterns';
import { ROTULO_ESTADO_EXERCICIO } from '@/lib/state-machines';
import { Button } from '@/components/ui/button';
import { acessoExercicios, obterExercicioDoTenant } from '../../_lib/acesso';
import { SemPermissao } from '@/components/patterns/sem-permissao';
import { ReabrirExercicioForm } from './_components/reabrir-exercicio-form';

export default async function ReabrirExercicioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acesso = await acessoExercicios();

  const exercicio = await obterExercicioDoTenant(id, acesso.ctx);
  if (!exercicio) notFound();

  const breadcrumbs = [
    { label: 'Contabilidade', href: '/contabilidade' },
    { label: 'Exercícios', href: '/contabilidade/exercicios' },
    { label: `Exercício ${exercicio.codigo}` },
    { label: 'Reabrir' },
  ];

  if (!acesso.podeReabrir) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader title="Reabrir exercício" breadcrumbs={breadcrumbs} />
        <SemPermissao mensagem="Não tem permissão para reabrir exercícios contabilísticos." />
      </div>
    );
  }

  if (exercicio.estado !== 'ENCERRADO_PROVISORIO') {
    return (
      <div className="p-6 space-y-6">
        <PageHeader title="Reabrir exercício" breadcrumbs={breadcrumbs} />
        <div className="max-w-2xl rounded-lg border bg-muted/20 p-5">
          <p className="font-medium">O exercício {exercicio.codigo} não está encerrado provisoriamente</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Só é possível reabrir um exercício encerrado provisoriamente. O exercício {exercicio.codigo} está{' '}
            {ROTULO_ESTADO_EXERCICIO[exercicio.estado]}.
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
        title="Reabrir exercício"
        description={`Anular o encerramento provisório do exercício ${exercicio.codigo}`}
        breadcrumbs={breadcrumbs}
      />
      <ReabrirExercicioForm exercicioId={exercicio.id} codigo={exercicio.codigo} />
    </div>
  );
}
