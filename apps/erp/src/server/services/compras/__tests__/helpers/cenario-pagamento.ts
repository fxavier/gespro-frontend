/**
 * Cenário partilhado pelos oráculos da issue #78 (registarPagamento por meio).
 * Constrói um duplo com estado já semeado: conta a pagar em aberto, contas PGC,
 * contas bancárias de cada tipo, e (opcionalmente) sessões de caixa.
 */
import { DuploPrisma } from './duplo-prisma';

export const TENANT = 'tenant-78';
export const OUTRO_TENANT = 'tenant-outro';
export const UTILIZADOR = 'user-78';
export const OUTRO_UTILIZADOR = 'user-outro';
export const ctx = { tenantId: TENANT, userId: UTILIZADOR };

export interface Cenario {
  duplo: DuploPrisma;
  contaPagarId: string;
  bancos: {
    corrente: string;      // CORRENTE → PGC 123
    poupanca: string;      // POUPANCA → PGC 1231
    carteira: string;      // CARTEIRA_MOVEL → PGC 1241
    inactiva: string;      // CORRENTE, ativo=false → PGC 123
    outroTenant: string;   // CORRENTE noutro tenant
  };
  codigoPorBanco: Record<string, string>;
  sessaoPropriaId: string | null;
  sessaoAlheiaId: string | null;
}

export function montarCenario(opts: {
  valorOriginal?: string;
  valorPago?: string;
  sessaoPropria?: boolean;
  sessaoAlheia?: boolean;
} = {}): Cenario {
  const duplo = new DuploPrisma();
  duplo.tenantAtual = TENANT;

  const pgc = (codigo: string, tenantId = TENANT) =>
    duplo.semear('contaPGC', {
      tenantId, codigo, nome: `Conta ${codigo}`, classe: 'CLASSE_1', tipo: 'ATIVO',
      natureza: 'DEVEDORA', nivel: codigo.length, contaMaeId: null, aceitaLancamento: true, ativo: true,
    });
  pgc('11'); pgc('111'); pgc('12'); pgc('421');
  const p123 = pgc('123');
  const p1231 = pgc('1231');
  const p1241 = pgc('1241');
  const p123Outro = pgc('123', OUTRO_TENANT);

  const banco = (tipoConta: string, contaContabilId: string, extra: Record<string, unknown> = {}) =>
    duplo.semear('contaBancaria', {
      tenantId: TENANT, banco: 'Banco', agencia: '001', numeroConta: Math.random().toString().slice(2, 12),
      tipoConta, moeda: 'MZN', saldoAtual: '0', contaContabilId, ativo: true, ...extra,
    }).id as string;

  const bancos = {
    corrente: banco('CORRENTE', p123.id),
    poupanca: banco('POUPANCA', p1231.id),
    carteira: banco('CARTEIRA_MOVEL', p1241.id),
    inactiva: banco('CORRENTE', p123.id, { ativo: false }),
    outroTenant: banco('CORRENTE', p123Outro.id, { tenantId: OUTRO_TENANT }),
  };
  const codigoPorBanco = {
    [bancos.corrente]: '123',
    [bancos.poupanca]: '1231',
    [bancos.carteira]: '1241',
  };

  const fornecedor = duplo.semear('fornecedor', { tenantId: TENANT, nome: 'Fornecedor 78', nuit: '400000078' });
  const valorOriginal = opts.valorOriginal ?? '1000.00';
  const valorPago = opts.valorPago ?? '0';
  const restante = (Number(valorOriginal) * 100 - Number(valorPago) * 100) / 100;
  const conta = duplo.semear('contaPagar', {
    tenantId: TENANT, numero: 'CP-2026-00078', fornecedorId: fornecedor.id,
    descricao: 'Factura FRN-78', valorOriginal, valorPago, valorRestante: restante.toFixed(2),
    dataEmissao: new Date('2026-09-01T10:00:00Z'), dataVencimento: new Date('2026-12-01T10:00:00Z'),
    status: Number(valorPago) > 0 ? 'PARCIALMENTE_PAGA' : 'ABERTA',
  });

  const sessao = (responsavelId: string) =>
    duplo.semear('sessaoCaixa', {
      tenantId: TENANT, responsavelId, numero: `CX-${responsavelId}`, dataAbertura: new Date(),
      fundoInicial: '500.00', totalEntradas: '0', totalSaidas: '0', status: 'ABERTA',
    }).id as string;

  // A alheia é semeada primeiro: uma implementação que apanhe «a primeira sessão aberta»
  // sem filtrar pelo responsável cai nela.
  const sessaoAlheiaId = opts.sessaoAlheia ? sessao(OUTRO_UTILIZADOR) : null;
  const sessaoPropriaId = opts.sessaoPropria ? sessao(UTILIZADOR) : null;

  duplo.escritas = 0;
  return { duplo, contaPagarId: conta.id, bancos, codigoPorBanco, sessaoPropriaId, sessaoAlheiaId };
}
