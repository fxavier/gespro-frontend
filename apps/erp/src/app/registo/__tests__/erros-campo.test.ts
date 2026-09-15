/**
 * Todo o erro que o servidor sabe nomear tem de acender NUM CAMPO.
 *
 * O acoplamento que isto guarda: o `RegistoTenantSchema` é da L1, o mapa é do
 * ecrã, e a fronteira partilhada devolve `error.flatten()` — cujas chaves são
 * as de **topo** do schema, não caminhos pontuados. Um campo novo no schema
 * chega ao formulário como uma chave que ninguém conhece, e a mensagem
 * desaparece sem deixar rasto: fica o aviso genérico, e o campo culpado sem
 * marca nenhuma. É a avaria que o `CLAUDE.md` diz já ter acontecido duas vezes.
 *
 * Como confirmar que vale: tirar `admin` do `DESTINO_DO_ERRO`. Acende.
 */
import { describe, it, expect } from 'vitest';
import { RegistoTenantSchema } from '@/lib/validations/onboarding';
import { CAMPO_POR_CODIGO, DESTINO_DO_ERRO } from '../erros-campo';

/** As chaves que a fronteira partilhada devolve DE FACTO, lidas do schema. */
function chavesDoFlatten(): string[] {
  const r = RegistoTenantSchema.safeParse({});
  if (r.success) throw new Error('um corpo vazio tinha de ser recusado');
  return Object.keys(r.error.flatten().fieldErrors);
}

describe('mapeamento de fieldErrors → campo do formulário', () => {
  it('cobre todas as chaves que o `flatten()` do schema produz', () => {
    for (const chave of chavesDoFlatten()) {
      expect(DESTINO_DO_ERRO[chave], `chave \`${chave}\` sem destino`).toBeDefined();
    }
  });

  it('as chaves de grupo apontam ao primeiro campo do grupo, não ao grupo', () => {
    // `form.setError('empresa', …)` não renderiza debaixo de nenhum campo:
    // não há `<FormField name="empresa">`. Tem de apontar a uma folha.
    expect(DESTINO_DO_ERRO.empresa).toBe('empresa.nome');
    expect(DESTINO_DO_ERRO.admin).toBe('admin.nome');
  });

  it('nenhum destino é um grupo — todos são campos que existem no ecrã', () => {
    const folhas = new Set([
      'empresa.nome',
      'empresa.nuit',
      'admin.nome',
      'admin.email',
      'senha',
      'confirmacao',
      'planoId',
      'provincia',
      'captchaToken',
    ]);
    for (const destino of Object.values(DESTINO_DO_ERRO)) {
      expect(folhas.has(destino), `destino \`${destino}\``).toBe(true);
    }
    for (const destino of Object.values(CAMPO_POR_CODIGO)) {
      expect(folhas.has(destino), `destino \`${destino}\``).toBe(true);
    }
  });

  it('os códigos de recusa do provisionamento apontam ao campo culpado', () => {
    expect(CAMPO_POR_CODIGO.EMAIL_JA_REGISTADO).toBe('admin.email');
    expect(CAMPO_POR_CODIGO.NUIT_JA_REGISTADO).toBe('empresa.nuit');
  });
});
