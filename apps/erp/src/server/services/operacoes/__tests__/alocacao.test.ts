// Testes unitários do serviço de alocação — WS F (Wave 2)
// Porta e actualiza os testes do serviço legado transporte-alocacao.service.ts.

import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import {
  calcularEstadoDocumento,
  verificarConflitosAgenda,
  validarAlocacaoViatura,
  validarAlocacaoMotorista,
} from '../alocacao.service';
import type { AtividadeRef, ViaturaParaAlocacao, MotoristaParaAlocacao } from '../alocacao.interface';

// ============================================================
// calcularEstadoDocumento
// ============================================================

describe('calcularEstadoDocumento', () => {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  it('retorna EXPIRADO para data no passado', () => {
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);
    expect(calcularEstadoDocumento(ontem, 30)).toBe('EXPIRADO');
  });

  it('retorna PROXIMO_EXPIRAR para data dentro do prazo de alerta', () => {
    const em15dias = new Date(hoje);
    em15dias.setDate(em15dias.getDate() + 15);
    expect(calcularEstadoDocumento(em15dias, 30)).toBe('PROXIMO_EXPIRAR');
  });

  it('retorna VALIDO para data além do prazo de alerta', () => {
    const em60dias = new Date(hoje);
    em60dias.setDate(em60dias.getDate() + 60);
    expect(calcularEstadoDocumento(em60dias, 30)).toBe('VALIDO');
  });

  it('retorna PROXIMO_EXPIRAR exactamente no dia limite', () => {
    const emNDias = new Date(hoje);
    emNDias.setDate(emNDias.getDate() + 30);
    expect(calcularEstadoDocumento(emNDias, 30)).toBe('PROXIMO_EXPIRAR');
  });

  it('property: nunca retorna valor fora do conjunto {VALIDO, PROXIMO_EXPIRAR, EXPIRADO}', () => {
    const validos = ['VALIDO', 'PROXIMO_EXPIRAR', 'EXPIRADO'];
    fc.assert(
      fc.property(
        fc.integer({ min: -365, max: 365 }),
        fc.integer({ min: 1, max: 90 }),
        (diasDesdeHoje, prazo) => {
          const data = new Date(hoje);
          data.setDate(data.getDate() + diasDesdeHoje);
          const resultado = calcularEstadoDocumento(data, prazo);
          expect(validos).toContain(resultado);
        },
      ),
    );
  });

  it('property: documento expirado nunca é válido independentemente do prazo', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 365 }),
        fc.integer({ min: 1, max: 60 }),
        (diasNoPassado, prazo) => {
          const data = new Date(hoje);
          data.setDate(data.getDate() - diasNoPassado);
          const resultado = calcularEstadoDocumento(data, prazo);
          expect(resultado).toBe('EXPIRADO');
        },
      ),
    );
  });
});

// ============================================================
// verificarConflitosAgenda
// ============================================================

const criarAtividade = (
  id: string,
  viaturaId: string | null,
  motoristaId: string | null,
  inicioOffset: number,
  fimOffset: number | null,
  estado: AtividadeRef['estado'] = 'EM_CURSO',
): AtividadeRef => {
  const hoje = new Date();
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() + inicioOffset);
  const fim = fimOffset !== null ? new Date(hoje) : null;
  if (fim && fimOffset !== null) fim.setDate(fim.getDate() + fimOffset);

  return {
    id,
    codigo: `AT/${id}`,
    titulo: `Atividade ${id}`,
    dataInicioPrevista: inicio,
    dataConclusaoPrevista: fim,
    estado,
    viaturaId,
    motoristaResponsavelId: motoristaId,
  };
};

describe('verificarConflitosAgenda', () => {
  it('sem atividades → sem conflitos', () => {
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    expect(verificarConflitosAgenda('v1', 'viatura', hoje, amanha, [])).toHaveLength(0);
  });

  it('atividade concluída não gera conflito', () => {
    const atividade = criarAtividade('a1', 'v1', null, 0, 2, 'CONCLUIDA');
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    expect(verificarConflitosAgenda('v1', 'viatura', hoje, amanha, [atividade])).toHaveLength(0);
  });

  it('atividade cancelada não gera conflito', () => {
    const atividade = criarAtividade('a1', 'v1', null, 0, 2, 'CANCELADA');
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    expect(verificarConflitosAgenda('v1', 'viatura', hoje, amanha, [atividade])).toHaveLength(0);
  });

  it('atividade activa da mesma viatura no mesmo período → conflito', () => {
    const atividade = criarAtividade('a1', 'v1', null, 0, 2);
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    const conflitos = verificarConflitosAgenda('v1', 'viatura', hoje, amanha, [atividade]);
    expect(conflitos).toHaveLength(1);
    expect(conflitos[0].atividadeId).toBe('a1');
  });

  it('atividade de viatura diferente não gera conflito', () => {
    const atividade = criarAtividade('a1', 'v2', null, 0, 2);
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    expect(verificarConflitosAgenda('v1', 'viatura', hoje, amanha, [atividade])).toHaveLength(0);
  });

  it('atividade de motorista detecta conflito correctamente', () => {
    const atividade = criarAtividade('a1', null, 'm1', 0, 2);
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    const conflitos = verificarConflitosAgenda('m1', 'motorista', hoje, amanha, [atividade]);
    expect(conflitos).toHaveLength(1);
  });
});

// ============================================================
// validarAlocacaoViatura
// ============================================================

const viaturaValida = (): ViaturaParaAlocacao => ({
  id: 'v1',
  matricula: 'MA-00-AA',
  marca: 'Toyota',
  modelo: 'Hilux',
  documentos: [
    {
      id: 'd1',
      dataValidade: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      prazoAlertaDias: 30,
      estado: 'VALIDO',
    },
  ],
  checklist: null,
});

describe('validarAlocacaoViatura', () => {
  it('viatura válida sem checklist → isValid=true', () => {
    const result = validarAlocacaoViatura(viaturaValida(), new Date());
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('documento expirado → isValid=false', () => {
    const viatura = viaturaValida();
    viatura.documentos[0].estado = 'EXPIRADO';
    const result = validarAlocacaoViatura(viatura, new Date());
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('checklist com item em avaria → isValid=false', () => {
    const viatura = viaturaValida();
    viatura.checklist = {
      dataInspeccao: new Date(),
      itens: [{ nome: 'Pneus', estado: 'AVARIA' }],
    };
    const result = validarAlocacaoViatura(viatura, new Date());
    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toContain('avaria');
  });

  it('checklist com item em falta → isValid=false', () => {
    const viatura = viaturaValida();
    viatura.checklist = {
      dataInspeccao: new Date(),
      itens: [{ nome: 'Triângulo', estado: 'FALTA' }],
    };
    const result = validarAlocacaoViatura(viatura, new Date());
    expect(result.isValid).toBe(false);
  });

  it('checklist com todos os itens OK → isValid=true', () => {
    const viatura = viaturaValida();
    viatura.checklist = {
      dataInspeccao: new Date(),
      itens: [
        { nome: 'Pneus', estado: 'OK' },
        { nome: 'Motor', estado: 'OK' },
      ],
    };
    const result = validarAlocacaoViatura(viatura, new Date());
    expect(result.isValid).toBe(true);
  });

  it('property: viatura com ≥1 doc expirado → sempre isValid=false', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        (numExpirados) => {
          const viatura = viaturaValida();
          for (let i = 0; i < numExpirados; i++) {
            viatura.documentos.push({
              id: `d-exp-${i}`,
              dataValidade: new Date(Date.now() - 24 * 60 * 60 * 1000),
              prazoAlertaDias: 30,
              estado: 'EXPIRADO',
            });
          }
          const result = validarAlocacaoViatura(viatura, new Date());
          expect(result.isValid).toBe(false);
        },
      ),
    );
  });
});

// ============================================================
// validarAlocacaoMotorista
// ============================================================

const motoristaValido = (): MotoristaParaAlocacao => ({
  id: 'm1',
  nomeCompleto: 'João Silva',
  validadeCarta: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  disponibilidade: { disponivel: true, motivo: null },
});

describe('validarAlocacaoMotorista', () => {
  it('motorista válido e disponível → isValid=true', () => {
    const result = validarAlocacaoMotorista(motoristaValido(), new Date());
    expect(result.isValid).toBe(true);
  });

  it('carta expirada → isValid=false', () => {
    const motorista = motoristaValido();
    motorista.validadeCarta = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = validarAlocacaoMotorista(motorista, new Date());
    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toContain('Carta de condução');
  });

  it('motorista indisponível → isValid=false', () => {
    const motorista = motoristaValido();
    motorista.disponibilidade = { disponivel: false, motivo: 'FERIAS' };
    const result = validarAlocacaoMotorista(motorista, new Date());
    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toContain('indisponível');
  });

  it('sem disponibilidade registada → não bloqueia (tratado como disponível)', () => {
    const motorista = motoristaValido();
    motorista.disponibilidade = null;
    const result = validarAlocacaoMotorista(motorista, new Date());
    expect(result.isValid).toBe(true);
  });

  it('property: carta expirada → sempre isValid=false', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 365 }),
        (diasExpirado) => {
          const motorista = motoristaValido();
          motorista.validadeCarta = new Date(Date.now() - diasExpirado * 24 * 60 * 60 * 1000);
          const result = validarAlocacaoMotorista(motorista, new Date());
          expect(result.isValid).toBe(false);
        },
      ),
    );
  });
});
