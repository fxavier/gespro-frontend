/**
 * Oráculo P5-v (run exercicio-followups, issue #365, ADR-0035 §8) — o balanço simples, as
 * exportações PDF do balanço e da DRE, e o arquivo em PDF do balanço/DRE/balancete no encerramento.
 *
 * Contrato (decisões do utilizador e do orquestrador, `.scratch/sdlc/exercicio-followups/RUN.md`):
 *   Balanço — módulo novo `services/financas/balanco.service.ts`:
 *     `gerarBalanco({ exercicioId, periodoFinal? }, ctx)` → `{ activo, capitalProprio, passivo:
 *     { linhas: { codigo, nome, valor }[], total }, resultadoDoPeriodo, equilibrado }`.
 *     Linhas por conta de RAZÃO (código de 2 dígitos + nome). Montantes Decimal ou string decimal
 *     (comparados aqui por `.toFixed(2)`). Acumulado por PERÍODO (AB ou abertura implícita +
 *     períodos 1..periodoFinal) das folhas; Activo = classes 1–3 (+ razões da classe 4 de saldo
 *     líquido devedor); Passivo = razões da classe 4 de saldo líquido credor; Capital próprio =
 *     classe 5 + classe 8 + `resultadoDoPeriodo` (classes 6/7 por apurar, credor positivo).
 *     `periodoFinal` por omissão: 13 com o exercício encerrado, senão o último período (12).
 *   Exportações (`withApi`, permissão `financas:exportar`):
 *     GET /api/contabilidade/balanco/export?exercicioId=…&formato=pdf → 200 application/pdf
 *     GET /api/contabilidade/dre/export?dataInicio=…&dataFim=…&formato=pdf → 200 application/pdf
 *     sem a permissão → 403.
 *   Arquivo — DEPOIS do commit do encerramento (uma falha de arquivo não desfaz o encerramento):
 *     `arquivarEncerramento(encerramentoId, ctx)` exportado por `encerramento-exercicio.service`;
 *     `EncerramentoExercicio.{balancoStorageKey, dreStorageKey, balanceteStorageKey, arquivadoEm}`;
 *     keys sob `tenant/<tenantId>/encerramento/`; os três objectos existem no armazenamento local
 *     e começam por `%PDF`. Idempotente (só se fixa: keys preenchidas e ficheiros presentes).
 *     Com o `put` a falhar: `encerrarExercicio` devolve ok, o exercício fica
 *     ENCERRADO_PROVISORIO e as keys ficam nulas.
 *   Download: GET /api/contabilidade/exercicios/[id]/encerramento/[documento]
 *     (documento ∈ balanco|dre|balancete) → 302 para o URL assinado da key do encerramento
 *     corrente; outro tenant → 404; key em falta → 404; sem encerramento corrente → 404.
 *
 * Cenário (o do oráculo P3; meses de 2026 fechados por escrita crua do estado):
 *   2026  Mar D 111 / C 711 1000 · Abr D 622 / C 111 300 · Mai D 121 / C 521 2000 (capital)
 *   Antes de encerrar (p. 12): Activo 2700 (11: 700, 12: 2000) · CP 2700 (52: 2000, resultado 700)
 *     · Passivo 0.
 *   Encerrado com estimativa 100 (p. 13): Activo 2700 · CP 2600 (52: 2000, 88: 600, resultado 0)
 *     · Passivo 100 (44: 100).
 *
 * Só se dobra `@/lib/auth` (a sessão das rotas). O armazenamento é o adaptador `local`, num
 * directório temporário. Cada caso monta o seu próprio tenant. Requer: Docker +
 * @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo autor do oráculo; um agente de implementação que o altere é BLOCKER.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';
import { formatNumero } from '@/lib/format-currency';
import { compactar, garantirExtractor, textoCompacto } from '@/app/api/contabilidade/dfc/export/__tests__/pdf-texto';

const mocks = vi.hoisted(() => {
  // Armazenamento local num directório próprio, antes de qualquer módulo o ler.
  process.env.STORAGE_DRIVER = 'local';
  return { auth: vi.fn(), dirBase: '' };
});

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

type AnyDb = any;
type Ctx = { tenantId: string; userId: string };
type ResultadoEncerramento =
  | { ok: true; encerramento: Record<string, unknown> & { id: string; versao: number } }
  | { ok: false; impedimentos: string[] };

interface Linha { codigo: string; nome: string; valor: unknown }
interface Massa { linhas: Linha[]; total: unknown }
interface Balanco {
  activo: Massa;
  capitalProprio: Massa;
  passivo: Massa;
  resultadoDoPeriodo: unknown;
  equilibrado: boolean;
}
type GerarBalanco = (input: { exercicioId: string; periodoFinal?: number }, ctx: Ctx) => Promise<Balanco>;
type ArquivarEncerramento = (encerramentoId: string, ctx: Ctx) => Promise<unknown>;
type Rota = (req: NextRequest, segmento: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function carregar<T>(caminho: string, nome: string): Promise<T> {
  let modulo: Record<string, unknown> | undefined;
  let erro = '';
  try {
    modulo = (await import(/* @vite-ignore */ caminho)) as Record<string, unknown>;
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }
  expect(typeof modulo?.[nome], `${caminho} exporta ${nome}${erro ? ` (import falhou: ${erro})` : ''}`).toBe('function');
  return modulo![nome] as T;
}

const gerarBalanco = () => carregar<GerarBalanco>('@/server/services/financas/balanco.service', 'gerarBalanco');
const arquivarEncerramento = () =>
  carregar<ArquivarEncerramento>('@/server/services/financas/encerramento-exercicio.service', 'arquivarEncerramento');
const rotaBalanco = () => carregar<Rota>('@/app/api/contabilidade/balanco/export/route', 'GET');
const rotaDre = () => carregar<Rota>('@/app/api/contabilidade/dre/export/route', 'GET');
const rotaDownload = () =>
  carregar<Rota>('@/app/api/contabilidade/exercicios/[id]/encerramento/[documento]/route', 'GET');

const dec = (v: unknown) => new Prisma.Decimal(String(v ?? 0));
const f2 = (v: unknown) => dec(v).toFixed(2);
const fpdf = (v: string) => compactar(formatNumero(v));

/** Linhas de razão de saldo não nulo, como `{ codigo: '0.00' }`. */
function mapa(m: Massa): Record<string, string> {
  const r: Record<string, string> = {};
  for (const l of m.linhas) {
    if (/^\d{2}$/.test(l.codigo) && !dec(l.valor).isZero()) r[l.codigo] = f2(l.valor);
  }
  return r;
}

/** O balanço reduzido a números comparáveis. */
function resumo(b: Balanco) {
  return {
    activo: { linhas: mapa(b.activo), total: f2(b.activo.total) },
    capitalProprio: { linhas: mapa(b.capitalProprio), total: f2(b.capitalProprio.total) },
    passivo: { linhas: mapa(b.passivo), total: f2(b.passivo.total) },
    resultadoDoPeriodo: f2(b.resultadoDoPeriodo),
    equilibrado: b.equilibrado,
  };
}

const ANTES = {
  activo: { linhas: { '11': '700.00', '12': '2000.00' }, total: '2700.00' },
  capitalProprio: { linhas: { '52': '2000.00' }, total: '2700.00' },
  passivo: { linhas: {}, total: '0.00' },
  resultadoDoPeriodo: '700.00',
  equilibrado: true,
};

const DEPOIS = {
  activo: { linhas: { '11': '700.00', '12': '2000.00' }, total: '2700.00' },
  capitalProprio: { linhas: { '52': '2000.00', '88': '600.00' }, total: '2600.00' },
  passivo: { linhas: { '44': '100.00' }, total: '100.00' },
  resultadoDoPeriodo: '0.00',
  equilibrado: true,
};

const CODIGOS = ['111', '121', '521', '622', '711', '4411', '88'] as const;
type Codigo = (typeof CODIGOS)[number];
const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MOTIVO = 'Ajustamento da revisão de contas: provisão em falta em Dezembro';
const DOCUMENTOS = ['balanco', 'dre', 'balancete'] as const;
const CAMPO_KEY = { balanco: 'balancoStorageKey', dre: 'dreStorageKey', balancete: 'balanceteStorageKey' } as const;

const EXPORTAR = 'financas:exportar';
const PERMISSOES = [EXPORTAR, 'financas:leitura', 'financas:exercicio:encerrar', 'financas:exercicio:reabrir'];

function sessao(ctx: Ctx, permissions: string[] = PERMISSOES) {
  return {
    user: {
      id: ctx.userId,
      tenantId: ctx.tenantId,
      permissions,
      acesso: 'aberto',
      emailVerificado: true,
      name: 'Contabilista',
      email: 'contabilista@test.mz',
    },
  };
}

const URL_BASE = 'http://localhost:3000/api/contabilidade';

describe.skipIf(skip)('Balanço, PDF da DRE e arquivo do encerramento (#365, ADR-0035 §8) — DB efémera', () => {
  let db: AnyDb;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let contab: typeof import('@/server/services/financas/contabilidade.service');
  let enc: typeof import('@/server/services/financas/encerramento-exercicio.service');
  let bootstrapContabilidade: (typeof import('@/server/provisioning/tenant-bootstrap'))['bootstrapContabilidade'];

  const TS = Date.now();
  let seq = 0;

  interface Tenant {
    ctx: Ctx;
    nome: string;
    ex26: { id: string };
  }

  async function novoTenant(): Promise<Tenant> {
    seq += 1;
    const tenantId = `tenant-bal-${TS}-${seq}`;
    const userId = `user-bal-${TS}-${seq}`;
    const slug = `bal-${TS}-${seq}`;
    const nome = `Tenant ${slug}`;
    await db.tenant.create({
      data: { id: tenantId, nome, slug, nuit: `${String(TS).slice(-7)}${String(seq).padStart(2, '0')}` },
    });
    await db.user.create({
      data: { id: userId, tenantId, email: `${slug}@test.mz`, nome: 'Contabilista', keycloakSub: `kc-${slug}` },
    });
    await db.$transaction((tx: AnyDb) => bootstrapContabilidade(tx, tenantId), { timeout: 60_000 });

    const contas = await db.contaPGC.findMany({
      where: { tenantId, codigo: { in: [...CODIGOS] } },
      select: { codigo: true, aceitaLancamento: true },
    });
    for (const c of contas) expect(c.aceitaLancamento, `pré-condição: ${c.codigo} aceita lançamento`).toBe(true);
    expect(contas.map((c: AnyDb) => c.codigo).sort()).toEqual([...CODIGOS].sort());

    const ctx = { tenantId, userId };
    await runCtx(ctx, () => contab.abrirExercicio({ ano: 2026 }, ctx));
    const ex26 = await db.exercicioContabil.findFirst({ where: { tenantId, codigo: '2026' } });
    return { ctx, nome, ex26 };
  }

  let doc = 0;
  async function lancar(ctx: Ctx, data: string, debito: Codigo, credito: Codigo, valor: string) {
    return runCtx(ctx, () =>
      db.$transaction((tx: AnyDb) =>
        contab.registarLancamentoContabilistico(
          tx,
          {
            data: new Date(data),
            diarioTipo: 'OPERACOES',
            origem: 'AJUSTE',
            documentoOrigemId: `doc-bal-${++doc}`,
            documentoOrigemTipo: 'TesteBalanco',
            historico: `Teste balanço ${debito}/${credito} ${valor}`,
            partidas: [
              { contaCodigo: debito, tipo: 'DEBITO', valor },
              { contaCodigo: credito, tipo: 'CREDITO', valor },
            ],
          },
          ctx,
        ),
      ),
    );
  }

  /** Cenário de 2026 lançado e os doze meses fechados (estado cru). */
  async function cenario2026(): Promise<Tenant> {
    const t = await novoTenant();
    await lancar(t.ctx, '2026-03-15T10:00:00Z', '111', '711', '1000');
    await lancar(t.ctx, '2026-04-15T10:00:00Z', '622', '111', '300');
    await lancar(t.ctx, '2026-05-15T10:00:00Z', '121', '521', '2000');
    await db.periodoContabil.updateMany({
      where: { tenantId: t.ctx.tenantId, exercicioId: t.ex26.id, ordem: { in: MESES } },
      data: { estado: 'FECHADO', fechadoEm: new Date(), fechadoPorId: t.ctx.userId },
    });
    return t;
  }

  async function encerrar2026(t: Tenant) {
    const r = (await enc.encerrarExercicio(
      { exercicioId: t.ex26.id, estimativaImposto: '100' },
      t.ctx,
    )) as ResultadoEncerramento;
    expect('impedimentos' in r ? r.impedimentos : [], 'pré-condição: 2026 encerra').toEqual([]);
    expect(r.ok).toBe(true);
    return (r as Extract<ResultadoEncerramento, { ok: true }>).encerramento;
  }

  async function estadoExercicio(t: Tenant) {
    return (await db.exercicioContabil.findFirst({ where: { id: t.ex26.id, tenantId: t.ctx.tenantId } })).estado;
  }

  async function encerramentoBd(t: Tenant, id: string) {
    return db.encerramentoExercicio.findFirst({ where: { id, tenantId: t.ctx.tenantId } });
  }

  async function lerLocal(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(path.join(mocks.dirBase, key));
    } catch {
      return null;
    }
  }

  async function exigirArquivado(t: Tenant, encerramentoId: string) {
    const e = await encerramentoBd(t, encerramentoId);
    for (const d of DOCUMENTOS) {
      const key = e[CAMPO_KEY[d]] as string | null | undefined;
      expect(typeof key, `${CAMPO_KEY[d]} preenchida`).toBe('string');
      expect(key!.startsWith(`tenant/${t.ctx.tenantId}/encerramento/`), `${d}: key sob o tenant e o recurso`).toBe(
        true,
      );
      const bytes = await lerLocal(key!);
      expect(bytes, `${d}: o objecto existe no armazenamento`).not.toBeNull();
      expect(bytes!.subarray(0, 4).toString('latin1'), `${d}: é um PDF`).toBe('%PDF');
    }
    expect(e.arquivadoEm, 'arquivadoEm preenchido').toBeInstanceOf(Date);
    return e;
  }

  async function chamarDownload(exercicioId: string, documento: string) {
    const GET = await rotaDownload();
    return GET(
      new NextRequest(`${URL_BASE}/exercicios/${exercicioId}/encerramento/${documento}`),
      { params: Promise.resolve({ id: exercicioId, documento }) },
    );
  }

  beforeAll(async () => {
    mocks.dirBase = await fs.mkdtemp(path.join(os.tmpdir(), 'gespro-arquivo-'));
    process.env.STORAGE_LOCAL_DIR = mocks.dirBase;
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    contab = await import('@/server/services/financas/contabilidade.service');
    enc = await import('@/server/services/financas/encerramento-exercicio.service');
    ({ bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap'));
    await garantirExtractor();
  });

  afterAll(async () => {
    await fs.rm(mocks.dirBase, { recursive: true, force: true });
  });

  beforeEach(() => {
    process.env.STORAGE_LOCAL_DIR = mocks.dirBase;
    mocks.auth.mockReset();
  });

  // -------------------------------------------------------------------------
  // Balanço
  // -------------------------------------------------------------------------

  describe('gerarBalanco', () => {
    it('antes de encerrar (p. 12): Activo 2700 = CP 2700 (52 + resultado 700), Passivo 0', async () => {
      const gerar = await gerarBalanco();
      const t = await cenario2026();
      const b = await runCtx(t.ctx, () => gerar({ exercicioId: t.ex26.id, periodoFinal: 12 }, t.ctx));
      expect(resumo(b)).toEqual(ANTES);
    });

    it('por omissão, com o exercício aberto, é o balanço do último período (12)', async () => {
      const gerar = await gerarBalanco();
      const t = await cenario2026();
      const b = await runCtx(t.ctx, () => gerar({ exercicioId: t.ex26.id }, t.ctx));
      expect(resumo(b)).toEqual(ANTES);
    });

    it('depois de encerrar (p. 13): Activo 2700 = CP 2600 (52, 88: 600, resultado 0) + Passivo 100 (44)', async () => {
      const gerar = await gerarBalanco();
      const t = await cenario2026();
      await encerrar2026(t);
      const b = await runCtx(t.ctx, () => gerar({ exercicioId: t.ex26.id, periodoFinal: 13 }, t.ctx));
      expect(resumo(b)).toEqual(DEPOIS);
    });

    it('por omissão, com o exercício encerrado, inclui o período 13', async () => {
      const gerar = await gerarBalanco();
      const t = await cenario2026();
      await encerrar2026(t);
      const b = await runCtx(t.ctx, () => gerar({ exercicioId: t.ex26.id }, t.ctx));
      expect(resumo(b)).toEqual(DEPOIS);
      // e até ao período 12 o mesmo exercício encerrado ainda mostra o resultado por apurar
      const b12 = await runCtx(t.ctx, () => gerar({ exercicioId: t.ex26.id, periodoFinal: 12 }, t.ctx));
      expect(resumo(b12)).toEqual(ANTES);
    });

    it('as linhas levam o nome da conta de razão', async () => {
      const gerar = await gerarBalanco();
      const t = await cenario2026();
      await encerrar2026(t);
      const b = await runCtx(t.ctx, () => gerar({ exercicioId: t.ex26.id }, t.ctx));
      const razoes = await db.contaPGC.findMany({
        where: { tenantId: t.ctx.tenantId, codigo: { in: ['11', '12', '44', '52', '88'] } },
        select: { codigo: true, nome: true },
      });
      const nomes = new Map(razoes.map((c: AnyDb) => [c.codigo, c.nome]));
      for (const l of [...b.activo.linhas, ...b.capitalProprio.linhas, ...b.passivo.linhas]) {
        if (nomes.has(l.codigo)) expect(l.nome, `nome da ${l.codigo}`).toBe(nomes.get(l.codigo));
      }
    });

    it('outro tenant → NotFoundError', async () => {
      const gerar = await gerarBalanco();
      const a = await cenario2026();
      const b = await novoTenant();
      await expect(runCtx(b.ctx, () => gerar({ exercicioId: a.ex26.id }, b.ctx))).rejects.toMatchObject({
        name: 'NotFoundError',
      });
    });
  });

  // -------------------------------------------------------------------------
  // Exportações PDF
  // -------------------------------------------------------------------------

  describe('exportações PDF', () => {
    it('balanço: 200 application/pdf com a entidade e os totais', async () => {
      const GET = await rotaBalanco();
      const t = await cenario2026();
      await encerrar2026(t);
      mocks.auth.mockResolvedValue(sessao(t.ctx));
      const res = await GET(
        new NextRequest(`${URL_BASE}/balanco/export?exercicioId=${t.ex26.id}&formato=pdf`),
        { params: Promise.resolve({}) },
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toMatch(/^application\/pdf/);
      const pdf = new Uint8Array(await res.arrayBuffer());
      expect(Buffer.from(pdf.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
      const texto = textoCompacto(pdf);
      expect(texto).toContain(compactar('Balanço'));
      expect(texto).toContain(compactar(t.nome));
      expect(texto).toContain(fpdf('2700'));
      expect(texto).toContain(fpdf('2600'));
    });

    it('balanço: sem financas:exportar → 403', async () => {
      const GET = await rotaBalanco();
      const t = await novoTenant();
      mocks.auth.mockResolvedValue(sessao(t.ctx, ['financas:leitura']));
      const res = await GET(
        new NextRequest(`${URL_BASE}/balanco/export?exercicioId=${t.ex26.id}&formato=pdf`),
        { params: Promise.resolve({}) },
      );
      expect(res.status).toBe(403);
    });

    it('DRE: 200 application/pdf com a entidade e o resultado líquido', async () => {
      const GET = await rotaDre();
      const t = await cenario2026();
      mocks.auth.mockResolvedValue(sessao(t.ctx));
      const res = await GET(
        new NextRequest(`${URL_BASE}/dre/export?dataInicio=2026-01-01&dataFim=2026-12-31&formato=pdf`),
        { params: Promise.resolve({}) },
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toMatch(/^application\/pdf/);
      const pdf = new Uint8Array(await res.arrayBuffer());
      expect(Buffer.from(pdf.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
      const texto = textoCompacto(pdf);
      expect(texto).toContain(compactar('Demonstração de Resultados'));
      expect(texto).toContain(compactar(t.nome));
      expect(texto).toContain(fpdf('1000'));
      expect(texto).toContain(fpdf('700'));
    });

    it('DRE: sem financas:exportar → 403', async () => {
      const GET = await rotaDre();
      const t = await novoTenant();
      mocks.auth.mockResolvedValue(sessao(t.ctx, ['financas:leitura']));
      const res = await GET(
        new NextRequest(`${URL_BASE}/dre/export?dataInicio=2026-01-01&dataFim=2026-12-31&formato=pdf`),
        { params: Promise.resolve({}) },
      );
      expect(res.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // Arquivo no encerramento
  // -------------------------------------------------------------------------

  describe('arquivo do encerramento', () => {
    it('encerrar + arquivarEncerramento → três PDF no armazenamento, keys e arquivadoEm gravados', async () => {
      const arquivar = await arquivarEncerramento();
      const t = await cenario2026();
      const e = await encerrar2026(t);
      await arquivar(e.id, t.ctx);
      await exigirArquivado(t, e.id);
    });

    it('arquivarEncerramento é idempotente: segunda chamada deixa keys e ficheiros válidos', async () => {
      const arquivar = await arquivarEncerramento();
      const t = await cenario2026();
      const e = await encerrar2026(t);
      await arquivar(e.id, t.ctx);
      await exigirArquivado(t, e.id);
      await arquivar(e.id, t.ctx);
      await exigirArquivado(t, e.id);
    });

    it('arquivarEncerramento de outro tenant → NotFoundError, nada gravado', async () => {
      const arquivar = await arquivarEncerramento();
      const a = await cenario2026();
      const e = await encerrar2026(a);
      const b = await novoTenant();
      await expect(arquivar(e.id, b.ctx)).rejects.toMatchObject({ name: 'NotFoundError' });
      const linha = await encerramentoBd(a, e.id);
      expect(linha.balancoStorageKey ?? null).toBeNull();
    });

    it('com o put a falhar, o encerramento fica feito e as keys nulas (o arquivo vem depois do commit)', async () => {
      const arquivar = await arquivarEncerramento();
      const t = await cenario2026();
      // Directório base apontado a um FICHEIRO: qualquer escrita local falha (ENOTDIR).
      const ficheiro = path.join(mocks.dirBase, `nao-e-directorio-${TS}`);
      await fs.writeFile(ficheiro, 'x');
      process.env.STORAGE_LOCAL_DIR = ficheiro;
      try {
        const e = await encerrar2026(t);
        expect(await estadoExercicio(t)).toBe('ENCERRADO_PROVISORIO');
        await arquivar(e.id, t.ctx).catch(() => undefined);
        // Se o arquivo for disparado em segundo plano, dá-lhe tempo de falhar.
        await new Promise((r) => setTimeout(r, 1500));
        const linha = await encerramentoBd(t, e.id);
        expect(linha, 'o encerramento existe').toBeTruthy();
        expect(linha.anuladoEm).toBeNull();
        for (const d of DOCUMENTOS) expect(linha[CAMPO_KEY[d]] ?? null, `${CAMPO_KEY[d]} nula`).toBeNull();
        expect(linha.arquivadoEm ?? null).toBeNull();
        expect(await estadoExercicio(t)).toBe('ENCERRADO_PROVISORIO');

        // Download sem key → 404.
        mocks.auth.mockResolvedValue(sessao(t.ctx));
        const res = await chamarDownload(t.ex26.id, 'balanco');
        expect(res.status).toBe(404);
      } finally {
        process.env.STORAGE_LOCAL_DIR = mocks.dirBase;
      }
    });
  });

  // -------------------------------------------------------------------------
  // Download dos arquivados
  // -------------------------------------------------------------------------

  describe('download dos PDF arquivados', () => {
    it('302 para o URL da key do encerramento corrente, para cada documento', async () => {
      const arquivar = await arquivarEncerramento();
      await rotaDownload();
      const t = await cenario2026();
      const e = await encerrar2026(t);
      await arquivar(e.id, t.ctx);
      const linha = await exigirArquivado(t, e.id);
      mocks.auth.mockResolvedValue(sessao(t.ctx));
      for (const d of DOCUMENTOS) {
        const res = await chamarDownload(t.ex26.id, d);
        expect(res.status, d).toBe(302);
        expect(res.headers.get('location'), d).toContain(`/api/documentos/local/${linha[CAMPO_KEY[d]]}`);
      }
    });

    it('outro tenant → 404', async () => {
      const arquivar = await arquivarEncerramento();
      await rotaDownload();
      const a = await cenario2026();
      const e = await encerrar2026(a);
      await arquivar(e.id, a.ctx);
      const b = await novoTenant();
      mocks.auth.mockResolvedValue(sessao(b.ctx));
      const res = await chamarDownload(a.ex26.id, 'balanco');
      expect(res.status).toBe(404);
    });

    it('sem encerramento corrente (exercício reaberto, ou nunca encerrado) → 404', async () => {
      const arquivar = await arquivarEncerramento();
      await rotaDownload();
      const t = await cenario2026();
      mocks.auth.mockResolvedValue(sessao(t.ctx));
      expect((await chamarDownload(t.ex26.id, 'dre')).status, 'nunca encerrado').toBe(404);

      const e = await encerrar2026(t);
      await arquivar(e.id, t.ctx);
      await enc.reabrirExercicio({ exercicioId: t.ex26.id, motivo: MOTIVO }, t.ctx);
      expect((await chamarDownload(t.ex26.id, 'dre')).status, 'encerramento anulado').toBe(404);
    });

    it('documento desconhecido → 400 ou 404', async () => {
      const arquivar = await arquivarEncerramento();
      await rotaDownload();
      const t = await cenario2026();
      const e = await encerrar2026(t);
      await arquivar(e.id, t.ctx);
      mocks.auth.mockResolvedValue(sessao(t.ctx));
      const res = await chamarDownload(t.ex26.id, 'razao');
      expect([400, 404]).toContain(res.status);
    });
  });
});
