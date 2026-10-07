/**
 * Aplicar o resultado do exercício (ADR-0035 §5, #364) — rota dedicada, sem modal.
 *
 * O saldo de 88 no exercício seguinte passa para 59 — Resultados transitados, com a data da
 * deliberação e a referência da acta. Só aparece o formulário quando o exercício está encerrado,
 * o seguinte já tem abertura e não há aplicação activa; nos outros casos, uma mensagem. Sem
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
import { diaIsoMaputo, formatarData, formatarDiaIso } from '@/lib/format-date';
import { formatMZN } from '@/lib/format-currency';
import { acessoExercicios, obterExercicioDoTenant } from '../../_lib/acesso';
import { SemPermissao } from '@/components/patterns/sem-permissao';
import { AplicarResultadoForm } from './_components/aplicar-resultado-form';

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="max-w-2xl rounded-lg border bg-muted/20 p-5">
      <p className="font-medium">{titulo}</p>
      <p className="mt-1 text-sm text-muted-foreground">{texto}</p>
      <div className="mt-3">
        <Button asChild size="sm" variant="outline">
          <Link href="/contabilidade/exercicios">Voltar a Exercícios</Link>
        </Button>
      </div>
    </div>
  );
}

export default async function AplicarResultadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acesso = await acessoExercicios();

  const exercicio = await obterExercicioDoTenant(id, acesso.ctx);
  if (!exercicio) notFound();

  const titulo = 'Aplicar resultado';
  const breadcrumbs = [
    { label: 'Contabilidade', href: '/contabilidade' },
    { label: 'Exercícios', href: '/contabilidade/exercicios' },
    { label: `Exercício ${exercicio.codigo}` },
    { label: 'Aplicar resultado' },
  ];

  if (!acesso.podeAplicarResultado) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader title={titulo} breadcrumbs={breadcrumbs} />
        <SemPermissao mensagem="Não tem permissão para aplicar o resultado do exercício." />
      </div>
    );
  }

  const situacao = await runWithTenantContext(acesso.ctx, () =>
    aplicacaoResultadoService.obterSituacaoAplicacaoResultado(exercicio.id, acesso.ctx),
  );
  if (!situacao) notFound();

  let aviso: { titulo: string; texto: string } | null = null;
  if (exercicio.estado === 'ABERTO') {
    aviso = {
      titulo: `O exercício ${exercicio.codigo} não está encerrado`,
      texto: 'O resultado só se aplica depois de o exercício estar encerrado (pelo menos provisoriamente).',
    };
  } else if (situacao.activa) {
    aviso = {
      titulo: `O resultado do exercício ${exercicio.codigo} já foi aplicado`,
      texto: `Aplicado em ${formatarData(situacao.activa.dataDeliberacao)} (acta ${situacao.activa.referenciaActa}). Para o registar de novo, anule primeiro a aplicação.`,
    };
  } else if (!situacao.seguinte) {
    aviso = {
      titulo: 'O exercício seguinte ainda não existe',
      texto: `A aplicação é um lançamento do exercício seguinte a ${exercicio.codigo}. Abra-o primeiro — a abertura dele é gerada a partir deste.`,
    };
  } else if (!situacao.disponivel) {
    aviso = {
      titulo: `O exercício ${situacao.seguinte.codigo} ainda não tem o lançamento de abertura`,
      texto: `Encerre de novo o exercício ${exercicio.codigo} para gerar a abertura de ${situacao.seguinte.codigo}; só depois se aplica o resultado.`,
    };
  } else if (situacao.saldo88.isZero()) {
    aviso = {
      titulo: 'Não há resultado a aplicar',
      texto: `A conta 88 não tem saldo no exercício ${situacao.seguinte.codigo}: o resultado do exercício ${exercicio.codigo} foi zero.`,
    };
  }

  if (aviso || !situacao.seguinte) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader title={titulo} breadcrumbs={breadcrumbs} />
        {aviso && <Aviso titulo={aviso.titulo} texto={aviso.texto} />}
      </div>
    );
  }

  const seguinte = situacao.seguinte;
  const hoje = diaIsoMaputo();
  const inicio = formatarDiaIso(seguinte.dataInicio);
  const fim = formatarDiaIso(seguinte.dataFim);
  const lucro = situacao.saldo88.lessThan(0);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={titulo}
        description={`Transportar o resultado do exercício ${exercicio.codigo} de 88 para 59 — Resultados transitados, no exercício ${seguinte.codigo}`}
        breadcrumbs={breadcrumbs}
      />
      <AplicarResultadoForm
        exercicioId={exercicio.id}
        codigo={exercicio.codigo}
        codigoSeguinte={seguinte.codigo}
        valor={formatMZN(situacao.saldo88.abs().toString())}
        lucro={lucro}
        dataMinima={inicio}
        dataMaxima={fim}
        dataInicial={hoje >= inicio && hoje <= fim ? hoje : ''}
      />
    </div>
  );
}
