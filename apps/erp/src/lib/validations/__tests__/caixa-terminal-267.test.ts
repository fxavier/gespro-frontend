/**
 * Oráculo da issue #267 (nó D:pos-terminais-267) — escrito pelo verificador.
 * Alterar este ficheiro do lado de quem implementa é BLOCKER (doutrina 00 §2).
 *
 * A abertura do caixa recebe o terminal: `AbrirSessaoCaixaSchema` aceita `terminalId` opcional
 * (por `idEntidade()`, não `.cuid()`: cuid do Prisma ou uuid) e NÃO o descarta — o zod tira as
 * chaves desconhecidas, e um `terminalId` tirado no schema chegava ao serviço como «sem terminal»
 * sem erro nenhum. Sem `terminalId` continua válido (caixa sem terminal, comportamento antigo).
 */
import { describe, it, expect } from 'vitest';
import { AbrirSessaoCaixaSchema } from '../caixa';

describe('#267 — AbrirSessaoCaixaSchema leva o terminal', () => {
  it('mantém um terminalId cuid', () => {
    const r: any = AbrirSessaoCaixaSchema.safeParse({ fundoInicial: 1000, terminalId: 'cmryxs0ig009dwg9kurri602u' });
    expect(r.success).toBe(true);
    expect(r.data.terminalId).toBe('cmryxs0ig009dwg9kurri602u');
  });

  it('mantém um terminalId uuid (idEntidade)', () => {
    const r: any = AbrirSessaoCaixaSchema.safeParse({
      fundoInicial: 0,
      terminalId: '99860c43-83f7-4b41-ae1d-9e895920452a',
    });
    expect(r.success).toBe(true);
    expect(r.data.terminalId).toBe('99860c43-83f7-4b41-ae1d-9e895920452a');
  });

  it('recusa um terminalId que não é identificador', () => {
    for (const mau of ['', 'abc', '../etc/passwd']) {
      expect(AbrirSessaoCaixaSchema.safeParse({ fundoInicial: 0, terminalId: mau }).success, `terminalId=${mau}`).toBe(false);
    }
  });

  it('sem terminalId continua válido', () => {
    const r: any = AbrirSessaoCaixaSchema.safeParse({ fundoInicial: 500 });
    expect(r.success).toBe(true);
    expect(r.data.terminalId).toBeUndefined();
  });
});
