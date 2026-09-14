import { describe, it, expect } from 'vitest';
import { idEntidade } from '../common';
import { AtualizarContaPGCSchema, FiltroRazaoSchema } from '../contabilidade';

describe('idEntidade', () => {
  const schema = idEntidade();

  it('aceita os uuid com que nascem as contas PGC', () => {
    // Exactamente a forma que o `tenant-bootstrap` gera com crypto.randomUUID.
    expect(schema.safeParse('99860c43-83f7-4b41-ae1d-9e895920452a').success).toBe(true);
  });

  it('aceita os cuid que o Prisma gera por omissão', () => {
    expect(schema.safeParse('cmryxs0ig009dwg9kurri602u').success).toBe(true);
  });

  it('continua a recusar lixo', () => {
    for (const mau of ['', 'abc', '123', '../etc/passwd', 'not-a-uuid-at-all']) {
      expect(schema.safeParse(mau).success).toBe(false);
    }
  });
});

describe('os schemas da contabilidade aceitam contas reais', () => {
  const contaUuid = '99860c43-83f7-4b41-ae1d-9e895920452a';

  it('actualizar uma conta com uuid', () => {
    expect(AtualizarContaPGCSchema.safeParse({ id: contaUuid, nome: 'Outro nome' }).success).toBe(
      true,
    );
  });

  it('consultar o razão de uma conta com uuid', () => {
    const r = FiltroRazaoSchema.safeParse({
      contaId: contaUuid,
      dataInicio: '2026-01-01',
      dataFim: '2026-12-31',
    });
    expect(r.success).toBe(true);
  });
});
