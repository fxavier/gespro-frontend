/**
 * Marcar apuramento como declarado à AT — rota dedicada.
 *
 * Redireciona para a página de detalhe que contém o AlertDialog de confirmação.
 * A acção irreversível de declarar é tratada pelo AlertDialog no detalhe
 * (única excepção permitida — confirmação destrutiva, ui-conventions §1).
 *
 * Esta rota existe como âncora navegável mas serve principalmente como fallback.
 * NUNCA 'use client'.
 */

import { redirect } from 'next/navigation';

export default async function DeclaracaoPage({
  params,
}: {
  params: Promise<{ periodoId: string }>;
}) {
  const { periodoId } = await params;
  // Redireciona para o detalhe onde o AlertDialog de declaração está disponível
  redirect(`/contabilidade/iva/${periodoId}`);
}
