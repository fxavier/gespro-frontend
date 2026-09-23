/**
 * Testes de correcção do fuso em periodoFiscalDe (ADR-0033 §2).
 *
 * O servidor corre em UTC; o facto fiscal acontece em Africa/Maputo (UTC+2,
 * sem horário de Verão). Uma factura emitida a 1 de Fevereiro às 00h30 de
 * Maputo é gravada como 2026-01-31T22:30Z e, sem a correcção de fuso, cai no
 * período de Janeiro — que pode já estar declarado.
 *
 * Ordem de execução obrigatória (ADR-0033):
 *   1. correr este ficheiro ANTES da correcção → vermelho
 *   2. corrigir periodoFiscalDe → verde
 */
import { describe, it, expect } from 'vitest';
import { periodoFiscalDe } from '../contabilidade.service';

// Africa/Maputo é UTC+2, sem horário de Verão
// 2026-02-01T00:30+02:00  → em UTC é 2026-01-31T22:30Z
const FEV_MAPUTO_EM_UTC = new Date('2026-01-31T22:30:00Z');

// 2026-01-31T23:30+02:00 → em UTC é 2026-01-31T21:30Z  (ainda Janeiro em Maputo)
const JAN_MAPUTO_EM_UTC = new Date('2026-01-31T21:30:00Z');

// 2027-01-01T00:30+02:00 → em UTC é 2026-12-31T22:30Z  (início de ano novo em Maputo)
const JAN2027_MAPUTO_EM_UTC = new Date('2026-12-31T22:30:00Z');

// 2026-12-31T21:30+02:00 → em UTC é 2026-12-31T19:30Z  (ainda Dezembro em Maputo)
const DEZ2026_MAPUTO_EM_UTC = new Date('2026-12-31T19:30:00Z');

describe('periodoFiscalDe — fuso Africa/Maputo (ADR-0033 §2)', () => {
  it('01/Fev/2026 às 00h30 de Maputo (22h30 UTC do dia 31/Jan) → "2026-02"', () => {
    // Este é o teste canónico do ADR-0033 §2.
    // Antes da correcção: usa data.getFullYear()/getMonth() → "2026-01" (UTC → FAIL).
    // Depois da correcção: usa Intl com Africa/Maputo → "2026-02" (PASS).
    expect(periodoFiscalDe(FEV_MAPUTO_EM_UTC)).toBe('2026-02');
  });

  it('31/Jan/2026 às 23h30 de Maputo (21h30 UTC do dia 31/Jan) → "2026-01"', () => {
    // Ainda Janeiro em ambos os fusos — não deve mudar com a correcção.
    expect(periodoFiscalDe(JAN_MAPUTO_EM_UTC)).toBe('2026-01');
  });

  it('01/Jan/2027 às 00h30 de Maputo (22h30 UTC do dia 31/Dez/2026) → "2027-01"', () => {
    // Fronteira de ano: UTC diz Dezembro 2026, Maputo diz Janeiro 2027.
    // Antes da correcção: getFullYear() → 2026, getMonth() → 11 → "2026-12" (FAIL).
    // Depois da correcção: Intl com Africa/Maputo → "2027-01" (PASS).
    expect(periodoFiscalDe(JAN2027_MAPUTO_EM_UTC)).toBe('2027-01');
  });

  it('31/Dez/2026 às 21h30 de Maputo (19h30 UTC do dia 31/Dez/2026) → "2026-12"', () => {
    // Ainda Dezembro em ambos os fusos — não deve mudar com a correcção.
    expect(periodoFiscalDe(DEZ2026_MAPUTO_EM_UTC)).toBe('2026-12');
  });
});
