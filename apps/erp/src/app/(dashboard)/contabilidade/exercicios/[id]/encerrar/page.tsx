/**
 * Encerrar exercício contabilístico (ADR-0035, #138) — rota dedicada, sem modal.
 *
 * Só um exercício ABERTO se encerra; nos outros estados mostra-se uma mensagem e nenhum
 * formulário. Sem `financas:exercicio:encerrar`, «Sem permissão».
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
import { EncerrarExercicioForm } from './_components/encerrar-exercicio-form';

export default async function EncerrarExercicioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acesso = await acessoExercicios();

  const exercicio = await obterExercicioDoTenant(id, acesso.ctx);
  if (!exercicio) notFound();

  const breadcrumbs = [
    { label: 'Contabilidade', href: '/contabilidade' },
    { label: 'Exercícios', href: '/contabilidade/exercicios' },
    { label: `Exercício ${exercicio.codigo}` },
    { label: 'Encerrar' },
  ];

  if (!acesso.podeEncerrar) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader title="Encerrar exercício" breadcrumbs={breadcrumbs} />
        <SemPermissao mensagem="Não tem permissão para encerrar exercícios contabilísticos." />
      </div>
    );
  }

  if (exercicio.estado !== 'ABERTO') {
    return (
      <div className="p-6 space-y-6">
        <PageHeader title="Encerrar exercício" breadcrumbs={breadcrumbs} />
        <div className="max-w-2xl rounded-lg border bg-muted/20 p-5">
          <p className="font-medium">O exercício {exercicio.codigo} não está aberto</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Só é possível encerrar um exercício aberto. O exercício {exercicio.codigo} está{' '}
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
        title="Encerrar exercício"
        description={`Apurar os resultados do exercício ${exercicio.codigo} no período 13 (encerramento provisório)`}
        breadcrumbs={breadcrumbs}
      />
      <EncerrarExercicioForm exercicioId={exercicio.id} codigo={exercicio.codigo} />
    </div>
  );
}
