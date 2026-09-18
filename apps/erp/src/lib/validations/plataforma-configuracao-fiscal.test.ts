import { describe, it, expect } from 'vitest';
import { ConfiguracaoFiscalSchema } from './plataforma';

/**
 * O ecrã de configuração fiscal é editado pelo ADMIN do próprio Tenant. Dois
 * campos NÃO lhe pertencem: o interruptor de bloqueio de acesso e o Plano.
 * Aceitá-los aqui deixava o ADMIN de um Tenant suspenso desbloquear-se a si
 * próprio e promover-se de Plano (ADR-0027 §5/§6, issue #31).
 *
 * O Zod remove chaves desconhecidas por omissão — é por isso que ausentar os
 * campos do schema basta: nunca chegam ao serviço.
 */
describe('ConfiguracaoFiscalSchema — campos de subscrição', () => {
  const valido = { regimeIva: 'NORMAL' as const, taxaIvaDefault: 0.16, cidade: 'Maputo' };

  it('descarta o interruptor de bloqueio enviado pelo cliente', () => {
    const out = ConfiguracaoFiscalSchema.parse({ ...valido, statusAtivo: true });
    expect(out).not.toHaveProperty('statusAtivo');
  });

  it('descarta o Plano enviado pelo cliente', () => {
    const out = ConfiguracaoFiscalSchema.parse({ ...valido, planoAssinatura: 'EMPRESARIAL' });
    expect(out).not.toHaveProperty('planoAssinatura');
  });

  it('mantém os campos que são mesmo do Tenant', () => {
    const out = ConfiguracaoFiscalSchema.parse({
      ...valido,
      statusAtivo: true,
      planoAssinatura: 'EMPRESARIAL',
      email: 'geral@empresa.mz',
      timezone: 'Africa/Maputo',
    });
    expect(out).toMatchObject({
      regimeIva: 'NORMAL',
      taxaIvaDefault: 0.16,
      cidade: 'Maputo',
      email: 'geral@empresa.mz',
      timezone: 'Africa/Maputo',
    });
  });
});
