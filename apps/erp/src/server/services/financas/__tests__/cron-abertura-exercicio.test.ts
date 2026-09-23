/**
 * Testes para `deveAbrirHoje` — lógica de decisão do cron diário de abertura
 * de exercício (ADR-0033 §3, decisão de produto: calendário por tenant).
 *
 * A função é pura (sem Prisma, sem I/O), o que permite testar todas as fronteiras
 * relevantes sem mocks.
 *
 * Fronteiras cobertas:
 * - Automático desligado → nunca abre.
 * - Hoje é o dia configurado (dia/mês em Africa/Maputo) → abre.
 * - Hoje não é o dia configurado → não abre.
 * - Fronteira UTC/Maputo: 02:00 UTC = 04:00 Maputo, o dia civil já virou.
 *   Ex.: 1 de Dezembro às 02:00 UTC é o dia 1 de Dezembro em Maputo — deve abrir.
 *   Ex.: 30 de Novembro às 23:00 UTC = 1 de Dezembro 01:00 Maputo — deve abrir.
 *       (UTC diz Novembro, Maputo diz Dezembro: é o de Maputo que manda.)
 */
import { describe, it, expect } from 'vitest';
import { deveAbrirHoje, diaCivilEmMaputo } from '../contabilidade.service';

// Configuração padrão: 1 de Dezembro (os defaults do schema).
const CONFIG_PADRAO = {
  aberturaExercicioAutomatica: true,
  diaAberturaExercicio: 1,
  mesAberturaExercicio: 12,
};

// Africa/Maputo é UTC+2, sem horário de Verão.
// 2026-12-01 02:00 UTC = 2026-12-01 04:00 Africa/Maputo → é 1 de Dezembro em Maputo.
const DIA_CERTO_MAPUTO = new Date('2026-12-01T02:00:00Z');

// 2026-11-30 23:00 UTC = 2026-12-01 01:00 Africa/Maputo → é 1 de Dezembro em Maputo,
// mas 30 de Novembro em UTC. Teste crítico da fronteira de fuso.
const DIA_CERTO_MAPUTO_UTC_DIA_ANTERIOR = new Date('2026-11-30T23:00:00Z');

// 2026-12-01 21:30 UTC = 2026-12-01 23:30 Africa/Maputo → ainda é 1 de Dezembro.
const DIA_CERTO_MAPUTO_FIM = new Date('2026-12-01T21:30:00Z');

// 2026-12-01 22:00 UTC = 2026-12-02 00:00 Africa/Maputo → já é 2 de Dezembro em Maputo.
const DIA_ERRADO_MAPUTO_UTC_AINDA_DIA1 = new Date('2026-12-01T22:00:00Z');

// 2026-12-15 02:00 UTC → 15 de Dezembro em Maputo → não é o dia 1.
const DIA_ERRADO = new Date('2026-12-15T02:00:00Z');

// 2026-11-01 02:00 UTC → 1 de Novembro em Maputo → dia certo mas mês errado.
const MES_ERRADO = new Date('2026-11-01T02:00:00Z');

describe('deveAbrirHoje', () => {
  describe('automático desligado', () => {
    it('devolve false mesmo no dia/mês correcto', () => {
      expect(
        deveAbrirHoje({ ...CONFIG_PADRAO, aberturaExercicioAutomatica: false }, DIA_CERTO_MAPUTO),
      ).toBe(false);
    });
  });

  describe('automático ligado — dia e mês correctos', () => {
    it('abre quando hoje é o dia configurado (02:00 UTC = 04:00 Maputo)', () => {
      expect(deveAbrirHoje(CONFIG_PADRAO, DIA_CERTO_MAPUTO)).toBe(true);
    });

    it('abre quando Maputo já é o dia seguinte mas UTC ainda não (fronteira crítica)', () => {
      // 30/Nov/2026 23:00 UTC = 1/Dez/2026 01:00 Maputo → é o dia certo em Maputo.
      // Sem a correcção de fuso, getDate() UTC devolveria 30, não 1 → não abria.
      expect(deveAbrirHoje(CONFIG_PADRAO, DIA_CERTO_MAPUTO_UTC_DIA_ANTERIOR)).toBe(true);
    });

    it('ainda abre perto do fim do dia em Maputo', () => {
      // 01/Dez 21:30 UTC = 01/Dez 23:30 Maputo → ainda é o dia 1.
      expect(deveAbrirHoje(CONFIG_PADRAO, DIA_CERTO_MAPUTO_FIM)).toBe(true);
    });
  });

  describe('automático ligado — dia ou mês errados', () => {
    it('não abre quando Maputo já passou para o dia seguinte mas UTC ainda diz o dia certo', () => {
      // 01/Dez 22:00 UTC = 02/Dez 00:00 Maputo → já é dia 2 em Maputo, não deve abrir.
      expect(deveAbrirHoje(CONFIG_PADRAO, DIA_ERRADO_MAPUTO_UTC_AINDA_DIA1)).toBe(false);
    });

    it('não abre noutro dia do mesmo mês', () => {
      expect(deveAbrirHoje(CONFIG_PADRAO, DIA_ERRADO)).toBe(false);
    });

    it('não abre no mesmo dia de outro mês', () => {
      expect(deveAbrirHoje(CONFIG_PADRAO, MES_ERRADO)).toBe(false);
    });
  });

  describe('configuração personalizada', () => {
    it('respeita dia/mês diferente dos defaults', () => {
      const config = {
        aberturaExercicioAutomatica: true,
        diaAberturaExercicio: 15,
        mesAberturaExercicio: 11, // 15 de Novembro
      };
      // 15 de Novembro às 02:00 UTC = 15 de Novembro às 04:00 Maputo
      const quinzeDezembro = new Date('2026-11-15T02:00:00Z');
      expect(deveAbrirHoje(config, quinzeDezembro)).toBe(true);

      // Não abre em 1 de Dezembro (que é o default de outro tenant)
      expect(deveAbrirHoje(config, DIA_CERTO_MAPUTO)).toBe(false);
    });

    it('respeita dia 28 (limite máximo configurável)', () => {
      const config = {
        aberturaExercicioAutomatica: true,
        diaAberturaExercicio: 28,
        mesAberturaExercicio: 2, // 28 de Fevereiro
      };
      const vinteOitoFev = new Date('2026-02-28T02:00:00Z');
      expect(deveAbrirHoje(config, vinteOitoFev)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Testes de `diaCivilEmMaputo` — extracção correcta do ano na fronteira anual
// ---------------------------------------------------------------------------

describe('diaCivilEmMaputo — fronteira de ano', () => {
  it('31/Dez às 22h30 UTC = 1/Jan em Maputo: o ano é 2027, não 2026', () => {
    // 2026-12-31T22:30Z = 2027-01-01T00:30+02:00
    // getUTCFullYear() devolveria 2026. O cron usava getUTCFullYear()+1 = 2027 por acidente
    // (no caso de Dezembro funciona; no caso de Janeiro com data configurada para dia 1 mês 1
    // o ano seria calculado em UTC e poderia ser o errado).
    // diaCivilEmMaputo().ano devolve 2027 correctamente.
    const fimAnoUTC = new Date('2026-12-31T22:30:00Z');
    const { dia, mes, ano } = diaCivilEmMaputo(fimAnoUTC);
    expect(ano).toBe(2027);
    expect(mes).toBe(1);
    expect(dia).toBe(1);
  });

  it('tenant configurado para 1 de Janeiro: deveAbrirHoje reconhece o novo ano', () => {
    // Tenant que abre o exercício a 1 de Janeiro — por exemplo para preparar no início
    // do ano em vez de em Dezembro. Na fronteira de fuso, 31/Dez 22:30 UTC = 1/Jan Maputo.
    const configJaneiro = {
      aberturaExercicioAutomatica: true,
      diaAberturaExercicio: 1,
      mesAberturaExercicio: 1,
    };
    const fimAnoUTC = new Date('2026-12-31T22:30:00Z');
    expect(deveAbrirHoje(configJaneiro, fimAnoUTC)).toBe(true);
  });

  it('tenant configurado para 1 de Janeiro, em 31/Dez UTC (Maputo ainda é dia 31): não abre', () => {
    // 31/Dez 19:00 UTC = 31/Dez 21:00 Maputo — ainda é Dezembro/dia 31.
    const configJaneiro = {
      aberturaExercicioAutomatica: true,
      diaAberturaExercicio: 1,
      mesAberturaExercicio: 1,
    };
    const aindaDezembro = new Date('2026-12-31T19:00:00Z');
    expect(deveAbrirHoje(configJaneiro, aindaDezembro)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Teste de cobertura da lógica de dois anos — verificação pelo ano de Maputo
// ---------------------------------------------------------------------------

describe('diaCivilEmMaputo — ano em datas fora de Dezembro', () => {
  it('1/Mar/2027 às 02h UTC: diaCivilEmMaputo devolve ano 2027 (ano corrente em Maputo)', () => {
    // Quando o cron dispara a 1 de Março de 2027, o ano corrente em Maputo é 2027.
    // O cron abre [2027, 2028] — 2027 (corrente, idempotente se já existir) + 2028 (seguinte).
    // Sem esta abertura dupla, um tenant configurado para Março receberia só 2028 aberto,
    // e as vendas de 2027 cairiam na rede de segurança do resolverPeriodo em vez do cron.
    const primMarco27 = new Date('2027-03-01T02:00:00Z');
    const { ano } = diaCivilEmMaputo(primMarco27);
    expect(ano).toBe(2027);
  });
});
