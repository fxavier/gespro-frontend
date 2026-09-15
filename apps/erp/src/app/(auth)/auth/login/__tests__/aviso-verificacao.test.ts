/**
 * O ecrã de login tem de dizer o que aconteceu à confirmação de e-mail.
 *
 * `GET /api/publico/verificar-email` responde 303 para
 * `/auth/login?verificacao=<desfecho>` sempre que quem abre a ligação NÃO tem
 * sessão — o caso normal, porque a ligação chega por correio e abre-se muitas
 * vezes noutro dispositivo. Enquanto ninguém lia esse parâmetro, a pessoa
 * confirmava o endereço e aterrava num ecrã mudo.
 *
 * O acoplamento que este teste guarda: os desfechos são declarados na rota e
 * consumidos aqui, em ficheiros de lanes diferentes. Um sexto desfecho na
 * rota, sem entrada no ecrã, volta a produzir o ecrã mudo — em silêncio.
 *
 * Como confirmar que vale: apagar uma entrada de `AVISOS` (ou acrescentar um
 * desfecho ao `type Desfecho` da rota). Acende.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DESFECHOS_VERIFICACAO } from '../aviso-verificacao';

function desfechosDaRota(): string[] {
  const fonte = readFileSync(
    path.join(process.cwd(), 'src/app/api/publico/verificar-email/route.ts'),
    'utf-8',
  );
  const m = /type\s+Desfecho\s*=\s*([^;]+);/.exec(fonte);
  if (!m) throw new Error('`type Desfecho` não encontrado na rota de verificação');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

describe('avisos de ?verificacao= no ecrã de login', () => {
  it('cobre todos os desfechos que a rota pública sabe produzir', () => {
    expect([...DESFECHOS_VERIFICACAO].sort()).toEqual(desfechosDaRota().sort());
  });

  it('inclui o desfecho feliz — confirmar e não ver nada é o defeito original', () => {
    expect(DESFECHOS_VERIFICACAO).toContain('ok');
  });
});
