/**
 * Wiring das dependências do WS C (Wave 3 — integração real)
 *
 * Substitui os stubs da Wave 2 pelas implementações reais de:
 *  - WS A: stockService (baixarStock, reservarStock, libertarStock, entradaStock, confirmarConsumoStock)
 *  - WS D: caixaService (registarMovimentoCaixa), faturacaoService (proximoNumeroSerie)
 */
import 'server-only';

import { stockService } from '@/server/services/inventario/stock.service';
import { caixaService } from '@/server/services/financas/caixa.service';
import { faturacaoService } from '@/server/services/financas/faturacao.service';
import { VendaService, SessaoPOSService } from './venda.service';
import { ComissaoService } from './comissao.service';

// ---------------------------------------------------------------------------
// Instâncias singleton com wiring real
// ---------------------------------------------------------------------------

const _comissaoService = new ComissaoService();

export const vendaService = new VendaService(
  stockService,
  caixaService,
  faturacaoService,
  _comissaoService,
);

export const sessaoPOSService = new SessaoPOSService();

// Re-exportar os singletons que já existem nos ficheiros individuais
export { clienteService } from './cliente.service';
export { comissaoService } from './comissao.service';

// Re-exportar tipos para uso nos actions
export type { IStockService } from '@/server/services/inventario/stock.interface';
export type { ICaixaService, IFaturacaoService } from '@/server/services/financas';
