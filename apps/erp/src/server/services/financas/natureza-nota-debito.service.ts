import 'server-only';
import type { ContaNaturezaNotaDebito, NaturezaNotaDebito, Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { classeAdmitidaParaNatureza } from '@/lib/nota-debito';
import type { Ctx } from '../types';

// ---------------------------------------------------------------------------
// Conta de crédito por natureza de nota de débito (ADR-0039 §1).
//
// Estado lido por um predicado de decisão (a conta que o lançamento da ND
// credita), por isso tem escritor em produção: o provisionamento semeia a
// omissão (`bootstrapContasNaturezaNotaDebito`) e `definirContaNaturezaNotaDebito`
// muda-a. Quem a lê é `resolverContaNaturezaNotaDebito`, que o nó
// contabilizacao liga a `construirLancamentoNotaDebito`.
// ---------------------------------------------------------------------------

/**
 * Define (ou, com `contaId: null`, retira) a conta por omissão de uma natureza.
 * A conta tem de ser do tenant, activa, folha e da classe que a natureza admite.
 */
export async function definirContaNaturezaNotaDebito(
  input: { natureza: NaturezaNotaDebito; contaId: string | null },
  ctx: Ctx,
): Promise<ContaNaturezaNotaDebito | null> {
  // Escritas SINGULARES (create/update/delete) de propósito: a audit-extension
  // não intercepta upsert nem deleteMany, e esta mudança tem de ficar no trilho.
  const actual = await prisma.contaNaturezaNotaDebito.findFirst({
    where: { tenantId: ctx.tenantId, natureza: input.natureza },
    select: { id: true },
  });

  if (input.contaId === null) {
    // Retirar uma omissão que não existe não é erro.
    if (actual) await prisma.contaNaturezaNotaDebito.delete({ where: { id: actual.id } });
    return null;
  }

  const conta = await prisma.contaPGC.findFirst({
    where: { id: input.contaId, tenantId: ctx.tenantId },
    select: { id: true, codigo: true, classe: true, aceitaLancamento: true, ativo: true },
  });
  if (!conta) throw new NotFoundError('Conta PGC não encontrada');

  const classe = classeAdmitidaParaNatureza(input.natureza);
  if (!conta.ativo || !conta.aceitaLancamento || conta.classe !== classe) {
    throw new BusinessRuleError(
      'CONTA_NATUREZA_INVALIDA',
      `A conta ${conta.codigo} não serve para ${input.natureza}: tem de ser uma conta de movimento activa da ` +
        `classe ${classe.replace('CLASSE_', '')}.`,
    );
  }

  // ponytail: dois pedidos concorrentes à mesma natureza sem linha → o segundo
  // create colide no @@unique e falha; é uma acção de configuração rara.
  return actual
    ? prisma.contaNaturezaNotaDebito.update({ where: { id: actual.id }, data: { contaId: conta.id } })
    : prisma.contaNaturezaNotaDebito.create({
        data: { tenantId: ctx.tenantId, natureza: input.natureza, contaId: conta.id },
      });
}

/**
 * A conta que a natureza credita por omissão, ou `null` se tem de ser escolhida
 * no acto. Aceita o cliente de uma transacção para ler dentro da emissão.
 */
export async function resolverContaNaturezaNotaDebito(
  client: Prisma.TransactionClient | typeof prisma,
  natureza: NaturezaNotaDebito,
  ctx: Ctx,
): Promise<{ id: string; codigo: string } | null> {
  const linha = await client.contaNaturezaNotaDebito.findFirst({
    where: { tenantId: ctx.tenantId, natureza },
    select: { contaId: true },
  });
  if (!linha) return null;
  return client.contaPGC.findFirst({
    where: { id: linha.contaId, tenantId: ctx.tenantId },
    select: { id: true, codigo: true },
  });
}
