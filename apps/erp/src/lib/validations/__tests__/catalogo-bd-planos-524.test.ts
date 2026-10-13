/**
 * Oráculo do nó A:catalogo-bd (issue #524, ADR-0049 §1) — a fronteira Zod deixa de fixar os três
 * códigos de plano: o plano é uma string, e a existência/estado verificam-se no serviço contra a
 * tabela `Plano` (PLANO_INDISPONIVEL — ver test/integration/catalogo-bd-planos-524.test.ts).
 *
 * Escrito pelo VERIFICADOR antes da implementação; quem implementa não o altera (BLOCKER).
 */
import { describe, it, expect } from 'vitest';
import { CheckoutSchema, RegistoTenantSchema } from '@/lib/validations/onboarding';
import { FilterTenantSchema } from '@/lib/validations/plataforma';

const NOVO = 'PLANO_NOVO_2027';

describe('#524 — Zod aceita um código de plano criado na tabela', () => {
  it('CheckoutSchema aceita um código que não é um dos três de origem', () => {
    const r = CheckoutSchema.safeParse({ planoId: NOVO, ciclo: 'MENSAL' });
    expect(r.success, JSON.stringify(r.error?.flatten?.())).toBe(true);
    expect(r.data?.planoId).toBe(NOVO);
  });

  it('CheckoutSchema continua a aceitar os três de origem e a recusar um ciclo inventado', () => {
    for (const p of ['BASICO', 'PROFISSIONAL', 'EMPRESARIAL']) {
      expect(CheckoutSchema.safeParse({ planoId: p, ciclo: 'ANUAL' }).success).toBe(true);
    }
    expect(CheckoutSchema.safeParse({ planoId: 'BASICO', ciclo: 'SEMANAL' }).success).toBe(false);
  });

  it('o registo público aceita um código de plano criado na tabela', () => {
    const r = RegistoTenantSchema.safeParse({
      empresa: { nome: 'Padaria Nova, Lda', nuit: '400123456' },
      admin: { nome: 'Ana Sitoe', email: 'ana@padaria.mz' },
      senha: 'uma-senha-longa-1',
      confirmacao: 'uma-senha-longa-1',
      planoId: NOVO,
      provincia: 'Maputo Cidade',
      captchaToken: 'token',
    });
    const erros = r.success ? {} : r.error.flatten().fieldErrors;
    expect(erros, 'o planoId foi recusado pelo Zod').not.toHaveProperty('planoId');
  });

  it('o filtro da administração de tenants aceita um código de plano criado na tabela', () => {
    const r = FilterTenantSchema.safeParse({ planoAssinatura: NOVO });
    expect(r.success, JSON.stringify(r.error?.flatten?.())).toBe(true);
    expect(r.data?.planoAssinatura).toBe(NOVO);
  });
});
