/**
 * Bootstrap de dados de fundação de um tenant — spec 19.
 *
 * Extraído das funções de seed (`prisma/seed/{financas,rbac}.ts`) para ser
 * chamável **por tenant e dentro de uma transacção**, não só pelo script de
 * seed. `prisma/seed/financas.ts` delega aqui — uma única definição do plano de
 * contas PGC-NIRF, dos diários e das séries de documento.
 *
 * NÃO tem `import 'server-only'` de propósito: além do provisionamento
 * (Route Handler), corre no script de seed (`tsx prisma/seed/index.ts`), fora do
 * contexto react-server.
 *
 * Todas as escritas recebem `tenantId` **explícito** — o cliente passado é um
 * `Prisma.TransactionClient` cru (sem a extensão de tenant), porque o tenant
 * está a ser criado neste exacto momento e não há `runWithTenantContext`.
 */
import type { Prisma } from '@prisma/client';
import planoContasJson from '../../../prisma/seed/data/plano-contas-pgc.json';
import { PERMISSIONS, SYSTEM_ROLES } from '../../../prisma/seed/rbac';

/** Cliente aceite: `Prisma.TransactionClient` ou um `PrismaClient` completo. */
export type BootstrapClient = Prisma.TransactionClient;

interface ContaJSON {
  codigo: string;
  codigoOriginal: string;
  nome: string;
  classe: number;
  nivel: number;
  contaPaiCodigo: string | null;
  aceitaLancamento: boolean;
  natureza: string;
}

function novoId(): string {
  return globalThis.crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Plano de contas PGC-NIRF (Decreto 70/2009)
// ---------------------------------------------------------------------------

export function classeEnum(n: number): string {
  return `CLASSE_${n}`;
}

export function derivarTipoConta(classe: number, natureza: string): string {
  if (classe === 5) return 'CAPITAL_PROPRIO';
  if (classe === 6) return 'GASTO';
  if (classe === 7) return 'RENDIMENTO';
  if (classe === 8) return 'RESULTADO';
  // Classes 1–4: a natureza determina o tipo.
  return natureza === 'DEVEDORA' ? 'ATIVO' : 'PASSIVO';
}

/**
 * Cria o plano de contas PGC-NIRF completo do tenant.
 *
 * Insere por nível (1→4) com `createMany`: garante que o pai já existe quando o
 * filho referencia `contaPaiId` (FK auto-referencial, verificada por linha em
 * Postgres) e mantém a transacção curta — 4 statements em vez de 504 INSERTs.
 */
export async function bootstrapPlanoContas(
  tx: BootstrapClient,
  tenantId: string,
): Promise<number> {
  // O ficheiro-fonte tem entradas repetidas (5611 e 5612 aparecem duas vezes).
  // `@@unique([tenantId, codigo])` rejeitaria a segunda — deduplicar aqui, e não
  // depender de `skipDuplicates`, deixa o comportamento explícito.
  const contas: ContaJSON[] = [];
  const vistos = new Set<string>();
  for (const c of planoContasJson as ContaJSON[]) {
    if (vistos.has(c.codigo)) continue;
    vistos.add(c.codigo);
    contas.push(c);
  }

  const idPorCodigo = new Map<string, string>();
  for (const c of contas) idPorCodigo.set(c.codigo, novoId());

  const niveis = [...new Set(contas.map((c) => c.nivel))].sort((a, b) => a - b);
  let total = 0;

  for (const nivel of niveis) {
    const lote = contas
      .filter((c) => c.nivel === nivel)
      .map((c) => ({
        id: idPorCodigo.get(c.codigo)!,
        tenantId,
        codigo: c.codigo,
        nome: c.nome,
        classe: classeEnum(c.classe) as never,
        tipo: derivarTipoConta(c.classe, c.natureza) as never,
        natureza: c.natureza as never,
        nivel: c.nivel,
        contaPaiId: c.contaPaiCodigo ? (idPorCodigo.get(c.contaPaiCodigo) ?? null) : null,
        aceitaLancamento: c.aceitaLancamento,
        ativo: true,
      }));

    if (lote.length === 0) continue;
    const r = await tx.contaPGC.createMany({ data: lote, skipDuplicates: true });
    total += r.count;
  }

  return total;
}

// ---------------------------------------------------------------------------
// Diários contabilísticos
// ---------------------------------------------------------------------------

export const DIARIOS_INICIAIS = [
  { codigo: 'VD', nome: 'Diário de Vendas', tipo: 'VENDAS' },
  { codigo: 'CP', nome: 'Diário de Compras', tipo: 'COMPRAS' },
  { codigo: 'CX', nome: 'Diário de Caixa', tipo: 'CAIXA' },
  { codigo: 'BN', nome: 'Diário de Banco', tipo: 'BANCO' },
  { codigo: 'OP', nome: 'Diário de Operações', tipo: 'OPERACOES' },
  { codigo: 'SL', nome: 'Diário de Salários', tipo: 'SALARIOS' },
  { codigo: 'AB', nome: 'Diário de Abertura', tipo: 'ABERTURA' },
  { codigo: 'EN', nome: 'Diário de Encerramento', tipo: 'ENCERRAMENTO' },
  { codigo: 'OT', nome: 'Diário Outros', tipo: 'OUTROS' },
] as const;

export async function bootstrapDiarios(
  tx: BootstrapClient,
  tenantId: string,
): Promise<number> {
  const r = await tx.diario.createMany({
    data: DIARIOS_INICIAIS.map((d) => ({
      tenantId,
      codigo: d.codigo,
      nome: d.nome,
      tipo: d.tipo as never,
    })),
    skipDuplicates: true,
  });
  return r.count;
}

// ---------------------------------------------------------------------------
// Séries de documento (numeração fiscal) — uma por tipo, para o ano corrente
// ---------------------------------------------------------------------------

export const SERIES_INICIAIS: Array<{ tipo: string; prefixo: string }> = [
  { tipo: 'FATURA', prefixo: 'FAT' },
  { tipo: 'NOTA_CREDITO', prefixo: 'NC' },
  { tipo: 'NOTA_DEBITO', prefixo: 'ND' },
  { tipo: 'PROFORMA', prefixo: 'PRO' },
  { tipo: 'COTACAO_COMERCIAL', prefixo: 'COT' },
  { tipo: 'RECIBO', prefixo: 'REC' },
  { tipo: 'VENDA', prefixo: 'VND' },
  { tipo: 'SESSAO_CAIXA', prefixo: 'CXS' },
  { tipo: 'REQUISICAO_COMPRA', prefixo: 'REQ' },
  { tipo: 'COTACAO_RFQ', prefixo: 'RFQ' },
  { tipo: 'PEDIDO_COMPRA', prefixo: 'PC' },
  { tipo: 'CONTA_PAGAR', prefixo: 'CP' },
  { tipo: 'PAGAMENTO', prefixo: 'PAG' },
  { tipo: 'RECEBIMENTO', prefixo: 'RCB' },
  { tipo: 'ORDEM_PRODUCAO', prefixo: 'OP' },
  { tipo: 'ATIVIDADE', prefixo: 'ATI' },
  { tipo: 'TICKET', prefixo: 'TKT' },
  { tipo: 'ENTREGA', prefixo: 'ENT' },
];

export async function bootstrapSeriesDocumento(
  tx: BootstrapClient,
  tenantId: string,
  ano: number = new Date().getFullYear(),
): Promise<number> {
  const r = await tx.serieDocumento.createMany({
    data: SERIES_INICIAIS.map((s) => ({
      tenantId,
      tipo: s.tipo as never,
      prefixo: s.prefixo,
      ano,
      formatoNumero: '{prefixo}/{ano}/{numero:06}',
      ativo: true,
      proximoNumero: 1,
    })),
    skipDuplicates: true,
  });
  return r.count;
}

// ---------------------------------------------------------------------------
// RBAC — catálogo global de permissões + roles de sistema do tenant
// ---------------------------------------------------------------------------

export interface RoleCriado {
  id: string;
  nome: string;
}

/**
 * Garante o catálogo **global** de permissões. Idempotente.
 *
 * Tem de correr FORA da transacção de provisionamento: `Permission.code` é
 * único e global, por isso dois registos concorrentes escrevendo as mesmas ~400
 * linhas dentro das suas transacções bloqueiam-se no mesmo índice — e podem
 * chegar a deadlock. Num endpoint público isso é um vector de indisponibilidade
 * trivial de accionar. Fora da transacção, o `skipDuplicates` resolve a corrida
 * sem locks longos.
 */
export async function garantirCatalogoPermissoes(client: BootstrapClient): Promise<void> {
  await client.permission.createMany({ data: PERMISSIONS, skipDuplicates: true });
}

/**
 * Cria os roles de sistema do tenant e liga-lhes as permissões do catálogo.
 * Idempotente (`upsert` + `skipDuplicates`).
 * Devolve os roles criados/existentes, para atribuição ao utilizador admin.
 *
 * **Pré-requisito**: `garantirCatalogoPermissoes()` já correu (fora da tx).
 * Aqui só se LÊ o catálogo — escrever-lhe dentro da tx é que causava o problema.
 */
export async function bootstrapRbac(
  tx: BootstrapClient,
  tenantId: string,
): Promise<RoleCriado[]> {
  const todas = await tx.permission.findMany({ select: { id: true, code: true } });
  const idPorCode = new Map(todas.map((p) => [p.code, p.id]));

  const roles: RoleCriado[] = [];
  for (const sr of SYSTEM_ROLES) {
    const role = await tx.role.upsert({
      where: { tenantId_nome: { tenantId, nome: sr.nome } },
      update: { descricao: sr.descricao, isSystem: true },
      create: { tenantId, nome: sr.nome, descricao: sr.descricao, isSystem: true },
      select: { id: true, nome: true },
    });

    const links = sr.permissionCodes
      .map((code) => idPorCode.get(code))
      .filter((id): id is string => Boolean(id))
      .map((permissionId) => ({ roleId: role.id, permissionId }));

    if (links.length > 0) {
      await tx.rolePermission.createMany({ data: links, skipDuplicates: true });
    }
    roles.push(role);
  }

  return roles;
}

// ---------------------------------------------------------------------------
// Bootstrap completo de contabilidade (PGC + diários + séries)
// ---------------------------------------------------------------------------

export async function bootstrapContabilidade(
  tx: BootstrapClient,
  tenantId: string,
): Promise<{ contas: number; diarios: number; series: number }> {
  const contas = await bootstrapPlanoContas(tx, tenantId);
  const diarios = await bootstrapDiarios(tx, tenantId);
  const series = await bootstrapSeriesDocumento(tx, tenantId);
  return { contas, diarios, series };
}
