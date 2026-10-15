import 'server-only';
import { Prisma, type Plano } from '@prisma/client';
import { prismaBase } from '@/server/db/client';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/lib/errors';
import { RE_CODIGO_PLANO } from '@/lib/validations/common';
import { PlanoCamposSchema, type PlanoCampos } from '@/lib/validations/planos';
import { getRequestContext } from '@/server/observability/context';

/**
 * Escrita do catálogo de planos pelo administrador de plataforma (ADR-0049 §1–§5, #526).
 *
 * O `Plano` é GLOBAL: corre em `prismaBase`, sem contexto de tenant. Cada escrita grava, na
 * MESMA transacção, uma linha no trilho global `AuditoriaPlataforma` (fora do `AUDIT_MODELS`,
 * que é o trilho do tenant) — uma escrita recusada, inclusive pela base, não deixa linha.
 */

export interface PlataformaCtx {
  /** `sub` do Keycloak de quem agiu (o `id` da sessão só-plataforma). */
  keycloakSub: string;
  /** Se ausente, lê-se do contexto de pedido (`runWithRequestContext`). */
  requestId?: string;
}

export type AcaoAuditoriaPlataforma = 'CRIAR' | 'ACTUALIZAR' | 'ARQUIVAR' | 'DESARQUIVAR' | 'APAGAR';

export type PlanoAdmin = Plano & { assinaturas: number };

type Tx = Prisma.TransactionClient;

// ─── validação ────────────────────────────────────────────────────────────────

function exigirCodigoValido(codigo: unknown): string {
  if (typeof codigo !== 'string' || !RE_CODIGO_PLANO.test(codigo)) {
    throw new BusinessRuleError(
      'PLANO_CODIGO_INVALIDO',
      'Código de plano inválido: use maiúsculas, algarismos e _, começando por uma letra (2 a 31 caracteres).',
    );
  }
  return codigo;
}

function validarCampos(input: unknown): PlanoCampos {
  const r = PlanoCamposSchema.safeParse(input);
  if (!r.success) throw new ValidationError('Dados do plano inválidos', r.error.flatten());
  return r.data;
}

function dadosDe(c: PlanoCampos) {
  return {
    nome: c.nome,
    descricao: c.descricao,
    precoMensalUsd: new Prisma.Decimal(c.precoMensalUsd),
    precoAnualUsd: new Prisma.Decimal(c.precoAnualUsd),
    stripePriceIdMensal: c.stripePriceIdMensal,
    stripePriceIdAnual: c.stripePriceIdAnual,
    limiteUtilizadores: c.limiteUtilizadores,
    limiteArmazens: c.limiteArmazens,
    suporte: c.suporte,
    funcionalidades: c.funcionalidades,
    ordem: c.ordem,
    destaque: c.destaque,
  };
}

function erroPriceDuplicado(): BusinessRuleError {
  return new BusinessRuleError(
    'PRICE_ID_DUPLICADO',
    'Este Price ID do Stripe já está noutro plano ou ciclo: cada Price pertence a um só plano e a um só ciclo.',
  );
}

function erroCodigoDuplicado(codigo: string): BusinessRuleError {
  return new BusinessRuleError('PLANO_CODIGO_DUPLICADO', `Já existe um plano com o código «${codigo}».`);
}

/**
 * Um Price pertence a um plano e a um ciclo (ADR-0049 §4): recusa o mesmo Price nas duas
 * colunas do plano e em qualquer coluna de outro plano. O `@unique` por coluna fica de rede.
 */
async function exigirPricesLivres(tx: Tx, c: PlanoCampos, idProprio?: string): Promise<void> {
  const prices = [c.stripePriceIdMensal, c.stripePriceIdAnual].filter((p): p is string => !!p);
  if (prices.length === 0) return;
  if (prices.length === 2 && prices[0] === prices[1]) throw erroPriceDuplicado();
  const outro = await tx.plano.findFirst({
    where: {
      ...(idProprio ? { id: { not: idProprio } } : {}),
      OR: [{ stripePriceIdMensal: { in: prices } }, { stripePriceIdAnual: { in: prices } }],
    },
    select: { id: true },
  });
  if (outro) throw erroPriceDuplicado();
}

/** P2002 traduzido: o código ou um Price (corrida entre a verificação e a escrita). */
function traduzirUnicidade(e: unknown, codigo: string): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    const meta = JSON.stringify(e.meta ?? {});
    if (/stripePriceId/.test(meta)) throw erroPriceDuplicado();
    if (/\bcodigo\b/.test(meta)) throw erroCodigoDuplicado(codigo);
  }
  throw e;
}

// ─── trilho ───────────────────────────────────────────────────────────────────

/** Instantâneo JSON do plano para o trilho: Decimal → string, datas → ISO. */
function instantaneo(p: Plano): Prisma.InputJsonObject {
  return {
    id: p.id,
    codigo: p.codigo,
    nome: p.nome,
    descricao: p.descricao,
    precoMensalUsd: p.precoMensalUsd.toString(),
    precoAnualUsd: p.precoAnualUsd.toString(),
    stripePriceIdMensal: p.stripePriceIdMensal,
    stripePriceIdAnual: p.stripePriceIdAnual,
    limiteUtilizadores: p.limiteUtilizadores,
    limiteArmazens: p.limiteArmazens,
    suporte: p.suporte,
    funcionalidades: [...p.funcionalidades],
    ordem: p.ordem,
    destaque: p.destaque,
    arquivadoEm: p.arquivadoEm ? p.arquivadoEm.toISOString() : null,
  };
}

async function registarTrilho(
  tx: Tx,
  ctx: PlataformaCtx,
  acao: AcaoAuditoriaPlataforma,
  codigo: string,
  antes: Plano | null,
  depois: Plano | null,
): Promise<void> {
  if (!ctx?.keycloakSub) throw new Error('plano-admin: autor (keycloakSub) em falta');
  await tx.auditoriaPlataforma.create({
    data: {
      keycloakSub: ctx.keycloakSub,
      acao,
      entidade: 'Plano',
      codigo,
      ...(antes ? { antes: instantaneo(antes) } : {}),
      ...(depois ? { depois: instantaneo(depois) } : {}),
      requestId: ctx.requestId ?? getRequestContext()?.requestId ?? null,
    },
  });
}

// ─── leituras de apoio ──────────────────────────────────────────────────────────

async function exigirPlano(tx: Tx, id: string): Promise<Plano> {
  const plano = await tx.plano.findUnique({ where: { id } });
  if (!plano) throw new NotFoundError('Plano não encontrado');
  return plano;
}

/**
 * Recusa tirar do catálogo o último plano não arquivado. Tranca os activos (`FOR UPDATE`): dois
 * arquivamentos em paralelo não deixam o catálogo vazio.
 */
async function exigirNaoUltimoActivo(tx: Tx, plano: Plano, verbo: 'arquivar' | 'apagar'): Promise<void> {
  if (plano.arquivadoEm) return;
  const activos = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Plano" WHERE "arquivadoEm" IS NULL FOR UPDATE`;
  if (!activos.some((a) => a.id !== plano.id)) {
    throw new BusinessRuleError(
      'PLANO_ULTIMO_ACTIVO',
      `Não é possível ${verbo} o último plano activo: o catálogo ficaria vazio. Crie ou desarquive outro plano primeiro.`,
    );
  }
}

// ─── escrita ──────────────────────────────────────────────────────────────────

export async function criarPlano(input: unknown, ctx: PlataformaCtx): Promise<Plano> {
  const codigo = exigirCodigoValido((input as { codigo?: unknown } | null)?.codigo);
  const campos = validarCampos(input);
  try {
    return await prismaBase.$transaction(async (tx) => {
      if (await tx.plano.findUnique({ where: { codigo }, select: { id: true } })) {
        throw erroCodigoDuplicado(codigo);
      }
      await exigirPricesLivres(tx, campos);
      const plano = await tx.plano.create({ data: { codigo, ...dadosDe(campos) } });
      await registarTrilho(tx, ctx, 'CRIAR', codigo, null, plano);
      return plano;
    });
  } catch (e) {
    traduzirUnicidade(e, codigo);
  }
}

export async function actualizarPlano(id: string, input: unknown, ctx: PlataformaCtx): Promise<Plano> {
  const atual = await exigirPlano(prismaBase, id);
  const codigoPedido = (input as { codigo?: unknown } | null)?.codigo;
  if (codigoPedido !== undefined && codigoPedido !== null && codigoPedido !== atual.codigo) {
    throw new BusinessRuleError('PLANO_CODIGO_IMUTAVEL', 'O código de um plano não pode ser alterado depois de criado.');
  }
  const campos = validarCampos(input);
  try {
    return await prismaBase.$transaction(async (tx) => {
      const antes = await exigirPlano(tx, id);
      await exigirPricesLivres(tx, campos, id);
      const depois = await tx.plano.update({ where: { id }, data: dadosDe(campos) });
      await registarTrilho(tx, ctx, 'ACTUALIZAR', antes.codigo, antes, depois);
      return depois;
    });
  } catch (e) {
    traduzirUnicidade(e, atual.codigo);
  }
}

export async function arquivarPlano(id: string, ctx: PlataformaCtx): Promise<Plano> {
  return prismaBase.$transaction(async (tx) => {
    const antes = await exigirPlano(tx, id);
    if (antes.arquivadoEm) {
      throw new BusinessRuleError('PLANO_JA_ARQUIVADO', 'Este plano já está arquivado.');
    }
    await exigirNaoUltimoActivo(tx, antes, 'arquivar');
    const depois = await tx.plano.update({ where: { id }, data: { arquivadoEm: new Date() } });
    await registarTrilho(tx, ctx, 'ARQUIVAR', antes.codigo, antes, depois);
    return depois;
  });
}

export async function desarquivarPlano(id: string, ctx: PlataformaCtx): Promise<Plano> {
  return prismaBase.$transaction(async (tx) => {
    const antes = await exigirPlano(tx, id);
    if (!antes.arquivadoEm) {
      throw new BusinessRuleError('PLANO_NAO_ARQUIVADO', 'Este plano não está arquivado.');
    }
    const depois = await tx.plano.update({ where: { id }, data: { arquivadoEm: null } });
    await registarTrilho(tx, ctx, 'DESARQUIVAR', antes.codigo, antes, depois);
    return depois;
  });
}

/**
 * Apaga um plano. Quem decide se está em uso é a FK Restrict da `Assinatura` (P2003), não uma
 * contagem prévia que uma assinatura nova tornaria falsa; a contagem só serve a mensagem.
 */
export async function apagarPlano(id: string, ctx: PlataformaCtx): Promise<void> {
  let codigo: string | null = null;
  try {
    await prismaBase.$transaction(async (tx) => {
      const antes = await exigirPlano(tx, id);
      codigo = antes.codigo;
      await exigirNaoUltimoActivo(tx, antes, 'apagar');
      await registarTrilho(tx, ctx, 'APAGAR', antes.codigo, antes, null);
      await tx.plano.delete({ where: { id } });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003' && codigo) {
      const n = await prismaBase.assinatura.count({ where: { planoAssinatura: codigo } });
      throw new BusinessRuleError(
        'PLANO_EM_USO',
        `O plano ${codigo} tem ${n} ${n === 1 ? 'assinatura' : 'assinaturas'} e não pode ser apagado. ` +
          'Arquive-o: sai do catálogo e de checkouts novos, e quem já o tem mantém-no.',
        { assinaturas: n },
      );
    }
    throw e;
  }
}

// ─── leitura de administração ─────────────────────────────────────────────────

const ORDEM: Prisma.PlanoOrderByWithRelationInput[] = [{ ordem: 'asc' }, { codigo: 'asc' }];

/** Todos os planos (arquivados incluídos), por `ordem`, com o n.º de assinaturas de cada um. */
export async function listarPlanosAdmin(): Promise<PlanoAdmin[]> {
  const planos = await prismaBase.plano.findMany({
    orderBy: ORDEM,
    include: { _count: { select: { assinaturas: true } } },
  });
  return planos.map(({ _count, ...p }) => ({ ...p, assinaturas: _count.assinaturas }));
}

/** Um plano pelo id, com o n.º de assinaturas; `null` se não existe. */
export async function obterPlanoAdmin(id: string): Promise<PlanoAdmin | null> {
  const p = await prismaBase.plano.findUnique({
    where: { id },
    include: { _count: { select: { assinaturas: true } } },
  });
  if (!p) return null;
  const { _count, ...plano } = p;
  return { ...plano, assinaturas: _count.assinaturas };
}

export const planoAdminService = {
  criarPlano,
  actualizarPlano,
  arquivarPlano,
  desarquivarPlano,
  apagarPlano,
  listarPlanosAdmin,
  obterPlanoAdmin,
};
