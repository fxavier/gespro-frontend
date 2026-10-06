import 'server-only';
import type { ContaNaturezaNotaDebito, NaturezaNotaDebito, Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { NATUREZAS_NOTA_DEBITO, classeAdmitidaParaNatureza } from '@/lib/nota-debito';
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

export interface LinhaContaNaturezaNotaDebito {
  natureza: NaturezaNotaDebito;
  contaId: string | null;
  codigo: string | null;
  nome: string | null;
}

/**
 * Uma linha por natureza, pela ordem de `NATUREZAS_NOTA_DEBITO`, com a conta
 * por omissão (ou nulos quando a conta se escolhe em cada nota de débito).
 */
export async function listarContasNaturezaNotaDebito(ctx: Ctx): Promise<LinhaContaNaturezaNotaDebito[]> {
  const linhas = await prisma.contaNaturezaNotaDebito.findMany({
    where: { tenantId: ctx.tenantId },
    select: { natureza: true, contaId: true },
  });
  const contas = linhas.length
    ? await prisma.contaPGC.findMany({
        where: { tenantId: ctx.tenantId, id: { in: linhas.map((l) => l.contaId) } },
        select: { id: true, codigo: true, nome: true },
      })
    : [];
  const contaPorId = new Map(contas.map((c) => [c.id, c]));
  const contaPorNatureza = new Map(linhas.map((l) => [l.natureza, contaPorId.get(l.contaId)]));

  return NATUREZAS_NOTA_DEBITO.map((natureza) => {
    const conta = contaPorNatureza.get(natureza);
    return { natureza, contaId: conta?.id ?? null, codigo: conta?.codigo ?? null, nome: conta?.nome ?? null };
  });
}

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

  const conta = await validarContaParaNatureza(prisma, input.contaId, input.natureza, ctx);

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

/**
 * A conta serve de crédito a uma natureza: do tenant (senão NotFoundError),
 * activa, de movimento e da classe que a natureza admite (senão
 * CONTA_NATUREZA_INVALIDA). Regra única da configuração e da emissão.
 */
export async function validarContaParaNatureza(
  client: Prisma.TransactionClient | typeof prisma,
  contaId: string,
  natureza: NaturezaNotaDebito,
  ctx: Ctx,
): Promise<{ id: string; codigo: string }> {
  const conta = await client.contaPGC.findFirst({
    where: { id: contaId, tenantId: ctx.tenantId },
    select: { id: true, codigo: true, classe: true, aceitaLancamento: true, ativo: true },
  });
  if (!conta) throw new NotFoundError('Conta PGC não encontrada');

  const classe = classeAdmitidaParaNatureza(natureza);
  if (!conta.ativo || !conta.aceitaLancamento || conta.classe !== classe) {
    throw new BusinessRuleError(
      'CONTA_NATUREZA_INVALIDA',
      `A conta ${conta.codigo} não serve para ${natureza}: tem de ser uma conta de movimento activa da ` +
        `classe ${classe.replace('CLASSE_', '')}.`,
    );
  }
  return { id: conta.id, codigo: conta.codigo };
}
