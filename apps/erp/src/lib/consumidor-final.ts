/**
 * Cliente técnico «Consumidor Final» (ADR-0041 §2): cada tenant tem um, criado no
 * bootstrap e, para os tenants que já existiam, na migração. Uma venda POS sem
 * cliente factura contra ele — `Fatura.clienteId` continua obrigatório.
 *
 * A migração `*_pos_consumidor_final_fr` repete estes valores em SQL: mudar um é mudar os dois.
 */
export const CLIENTE_CONSUMIDOR_FINAL = {
  codigo: 'CF-000000',
  nuit: '999999999',
  nome: 'Consumidor Final',
  tipo: 'FISICA',
  // Cliente.email/telefone são obrigatórios no schema; o cliente técnico não os tem.
  email: '',
  telefone: '',
} as const;
