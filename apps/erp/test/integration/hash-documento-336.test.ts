/**
 * Oráculo da issue #336 — hash de integridade encadeado do documento fiscal (Fatura).
 *
 * Contrato (decidido pelo orquestrador):
 *   - `emitirDocumentoEmTx` (núcleo de TODAS as facturas: manual, proforma, POS) grava em
 *     `Fatura.hashValidacao` = sha256(serialização determinística do documento + hash do
 *     documento ANTERIOR da MESMA `serieDocumentoId`), lido depois de `numerarDocumento`
 *     (que já tranca a série). A serialização cobre número, série, data, NUIT do emitente e
 *     do adquirente, totais, IVA, linhas e o motivoIsencao das linhas.
 *   - `qrCode` fica `null` (não se inventa QR).
 *   - O modelo do PDF fiscal (`obterModeloFatura` → `FaturaDocument`) mostra o hash, rotulado
 *     «Hash de integridade» — nunca «certificado».
 *   - NC/ND ficam fora (não têm coluna).
 *
 * O FORMATO da serialização não é fixado aqui (é do implementador). Fixa-se o comportamento,
 * por ENSAIO: emitir dentro de uma transacção que depois se desfaz não gasta número, logo o
 * ensaio seguinte (ou a emissão real) recebe o MESMO número na MESMA série. Assim:
 *   (D) mesmo conteúdo + mesmo anterior ⇒ mesmo hash (determinismo; o real = o ensaio);
 *   (S) mudar NUIT do adquirente, NUIT do emitente, linhas, motivo de isenção, totais ou data
 *       ⇒ hash diferente;
 *   (C) mudar o hash do documento anterior da série ⇒ hash diferente; mudar o de um documento
 *       mais antigo (não o último) ⇒ igual; emitir noutra série (Factura-Recibo) ⇒ igual.
 *
 * Tenant montado pelos serviços reais (`bootstrapContabilidade`). A sessão é o único duplo.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createElement, isValidElement, type ReactNode } from 'react';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

const h = vi.hoisted(() => ({ sessao: null as null | { user: { emailVerificado: boolean } } }));
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => h.sessao),
}));

const SESSAO_CONFIRMADA = { user: { emailVerificado: true } };
const NUIT_CLIENTE = '400000336';
const SHA256_HEX = /^[0-9a-f]{64}$/;
// Data fixa de todos os documentos deste ficheiro: o ensaio e a emissão real têm de coincidir.
const DATA = new Date();
DATA.setUTCHours(10, 0, 0, 0);

class Ensaio extends Error {
  constructor() {
    super('ensaio desfeito de propósito');
  }
}

type LinhaIn = { descricao: string; quantidade: number; precoUnitario: number; taxaIva: number; motivoIsencao?: string };
const LINHAS_BASE: LinhaIn[] = [
  { descricao: 'Mercadoria A', quantidade: 2, precoUnitario: 500, taxaIva: 0.16 },
  { descricao: 'Mercadoria B', quantidade: 1, precoUnitario: 250, taxaIva: 0.16 },
];

describe.skipIf(skip)('#336 — hash de integridade encadeado por série — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let fat: any;
  let val: typeof import('@/lib/validations/faturacao');
  let documentos: any;

  const sufixo = Date.now();
  const TENANT = `tenant-hash-336-${sufixo}`;
  const USER = `user-hash-336-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  let clienteId: string;

  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  function input(over: { linhas?: LinhaIn[]; dataEmissao?: Date } = {}) {
    const dataEmissao = over.dataEmissao ?? DATA;
    return val.EmitirFaturaSchema.parse({
      clienteId,
      dataEmissao,
      dataVencimento: new Date(dataEmissao.getTime() + 30 * 86_400_000),
      linhas: over.linhas ?? LINHAS_BASE,
    });
  }

  type Opcoes = {
    tipoSerie?: 'FATURA' | 'FATURA_RECIBO';
    linhas?: LinhaIn[];
    dataEmissao?: Date;
    /** Alterações feitas na MESMA tx antes da emissão (desfeitas com o ensaio). */
    antes?: (tx: any) => Promise<void>;
  };

  async function emitirNaTx(tx: any, o: Opcoes) {
    if (o.antes) await o.antes(tx);
    const opcoes = o.tipoSerie && o.tipoSerie !== 'FATURA' ? { tipoSerie: o.tipoSerie } : undefined;
    const f: any = await fat.emitirDocumentoEmTx(tx, input(o), ctx, opcoes);
    const gravada = await tx.fatura.findFirst({ where: { id: f.id, tenantId: TENANT } });
    return gravada;
  }

  /** Emite e grava (commit). */
  async function emitir(o: Opcoes = {}): Promise<any> {
    return noCtx(() => db.$transaction((tx: any) => emitirNaTx(tx, o), { timeout: 30_000 }));
  }

  /** Emite dentro de uma tx que se desfaz: devolve número e hash que TERIA gravado. */
  async function ensaiar(o: Opcoes = {}): Promise<{ numero: string; hash: string | null; serieDocumentoId: string }> {
    let capturado: { numero: string; hash: string | null; serieDocumentoId: string } | null = null;
    await expect(
      noCtx(() =>
        db.$transaction(
          async (tx: any) => {
            const g = await emitirNaTx(tx, o);
            capturado = { numero: g.numero, hash: g.hashValidacao ?? null, serieDocumentoId: g.serieDocumentoId };
            throw new Ensaio();
          },
          { timeout: 30_000 },
        ),
      ),
    ).rejects.toBeInstanceOf(Ensaio);
    expect(capturado, 'o ensaio chegou a emitir').not.toBeNull();
    expect(capturado!.hash, `o ensaio de ${capturado!.numero} não gravou hashValidacao`).toEqual(expect.stringMatching(SHA256_HEX));
    return capturado!;
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    fat = await import('@/server/services/financas/faturacao.service');
    val = await import('@/lib/validations/faturacao');
    documentos = await import('@/server/services/plataforma/documentos.service');
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant Hash 336', slug: `hash-336-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    await db.user.create({
      data: {
        id: USER,
        tenantId: TENANT,
        email: `hash-336-${sufixo}@test.mz`,
        nome: 'Utilizador Hash',
        keycloakSub: `kc-hash-336-${sufixo}`,
      },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const cliente = await db.cliente.create({
      data: {
        tenantId: TENANT,
        nome: 'Cliente Hash',
        tipo: 'JURIDICA',
        nuit: NUIT_CLIENTE,
        email: `cliente-hash-${sufixo}@test.mz`,
        telefone: '840000336',
        codigo: `CLI-HASH-${sufixo}`,
      },
    });
    clienteId = cliente.id;
  });

  // -------------------------------------------------------------------------
  // Gravação
  // -------------------------------------------------------------------------

  it('o PRIMEIRO documento da série FATURA_RECIBO (ensaio) não depende das facturas FATURA emitidas depois', async () => {
    // Ensaio antes de existir qualquer documento no tenant.
    const antes = await ensaiar({ tipoSerie: 'FATURA_RECIBO' });
    await emitir();
    await emitir();
    const depois = await ensaiar({ tipoSerie: 'FATURA_RECIBO' });
    expect(depois.numero).toBe(antes.numero);
    expect(depois.hash, 'a série FATURA_RECIBO encadeou-se a documentos de outra série').toBe(antes.hash);
  });

  it('emitirDocumentoEmTx (sem sessão) grava hashValidacao sha256 em hex e deixa qrCode a null', async () => {
    h.sessao = null;
    const g = await emitir();
    expect(g.hashValidacao, 'Fatura.hashValidacao não foi escrito').toEqual(expect.stringMatching(SHA256_HEX));
    expect(g.qrCode, 'qrCode não se inventa').toBeNull();
  });

  it('emitirFatura (wrapper com sessão) e a Factura-Recibo (série do POS) também gravam o hash', async () => {
    h.sessao = SESSAO_CONFIRMADA;
    const f: any = await noCtx(() => fat.emitirFatura(input(), ctx));
    const gf = await db.fatura.findFirst({ where: { id: f.id, tenantId: TENANT } });
    expect(gf.hashValidacao).toEqual(expect.stringMatching(SHA256_HEX));
    expect(gf.qrCode).toBeNull();

    const fr = await emitir({ tipoSerie: 'FATURA_RECIBO' });
    expect(fr.status).toBe('PAGA');
    expect(fr.hashValidacao).toEqual(expect.stringMatching(SHA256_HEX));
    expect(fr.qrCode).toBeNull();
    h.sessao = null;
  });

  it('nenhuma factura deste tenant fica sem hash e não há dois hashes iguais', async () => {
    const todas = await db.fatura.findMany({ where: { tenantId: TENANT }, select: { numero: true, hashValidacao: true } });
    expect(todas.length).toBeGreaterThanOrEqual(4);
    for (const f of todas) expect(f.hashValidacao, `${f.numero} sem hash`).toEqual(expect.stringMatching(SHA256_HEX));
    expect(new Set(todas.map((f: any) => f.hashValidacao)).size).toBe(todas.length);
  });

  // -------------------------------------------------------------------------
  // (D) Determinismo
  // -------------------------------------------------------------------------

  it('(D) mesmo número, mesmo conteúdo e mesmo anterior ⇒ mesmo hash: dois ensaios e a emissão real coincidem', async () => {
    const e1 = await ensaiar();
    const e2 = await ensaiar();
    expect(e2.numero).toBe(e1.numero);
    expect(e2.hash).toBe(e1.hash);

    const real = await emitir();
    expect(real.numero).toBe(e1.numero);
    expect(real.hashValidacao).toBe(e1.hash);
  });

  // -------------------------------------------------------------------------
  // (S) Sensibilidade ao conteúdo
  // -------------------------------------------------------------------------

  it('(S) mudar o NUIT do adquirente muda o hash', async () => {
    const base = await ensaiar();
    const outro = await ensaiar({
      antes: (tx) => tx.cliente.update({ where: { id: clienteId }, data: { nuit: '400999336' } }),
    });
    expect(outro.numero).toBe(base.numero);
    expect(outro.hash).not.toBe(base.hash);
  });

  it('(S) mudar o NUIT do emitente (Tenant.nuit) muda o hash', async () => {
    const base = await ensaiar();
    const outro = await ensaiar({
      antes: (tx) => tx.tenant.update({ where: { id: TENANT }, data: { nuit: `9${`${sufixo}`.slice(-8)}` } }),
    });
    expect(outro.numero).toBe(base.numero);
    expect(outro.hash).not.toBe(base.hash);
  });

  it('(S) mudar só a descrição de uma linha muda o hash (as linhas entram na serialização)', async () => {
    const base = await ensaiar();
    const outro = await ensaiar({ linhas: [{ ...LINHAS_BASE[0], descricao: 'Mercadoria A (outra)' }, LINHAS_BASE[1]] });
    expect(outro.numero).toBe(base.numero);
    expect(outro.hash).not.toBe(base.hash);
  });

  it('(S) mudar só o motivo de isenção de uma linha a 0% muda o hash (motivoIsencao entra na serialização)', async () => {
    const isenta = (motivoIsencao: string): LinhaIn => ({
      descricao: 'Serviço isento',
      quantidade: 1,
      precoUnitario: 100,
      taxaIva: 0,
      motivoIsencao,
    });
    const base = await ensaiar({ linhas: [...LINHAS_BASE, isenta('Isento — artigo 9.º do Código do IVA')] });
    const outro = await ensaiar({ linhas: [...LINHAS_BASE, isenta('Isento — artigo 15.º do Código do IVA')] });
    expect(outro.numero).toBe(base.numero);
    expect(outro.hash, 'o motivo de isenção não entra no hash').not.toBe(base.hash);
  });

  it('(S) mudar os valores (totais e IVA) muda o hash', async () => {
    const base = await ensaiar();
    const outro = await ensaiar({ linhas: [{ ...LINHAS_BASE[0], precoUnitario: 501 }, LINHAS_BASE[1]] });
    expect(outro.numero).toBe(base.numero);
    expect(outro.hash).not.toBe(base.hash);
  });

  it('(S) mudar a data de emissão (mesmo ano, mesma série) muda o hash', async () => {
    const base = await ensaiar();
    const outraData = new Date(Date.UTC(DATA.getUTCFullYear(), DATA.getUTCMonth() === 0 ? 1 : 0, 15, 10));
    const outro = await ensaiar({ dataEmissao: outraData });
    expect(outro.serieDocumentoId).toBe(base.serieDocumentoId);
    expect(outro.numero).toBe(base.numero);
    expect(outro.hash).not.toBe(base.hash);
  });

  // -------------------------------------------------------------------------
  // (C) Encadeamento
  // -------------------------------------------------------------------------

  it('(C) o hash depende do hash do ÚLTIMO documento da mesma série, e só dele', async () => {
    const penultimo = await emitir();
    const ultimo = await emitir();
    expect(ultimo.serieDocumentoId).toBe(penultimo.serieDocumentoId);

    const base = await ensaiar();

    const comUltimoAdulterado = await ensaiar({
      antes: (tx) => tx.fatura.update({ where: { id: ultimo.id }, data: { hashValidacao: '0'.repeat(64) } }),
    });
    expect(comUltimoAdulterado.numero).toBe(base.numero);
    expect(comUltimoAdulterado.hash, 'o hash não depende do hash do documento anterior').not.toBe(base.hash);

    const comPenultimoAdulterado = await ensaiar({
      antes: (tx) => tx.fatura.update({ where: { id: penultimo.id }, data: { hashValidacao: '0'.repeat(64) } }),
    });
    expect(comPenultimoAdulterado.hash, 'o anterior tem de ser o ÚLTIMO da série, não outro').toBe(base.hash);

    // O ensaio desfez as adulterações: a base está intacta.
    const relido = await db.fatura.findFirst({ where: { id: ultimo.id, tenantId: TENANT } });
    expect(relido.hashValidacao).toBe(ultimo.hashValidacao);
  });

  it('(C) emitir na série FATURA_RECIBO não altera o encadeamento da série FATURA', async () => {
    const antes = await ensaiar();
    await emitir({ tipoSerie: 'FATURA_RECIBO' });
    const depois = await ensaiar();
    expect(depois.numero).toBe(antes.numero);
    expect(depois.hash).toBe(antes.hash);
  });

  it('(C) emissões concorrentes na mesma série: todas com hash, todos distintos', async () => {
    const emitidas = await Promise.all(Array.from({ length: 4 }, () => emitir()));
    const hashes = emitidas.map((g: any) => g.hashValidacao);
    for (const x of hashes) expect(x).toEqual(expect.stringMatching(SHA256_HEX));
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  // -------------------------------------------------------------------------
  // PDF fiscal
  // -------------------------------------------------------------------------

  /** Texto de uma árvore react-pdf: expande componentes de função, recolhe strings/números. */
  function textoDe(no: ReactNode): string[] {
    if (no == null || typeof no === 'boolean') return [];
    if (typeof no === 'string' || typeof no === 'number') return [String(no)];
    if (Array.isArray(no)) return no.flatMap(textoDe);
    if (isValidElement(no)) {
      const el = no as any;
      if (typeof el.type === 'function') return textoDe(el.type(el.props));
      return textoDe(el.props?.children);
    }
    return [];
  }

  it('o modelo do PDF e o próprio PDF mostram o hash gravado, rotulado «Hash de integridade», sem falar em certificado', async () => {
    const g = await emitir();
    const modelo: any = await noCtx(() => documentos.obterModeloFatura(g.id, ctx));
    const { FaturaDocument } = await import('@/lib/documents/pdf/fatura-pdf');
    const textos = textoDe(createElement(FaturaDocument, { model: modelo }));
    const tudo = textos.join('');
    // Não-vacuidade do leitor da árvore: o número e o NUIT do adquirente já hoje lá estão.
    expect(tudo).toContain(g.numero);
    expect(tudo).toContain(NUIT_CLIENTE);

    expect(g.hashValidacao).toEqual(expect.stringMatching(SHA256_HEX));
    const json = JSON.stringify(modelo);
    expect(json, 'o modelo do PDF não traz o hash gravado').toContain(g.hashValidacao);
    expect(json).not.toMatch(/certificad/i);

    expect(tudo, 'o PDF não tem o rótulo «Hash de integridade»').toContain('Hash de integridade');
    expect(tudo, 'o PDF não mostra o hash gravado, por inteiro').toContain(g.hashValidacao);
    expect(tudo).not.toMatch(/certificad/i);
  });
});
