import 'server-only';
import { prisma } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type { EditarRegraSugestaoInput, RegraSugestaoInput } from '@/lib/validations/reconciliacao';
import type { Ctx } from '../types';

// ---------------------------------------------------------------------------
// Regras de sugestão de lançamento (ADR-0038 RF §9, issue #140). O motor já as
// lê (`escolherRegra`, em `fecho.ts`); isto é só a gestão pelo utilizador.
//
// - `tenantId` explícito em todas as leituras e escritas: `findUnique`/`update`
//   não são scoped pela extensão (CLAUDE.md, «Multi-tenancy»);
// - escritas singulares (`create`/`update`) pelo cliente estendido, para que a
//   audit-extension as registe (`RegraSugestaoLancamento` está em AUDIT_MODELS);
// - não há eliminar: desactiva-se (decisão da #140, como as séries da #149).
// ---------------------------------------------------------------------------

export interface RegraSugestao {
  id: string;
  tenantId: string;
  contaBancariaId: string | null;
  padrao: string;
  natureza: 'DEBITO' | 'CREDITO';
  contaContrapartidaId: string;
  descricao: string | null;
  prioridade: number;
  ativo: boolean;
}

export interface RegraSugestaoDetalhada extends RegraSugestao {
  /** `null` = a regra vale para todas as contas bancárias. */
  contaBancaria: { id: string; banco: string; numeroConta: string } | null;
  contaContrapartida: { id: string; codigo: string; nome: string } | null;
}

export async function listarRegrasSugestao(ctx: Ctx): Promise<RegraSugestaoDetalhada[]> {
  const regras = (await prisma.regraSugestaoLancamento.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: [{ ativo: 'desc' }, { prioridade: 'asc' }],
  })) as RegraSugestao[];
  if (regras.length === 0) return [];

  // FK escalares (sem @relation): resolvem-se por consulta, sempre no tenant.
  const idsBancarias = [...new Set(regras.map((r) => r.contaBancariaId).filter((id): id is string => id !== null))];
  const idsContrapartida = [...new Set(regras.map((r) => r.contaContrapartidaId))];
  const [bancarias, contrapartidas] = await Promise.all([
    idsBancarias.length === 0
      ? []
      : prisma.contaBancaria.findMany({
          where: { tenantId: ctx.tenantId, id: { in: idsBancarias } },
          select: { id: true, banco: true, numeroConta: true },
        }),
    prisma.contaPGC.findMany({
      where: { tenantId: ctx.tenantId, id: { in: idsContrapartida } },
      select: { id: true, codigo: true, nome: true },
    }),
  ]);
  const bancariaPorId = new Map(bancarias.map((c) => [c.id, c]));
  const contrapartidaPorId = new Map(contrapartidas.map((c) => [c.id, c]));

  return regras.map((r) => ({
    ...r,
    contaBancaria: r.contaBancariaId ? (bancariaPorId.get(r.contaBancariaId) ?? null) : null,
    contaContrapartida: contrapartidaPorId.get(r.contaContrapartidaId) ?? null,
  }));
}

export async function obterRegraSugestao(id: string, ctx: Ctx): Promise<RegraSugestao | null> {
  return (await prisma.regraSugestaoLancamento.findFirst({
    where: { id, tenantId: ctx.tenantId },
  })) as RegraSugestao | null;
}

async function regraDoTenant(id: string, ctx: Ctx): Promise<RegraSugestao> {
  const regra = await obterRegraSugestao(id, ctx);
  if (!regra) throw new NotFoundError('Regra de sugestão não encontrada');
  return regra;
}

/**
 * A contrapartida tem de ser uma conta PGC do tenant, folha e activa, e não pode
 * ser a conta de nenhuma conta bancária do tenant (nem das inactivas): sugerir
 * um lançamento banco↔banco para uma comissão seria um lançamento sem efeito.
 */
async function validarReferencias(
  input: Pick<RegraSugestaoInput, 'contaBancariaId' | 'contaContrapartidaId'>,
  ctx: Ctx,
): Promise<void> {
  if (input.contaBancariaId !== null) {
    const conta = await prisma.contaBancaria.findFirst({
      where: { id: input.contaBancariaId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!conta) throw new NotFoundError('Conta bancária não encontrada');
  }

  const contrapartida = await prisma.contaPGC.findFirst({
    where: { id: input.contaContrapartidaId, tenantId: ctx.tenantId },
    select: { id: true, aceitaLancamento: true, ativo: true },
  });
  if (!contrapartida || !contrapartida.aceitaLancamento || !contrapartida.ativo) {
    throw new BusinessRuleError(
      'CONTRAPARTIDA_INVALIDA',
      'A conta de contrapartida tem de ser uma conta PGC activa que aceite lançamentos',
    );
  }

  const deBanco = await prisma.contaBancaria.findFirst({
    where: { tenantId: ctx.tenantId, contaContabilId: input.contaContrapartidaId },
    select: { id: true },
  });
  if (deBanco) {
    throw new BusinessRuleError(
      'CONTRAPARTIDA_E_CONTA_BANCO',
      'A conta de contrapartida não pode ser a conta contabilística de uma conta bancária',
    );
  }
}

function dadosDaRegra(input: RegraSugestaoInput) {
  return {
    contaBancariaId: input.contaBancariaId,
    padrao: input.padrao,
    natureza: input.natureza,
    contaContrapartidaId: input.contaContrapartidaId,
    descricao: input.descricao?.length ? input.descricao : null,
    prioridade: input.prioridade,
  };
}

export async function criarRegraSugestao(input: RegraSugestaoInput, ctx: Ctx): Promise<RegraSugestao> {
  await validarReferencias(input, ctx);
  return (await prisma.regraSugestaoLancamento.create({
    data: { tenantId: ctx.tenantId, ...dadosDaRegra(input) },
  })) as RegraSugestao;
}

export async function editarRegraSugestao(input: EditarRegraSugestaoInput, ctx: Ctx): Promise<RegraSugestao> {
  const { id, ...resto } = input;
  await regraDoTenant(id, ctx);
  await validarReferencias(resto, ctx);
  return (await prisma.regraSugestaoLancamento.update({
    where: { id, tenantId: ctx.tenantId },
    data: dadosDaRegra(resto),
  })) as RegraSugestao;
}

async function definirAtivo(id: string, ativo: boolean, ctx: Ctx): Promise<RegraSugestao> {
  const regra = await regraDoTenant(id, ctx);
  // Já no estado pedido: nada a escrever (nem linha de auditoria vazia).
  if (regra.ativo === ativo) return regra;
  return (await prisma.regraSugestaoLancamento.update({
    where: { id, tenantId: ctx.tenantId },
    data: { ativo },
  })) as RegraSugestao;
}

export async function activarRegraSugestao(id: string, ctx: Ctx): Promise<RegraSugestao> {
  return definirAtivo(id, true, ctx);
}

export async function desactivarRegraSugestao(id: string, ctx: Ctx): Promise<RegraSugestao> {
  return definirAtivo(id, false, ctx);
}
