/**
 * #185 — o ecrã de login tem mensagem própria para o convite por concluir.
 *
 * O motivo nasce em `server/auth/direct-grant.ts`, viaja como `code` do
 * `CredentialsSignin` (`MotivoRecusaLogin`, em `lib/auth.ts`) e é traduzido no
 * `login-form.tsx` (cliente). São três ficheiros sem import comum que o `tsc`
 * possa vigiar: um motivo novo sem entrada no mapa cai na mensagem genérica
 * («Não foi possível iniciar sessão») — em silêncio. Mesmo molde de
 * `aviso-verificacao.test.ts`: lê-se a fonte.
 *
 * `conta-por-activar` é a única excepção ao mapa: não mostra mensagem, leva ao
 * ecrã da palavra-passe provisória (ADR-0030 §4).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function fonte(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), 'utf-8');
}

function motivosDeRecusaLogin(): string[] {
  const m = /type\s+MotivoRecusaLogin\s*=\s*([^;]+);/.exec(fonte('src/lib/auth.ts'));
  if (!m) throw new Error('`type MotivoRecusaLogin` não encontrado em src/lib/auth.ts');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

function mensagensDoLogin(): Map<string, string> {
  const src = fonte('src/app/(auth)/auth/login/login-form.tsx');
  const m = /const\s+MENSAGENS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(src);
  if (!m) throw new Error('`MENSAGENS` não encontrado em login-form.tsx');
  const corpo = m[1].replace(/\/\/.*$/gm, '');
  const mapa = new Map<string, string>();
  for (const e of corpo.matchAll(/(?:'([^']+)'|([A-Za-z_]\w*))\s*:\s*((?:'[^']*'\s*\+?\s*)+)/g)) {
    const chave = e[1] ?? e[2];
    const texto = [...e[3].matchAll(/'([^']*)'/g)].map((x) => x[1]).join('');
    mapa.set(chave, texto);
  }
  return mapa;
}

describe('#185 — convite por concluir no login', () => {
  it('`convite-por-concluir` é um motivo de recusa do login', () => {
    expect(motivosDeRecusaLogin()).toContain('convite-por-concluir');
  });

  it('o ecrã tem mensagem própria para ele, que fala do convite', () => {
    const texto = mensagensDoLogin().get('convite-por-concluir');
    expect(texto, 'sem entrada em MENSAGENS cai na mensagem genérica').toBeTruthy();
    expect(texto).toMatch(/convite/i);
    // Não é «dados errados»: a palavra-passe estava certa.
    expect(texto).not.toMatch(/incorrect/i);
  });

  it('todos os motivos, menos `conta-por-activar`, têm mensagem no ecrã', () => {
    const mapa = mensagensDoLogin();
    const semMensagem = motivosDeRecusaLogin().filter(
      (m) => m !== 'conta-por-activar' && !mapa.has(m),
    );
    expect(semMensagem).toEqual([]);
  });
});
