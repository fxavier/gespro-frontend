/**
 * Bootstrap de dados de fundação de um tenant — spec 19.
 *
 * Extraído das funções de seed (`prisma/seed/{financas,rbac}.ts`) para ser
 * chamável **por tenant e dentro de uma transacção**, não só pelo script de
 * seed. `prisma/seed/financas.ts` delega aqui — uma única definição do plano de
 * contas PGC-NIRF, dos diários e das séries de documento.
 *
 * NÃO tem `import 'server-only'` de propósito: além do provisionamento
 * (Route Handler), corre nos scripts de seed. Esses correm SEMPRE com
 * `tsx -C react-server` (`pnpm db:seed`, `pnpm db:seed:volume`) — um `npx tsx`
 * sem a condição rebenta no import transitivo de `server-only` abaixo.
 *
 * Todas as escritas recebem `tenantId` **explícito** — o cliente passado é um
 * `Prisma.TransactionClient` cru (sem a extensão de tenant), porque o tenant
 * está a ser criado neste exacto momento e não há `runWithTenantContext`.
 */
import type { Prisma } from '@prisma/client';
import planoContasJson from '../../../prisma/seed/data/plano-contas-pgc.json';
import rubricasFluxoJson from '../../../prisma/seed/data/rubricas-fluxo-caixa.json';
import { PERMISSIONS, SYSTEM_ROLES } from '../../../prisma/seed/rbac';
import { CONTA_PADRAO_NATUREZA_ND, classeAdmitidaParaNatureza } from '../../lib/nota-debito';
// `mapeamento-versao.model.ts` importa `server-only`: fora do Next só resolve com
// `tsx -C react-server` (é assim que `db:seed` e `db:seed:volume` correm).
import { instantaneoDe } from '../services/financas/mapeamento-versao.model';

/** Cliente aceite: `Prisma.TransactionClient` ou um `PrismaClient` completo. */
export type BootstrapClient = Prisma.TransactionClient;

interface ContaJSON {
  codigo: string;
  codigoOriginal: string;
  nome: string;
  classe: number;
  nivel: number;
  contaMaeCodigo: string | null;
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
 * Insere por nível (1→4) com `createMany`: garante que a conta mãe já existe
 * quando a subconta referencia `contaMaeId` (FK auto-referencial, verificada
 * por linha em Postgres) e mantém a transacção curta — 4 statements em vez de
 * 504 INSERTs.
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
        contaMaeId: c.contaMaeCodigo ? (idPorCodigo.get(c.contaMaeCodigo) ?? null) : null,
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
  // Acrescentados depois da lista original: o enum `TipoSerieDocumento` foi
  // estendido pelas specs 05 e 10, esta lista não. Sem elas, `criar encomenda`,
  // `criar devolução` e `iniciar contagem de stock` falhavam em TODOS os
  // tenants com «série activa não encontrada» — a numeração é atribuída dentro
  // da transacção e não há como continuar sem ela.
  { tipo: 'CONTAGEM_STOCK', prefixo: 'CTG' },
  { tipo: 'ENCOMENDA', prefixo: 'ENC' },
  { tipo: 'NOTA_DEVOLUCAO', prefixo: 'NDV' },
];

/** Ano corrente no fuso Africa/Maputo (UTC+2, fixo). */
function anoEmMaputo(agora = new Date()): number {
  return parseInt(
    new Intl.DateTimeFormat('pt', { timeZone: 'Africa/Maputo', year: 'numeric' }).format(agora),
    10,
  );
}

/** Mês corrente (1-12) no fuso Africa/Maputo. */
function mesEmMaputo(agora = new Date()): number {
  return parseInt(
    new Intl.DateTimeFormat('pt', { timeZone: 'Africa/Maputo', month: 'numeric' }).format(agora),
    10,
  );
}

export async function bootstrapSeriesDocumento(
  tx: BootstrapClient,
  tenantId: string,
  ano: number = anoEmMaputo(),
): Promise<number> {
  const anos = [ano];
  // Em Dezembro cria já o ano seguinte para evitar que o cron de 1/12 seja o único caminho
  // ponytail: só criamos 2 anos se estivermos em Dezembro; YAGNI para outros cenários
  if (mesEmMaputo() === 12) anos.push(ano + 1);

  let total = 0;
  for (const a of anos) {
    const r = await tx.serieDocumento.createMany({
      data: SERIES_INICIAIS.map((s) => ({
        tenantId,
        tipo: s.tipo as never,
        prefixo: s.prefixo,
        ano: a,
        formatoNumero: '{prefixo}/{ano}/{numero:06}',
        ativo: true,
        proximoNumero: 1,
      })),
      skipDuplicates: true,
    });
    total += r.count;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Conta de crédito por natureza de nota de débito (ADR-0039 §1)
// ---------------------------------------------------------------------------

/**
 * Semeia a omissão natureza → conta PGC. Corre depois do plano de contas (lê as
 * contas pelo código). Idempotente: não substitui o que o tenant já escolheu.
 */
export async function bootstrapContasNaturezaNotaDebito(
  tx: BootstrapClient,
  tenantId: string,
): Promise<number> {
  const padrao = Object.entries(CONTA_PADRAO_NATUREZA_ND);
  const contas = await tx.contaPGC.findMany({
    where: { tenantId, codigo: { in: padrao.map(([, codigo]) => codigo) }, aceitaLancamento: true, ativo: true },
    select: { id: true, codigo: true, classe: true },
  });
  // Só a conta que o serviço também aceitaria: um plano que divirja do canónico
  // deixa a natureza sem omissão, em vez de lhe dar uma conta da classe errada.
  const valida = (natureza: string, codigo: string) =>
    contas.find((c) => c.codigo === codigo && c.classe === classeAdmitidaParaNatureza(natureza as never));
  const r = await tx.contaNaturezaNotaDebito.createMany({
    data: padrao
      .filter(([natureza, codigo]) => valida(natureza, codigo))
      .map(([natureza, codigo]) => ({ tenantId, natureza: natureza as never, contaId: valida(natureza, codigo)!.id })),
    skipDuplicates: true,
  });
  return r.count;
}

// ---------------------------------------------------------------------------
// Rubricas da DFC e mapeamento conta → rubrica (ADR-0037 §3 + emenda E1/E2)
// ---------------------------------------------------------------------------

interface RubricaJSON {
  codigo: string;
  designacao: string;
  atividade: string;
  sinal: string;
  ordem: number;
}

interface MapeamentoJSON {
  conta: string;
  rubrica: string;
}

/**
 * Semeia as rubricas `SISTEMA` da Demonstração de Fluxos de Caixa, o
 * mapeamento de cada conta folha do plano e a versão 1 (`PENDING`) do
 * mapeamento. Corre depois do plano de contas (lê as folhas pelo código).
 *
 * **Não é uma escrita do mapeamento** no sentido do V2: se o tenant já tiver
 * uma versão qualquer, devolve sem escrever nada (nem rubricas SISTEMA novas,
 * nem mapeamentos que o tenant desmapeou) — a versão n+1 é do serviço de
 * configuração, não do seed. Sem versão, é idempotente por construção
 * (`createMany` + `skipDuplicates` sobre os `@@unique` da migração 22b).
 * Precedente de forma: `bootstrapContasNaturezaNotaDebito`.
 *
 * Duas guardas deliberadas:
 *  - tenant **sem** plano de contas ⇒ lança, antes de escrever o que quer que
 *    seja. Gravar a versão 1 com zero mapeamentos e depois ser idempotente por
 *    «a versão 1 já existe» deixava o tenant sem mapeamento para sempre;
 *  - conta do JSON **ausente** do plano do tenant (plano parcial ou divergente)
 *    ⇒ fica sem linha, nunca uma conta inventada. A DFC dirá o resto como
 *    impedimento (I7).
 *
 * Os ids das rubricas são uuid atribuídos aqui (como no plano de contas):
 * `createMany` não devolve linhas, e na segunda corrida as rubricas
 * **releem-se** pelo código para obter os ids que os mapeamentos precisam.
 */
export async function semearRubricasFluxo(
  tx: BootstrapClient,
  tenantId: string,
): Promise<{ rubricas: number; mapeamentos: number; versaoCriada: boolean }> {
  const folhas = await tx.contaPGC.findMany({
    where: { tenantId, aceitaLancamento: true, ativo: true },
    select: { id: true, codigo: true },
  });
  if (folhas.length === 0) {
    throw new Error(
      `Tenant ${tenantId} sem plano de contas: semeia o plano (bootstrapPlanoContas) antes das rubricas da DFC.`,
    );
  }

  // Tenant que JÁ TEM versão: o mapeamento é dele (V1/V2 são do serviço de
  // configuração). Nada se escreve — nem rubricas SISTEMA novas do JSON, nem
  // mapeamentos que o tenant tenha desmapeado. Recriar qualquer deles sem
  // versão n+1 violaria o V2 e deixaria a última versão a divergir do vivo (V1).
  // Lida ANTES de qualquer escrita; a guarda do plano vem primeiro porque um
  // tenant sem plano é um defeito de ordem de bootstrap, seja qual for a versão.
  const jaVersionado = await tx.versaoMapeamentoFluxo.findFirst({ where: { tenantId }, select: { id: true } });
  if (jaVersionado) return { rubricas: 0, mapeamentos: 0, versaoCriada: false };

  const rubricasJson = rubricasFluxoJson.rubricas as RubricaJSON[];
  const criadas = await tx.rubricaFluxoCaixa.createMany({
    data: rubricasJson.map((r) => ({
      id: novoId(),
      tenantId,
      codigo: r.codigo,
      designacao: r.designacao,
      atividade: r.atividade as never,
      sinal: r.sinal as never,
      ordem: r.ordem,
      origem: 'SISTEMA' as never,
      ativo: true,
    })),
    skipDuplicates: true,
  });

  // Reler pelo código: na 2.ª corrida os ids são os que já existem, não os
  // acabados de gerar (que o `skipDuplicates` descartou).
  const rubricas = await tx.rubricaFluxoCaixa.findMany({ where: { tenantId, deletedAt: null } });
  const idRubricaPorCodigo = new Map(rubricas.map((r) => [r.codigo, r.id]));
  const idContaPorCodigo = new Map(folhas.map((c) => [c.codigo, c.id]));

  const linhas: Array<{ tenantId: string; contaId: string; rubricaId: string }> = [];
  for (const m of rubricasFluxoJson.mapeamentos as MapeamentoJSON[]) {
    const contaId = idContaPorCodigo.get(m.conta);
    if (!contaId) continue; // plano divergente: sem linha, nunca uma conta inventada
    const rubricaId = idRubricaPorCodigo.get(m.rubrica);
    if (!rubricaId) {
      // Defeito do JSON (rubrica referida que não consta das rubricas SISTEMA),
      // não do tenant: rebenta em vez de deixar a conta sem mapeamento em silêncio.
      throw new Error(`rubricas-fluxo-caixa.json: a conta ${m.conta} aponta para a rubrica ${m.rubrica}, que não existe.`);
    }
    linhas.push({ tenantId, contaId, rubricaId });
  }
  const mapeados = await tx.mapeamentoContaFluxo.createMany({ data: linhas, skipDuplicates: true });

  // O instantâneo lê-se DEPOIS dos mapeamentos: é o que o V1 exige («igual ao
  // elemento ao mapeamento vivo»). `instantaneoDe` lança se houver uma conta
  // repetida ou uma rubrica não viva — o seed não congela lixo com número de versão.
  const mapeamentos = await tx.mapeamentoContaFluxo.findMany({
    where: { tenantId },
    select: { contaId: true, rubricaId: true },
  });
  const instantaneo = instantaneoDe(rubricas, mapeamentos);
  await tx.versaoMapeamentoFluxo.create({
    data: {
      tenantId,
      numero: 1,
      estado: 'PENDING' as never,
      instantaneo: instantaneo as unknown as Prisma.InputJsonValue,
    },
  });
  return { rubricas: criadas.count, mapeamentos: mapeados.count, versaoCriada: true };
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
// Bootstrap completo de contabilidade (PGC + diários + séries + DFC)
// ---------------------------------------------------------------------------

export async function bootstrapContabilidade(
  tx: BootstrapClient,
  tenantId: string,
): Promise<{ contas: number; diarios: number; series: number }> {
  const contas = await bootstrapPlanoContas(tx, tenantId);
  const diarios = await bootstrapDiarios(tx, tenantId);
  const series = await bootstrapSeriesDocumento(tx, tenantId);
  await bootstrapContasNaturezaNotaDebito(tx, tenantId);
  // Um tenant novo nasce com zero contas folha sem mapeamento na DFC (ADR-0037 §3).
  await semearRubricasFluxo(tx, tenantId);
  return { contas, diarios, series };
}
