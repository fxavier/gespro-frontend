/**
 * Importação de extracto e projecção do razão, com Prisma mockado. Foco:
 * isolamento multi-tenant, as duas camadas de idempotência (RF §19, CA08),
 * all-or-nothing com relatório por linha, e a projecção SEM janela de datas (CA04).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/lib/errors';

const mocks = vi.hoisted(() => {
  const model = () => ({
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  });
  const db = {
    contaBancaria: model(),
    importacaoExtracto: model(),
    movimentoBancario: model(),
    movimentoContabilistico: model(),
    partidaLancamento: model(),
    fatura: model(),
    pagamento: model(),
    contaPagar: model(),
    notaCredito: model(),
    notaDebito: model(),
  };
  return { db };
});

vi.mock('@/server/db/client', () => ({
  prisma: { ...mocks.db, $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(mocks.db) },
  prismaBase: mocks.db,
}));
vi.mock('../../financas/contabilidade.service', () => ({
  FILTRO_LANCAMENTO_MAPA: { in: ['LANCADO', 'ESTORNADO'] },
}));

import { importarExtracto, projetarMovimentosContabilisticos, TAMANHO_MAXIMO_EXTRACTO } from '../importacao.service';

const db = mocks.db;
const ctx = { tenantId: 'tenant-a', userId: 'user-1' };
const D = (v: string) => new Prisma.Decimal(v);
const bytes = (s: string) => new TextEncoder().encode(s);

const EXTRACTO = [
  'referencia;data;descricao;valor;tipo',
  'TRF-458;12/09/2026;Transferência cliente;100.000,00;D',
  ';15/09/2026;Comissão bancária;500,00;C',
  ';15/09/2026;Comissão bancária;500,00;C',
].join('\n');

beforeEach(() => {
  vi.clearAllMocks();
  db.contaBancaria.findFirst.mockResolvedValue({ id: 'conta-1', contaContabilId: 'pgc-121', ativo: true });
  db.contaBancaria.count.mockResolvedValue(1);
  db.importacaoExtracto.findFirst.mockResolvedValue(null);
  db.importacaoExtracto.create.mockResolvedValue({ id: 'imp-1' });
  db.movimentoBancario.createMany.mockImplementation(async (a: { data: unknown[] }) => ({ count: a.data.length }));
  db.partidaLancamento.findMany.mockResolvedValue([]);
  db.movimentoContabilistico.createMany.mockImplementation(async (a: { data: unknown[] }) => ({ count: a.data.length }));
  for (const m of [db.fatura, db.pagamento, db.contaPagar, db.notaCredito, db.notaDebito]) m.findMany.mockResolvedValue([]);
});

describe('importarExtracto', () => {
  const importar = (conteudo = EXTRACTO, nomeFicheiro = 'setembro.csv') =>
    importarExtracto({ contaBancariaId: 'conta-1', nomeFicheiro, conteudo: bytes(conteudo) }, ctx);

  it('conta de outro tenant → NotFoundError, sem ler o ficheiro nem escrever', async () => {
    db.contaBancaria.findFirst.mockResolvedValue(null);
    await expect(importar()).rejects.toBeInstanceOf(NotFoundError);
    expect(db.contaBancaria.findFirst.mock.calls[0][0].where).toEqual({ id: 'conta-1', tenantId: 'tenant-a' });
    expect(db.importacaoExtracto.create).not.toHaveBeenCalled();
  });

  it('importa: um lote, movimentos com Decimal, referência normalizada e chaves distintas', async () => {
    const r = await importar();
    expect(r).toEqual({ estado: 'IMPORTADO', importacaoId: 'imp-1', totalLinhas: 3, criados: 3, ignorados: 0 });

    const lote = db.importacaoExtracto.create.mock.calls[0][0].data;
    expect(lote).toMatchObject({ tenantId: 'tenant-a', contaBancariaId: 'conta-1', origem: 'CSV', importadoPorId: 'user-1' });
    expect(lote.hashFicheiro).toMatch(/^[0-9a-f]{64}$/);

    const { data, skipDuplicates } = db.movimentoBancario.createMany.mock.calls[0][0];
    expect(skipDuplicates).toBe(true);
    expect(data[0]).toMatchObject({
      tenantId: 'tenant-a', contaBancariaId: 'conta-1', importacaoId: 'imp-1',
      referencia: 'TRF-458', referenciaNormalizada: 'TRF458', natureza: 'DEBITO', origem: 'CSV',
    });
    expect(data[0].valor.equals(D('100000.00'))).toBe(true);
    // As duas comissões iguais no mesmo dia são DOIS movimentos (ordinal).
    expect(new Set(data.map((m: { chaveIdempotencia: string }) => m.chaveIdempotencia)).size).toBe(3);
  });

  it('CA08: o mesmo ficheiro outra vez devolve JA_IMPORTADO e não escreve nada', async () => {
    db.importacaoExtracto.findFirst.mockResolvedValue({ id: 'imp-antiga' });
    expect(await importar()).toEqual({ estado: 'JA_IMPORTADO', importacaoId: 'imp-antiga' });
    expect(db.importacaoExtracto.findFirst.mock.calls[0][0].where).toMatchObject({ tenantId: 'tenant-a', contaBancariaId: 'conta-1' });
    expect(db.movimentoBancario.createMany).not.toHaveBeenCalled();
  });

  it('CA08: extracto sobreposto (ficheiro diferente, linhas repetidas) gera as MESMAS chaves e o esquema ignora-as', async () => {
    await importar();
    const primeiro = db.movimentoBancario.createMany.mock.calls[0][0].data.map((m: { chaveIdempotencia: string }) => m.chaveIdempotencia);
    db.movimentoBancario.createMany.mockResolvedValueOnce({ count: 1 });
    const r = await importar(`${EXTRACTO}\n;20/09/2026;Depósito;1.000,00;D`, 'set-completo.csv');
    const segundo = db.movimentoBancario.createMany.mock.calls[1][0].data.map((m: { chaveIdempotencia: string }) => m.chaveIdempotencia);
    expect(segundo.slice(0, 3)).toEqual(primeiro);
    expect(r).toMatchObject({ criados: 1, ignorados: 3 });
    expect(db.importacaoExtracto.update.mock.calls[1][0].data).toEqual({ criados: 1, ignorados: 3 });
  });

  it('all-or-nothing: uma linha inválida recusa o ficheiro, com todos os erros por linha', async () => {
    const mau = [EXTRACTO, 'X-1;32/09/2026;Nada;10;D', 'X-2;01/09/2026;;abc;D'].join('\n');
    const erro = await importar(mau).catch((e) => e);
    expect(erro).toBeInstanceOf(ValidationError);
    expect(erro.details.erros.map((e: { linha: number }) => e.linha)).toEqual([5, 6]);
    expect(db.importacaoExtracto.create).not.toHaveBeenCalled();
    expect(db.movimentoBancario.createMany).not.toHaveBeenCalled();
  });

  it('ordinal só nas linhas sem referência: acrescentar uma referência a uma linha não mexe nas chaves das vizinhas', async () => {
    const semRef = ['referencia;data;descricao;valor;tipo', ';15/09/2026;Comissão;500,00;C', ';15/09/2026;Comissão;500,00;C'].join('\n');
    const comRef = ['referencia;data;descricao;valor;tipo', 'COM-1;15/09/2026;Comissão;500,00;C', ';15/09/2026;Comissão;500,00;C'].join('\n');
    await importar(semRef, 'a.csv');
    await importar(comRef, 'b.csv');
    const [a, b] = db.movimentoBancario.createMany.mock.calls.map(([x]) => x.data.map((m: { chaveIdempotencia: string }) => m.chaveIdempotencia));
    expect(b[1]).toBe(a[0]); // a linha sem referência continua a ser a «primeira» do tuplo
  });

  it('ficheiro ilegível como XLSX → ValidationError, não 500', async () => {
    await expect(importar('isto não é um zip', 'extracto.xlsx')).rejects.toBeInstanceOf(ValidationError);
  });

  it('formato não suportado e ficheiro acima do tecto → BusinessRuleError', async () => {
    await expect(importar(EXTRACTO, 'extracto.pdf')).rejects.toMatchObject({ code: 'FORMATO_EXTRACTO_NAO_SUPORTADO' });
    const grande = new Uint8Array(TAMANHO_MAXIMO_EXTRACTO + 1);
    await expect(
      importarExtracto({ contaBancariaId: 'conta-1', nomeFicheiro: 'a.csv', conteudo: grande }, ctx),
    ).rejects.toMatchObject({ code: 'EXTRACTO_DEMASIADO_GRANDE' });
  });

  it('corrida: dois uploads do mesmo ficheiro — o que perde no @@unique devolve JA_IMPORTADO', async () => {
    db.importacaoExtracto.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }),
    );
    db.importacaoExtracto.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'imp-vencedora' });
    expect(await importar()).toEqual({ estado: 'JA_IMPORTADO', importacaoId: 'imp-vencedora' });
  });
});

describe('projetarMovimentosContabilisticos', () => {
  const partida = (id: string, extra: object = {}) => ({
    id, lancamentoId: `l-${id}`, tipo: 'DEBITO', valor: D('100000.00'), historico: null,
    lancamento: {
      data: new Date(2026, 8, 28, 12), numero: 'BCO/000123', historico: 'Recebimento',
      documentoOrigemTipo: 'Recebimento', documentoOrigemId: 'fat-45',
    },
    ...extra,
  });

  it('conta de outro tenant → NotFoundError', async () => {
    db.contaBancaria.findFirst.mockResolvedValue(null);
    await expect(projetarMovimentosContabilisticos('x', ctx)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('conta bancária inactiva → CONTA_BANCARIA_INATIVA, sem ler partidas', async () => {
    db.contaBancaria.findFirst.mockResolvedValue({ id: 'conta-1', contaContabilId: 'pgc-121', ativo: false });
    await expect(projetarMovimentosContabilisticos('conta-1', ctx)).rejects.toMatchObject({ code: 'CONTA_BANCARIA_INATIVA' });
    expect(db.partidaLancamento.findMany).not.toHaveBeenCalled();
  });

  it('conta PGC partilhada por duas contas bancárias activas → CONTA_PGC_PARTILHADA, sem escrever', async () => {
    db.contaBancaria.count.mockResolvedValue(2);
    const e = await projetarMovimentosContabilisticos('conta-1', ctx).catch((x) => x);
    expect(e).toBeInstanceOf(BusinessRuleError);
    expect(e.code).toBe('CONTA_PGC_PARTILHADA');
    expect(db.contaBancaria.count.mock.calls[0][0].where).toEqual({ tenantId: 'tenant-a', contaContabilId: 'pgc-121', ativo: true });
    expect(db.movimentoContabilistico.createMany).not.toHaveBeenCalled();
  });

  it('CA04: lê as partidas da conta PGC SEM janela de datas, com LANCADO ∪ ESTORNADO', async () => {
    await projetarMovimentosContabilisticos('conta-1', ctx);
    const { where } = db.partidaLancamento.findMany.mock.calls[0][0];
    expect(where).toEqual({ tenantId: 'tenant-a', contaId: 'pgc-121', lancamento: { status: { in: ['LANCADO', 'ESTORNADO'] } } });
    expect(JSON.stringify(where)).not.toMatch(/data/);
  });

  it('projecta uma partida por movimento, idempotente por skipDuplicates, com o número do documento de origem', async () => {
    db.partidaLancamento.findMany.mockResolvedValueOnce([
      partida('p1'),
      partida('p2', { tipo: 'CREDITO', historico: 'Pagamento a fornecedor', lancamento: {
        data: new Date(2026, 8, 3, 12), numero: 'BCO/000200', historico: 'x', documentoOrigemTipo: 'Venda', documentoOrigemId: 'v-1',
      } }),
    ]);
    db.fatura.findMany.mockResolvedValue([{ id: 'fat-45', numero: 'FAT/2026/000045' }]);
    expect(await projetarMovimentosContabilisticos('conta-1', ctx)).toEqual({ criados: 2 });

    expect(db.fatura.findMany.mock.calls[0][0].where).toEqual({ tenantId: 'tenant-a', id: { in: ['fat-45'] } });
    const { data, skipDuplicates } = db.movimentoContabilistico.createMany.mock.calls[0][0];
    expect(skipDuplicates).toBe(true);
    expect(data[0]).toMatchObject({
      tenantId: 'tenant-a', contaBancariaId: 'conta-1', partidaId: 'p1', lancamentoId: 'l-p1',
      documento: 'FAT/2026/000045', referencia: 'FAT/2026/000045', referenciaNormalizada: 'FAT2026000045',
      descricao: 'Recebimento', natureza: 'DEBITO',
    });
    // Documento de outro domínio (Venda): cai no número do lançamento, sem ir buscá-lo.
    expect(data[1]).toMatchObject({ documento: 'BCO/000200', descricao: 'Pagamento a fornecedor', natureza: 'CREDITO' });
  });

  it('percorre as partidas por keyset em lotes, até ao fim', async () => {
    const lote = Array.from({ length: 1000 }, (_, i) => partida(`p${String(i).padStart(4, '0')}`));
    db.partidaLancamento.findMany.mockResolvedValueOnce(lote).mockResolvedValueOnce([partida('p9999')]);
    expect(await projetarMovimentosContabilisticos('conta-1', ctx)).toEqual({ criados: 1001 });
    expect(db.partidaLancamento.findMany.mock.calls[1][0].where.id).toEqual({ gt: 'p0999' });
  });
});
