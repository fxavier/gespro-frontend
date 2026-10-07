/**
 * Oráculo da issue #270 (fronteira de domínio) — escrito pelo verificador.
 *
 * Fechar/cancelar o caixa passa a fechar as SessaoPOS dele (comportamento julgado contra a base em
 * test/integration/caixa-sessoes-pos-orfas-270.test.ts). A escrita cruza domínios (finanças →
 * comercial): tem de ir por uma função de contrato publicada pelo comercial, nunca por acesso
 * directo aos modelos do comercial a partir do caixa.service.ts (CLAUDE.md, «Integração entre
 * domínios»). Este teste tranca essa fronteira no texto do serviço.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const fonte = readFileSync(path.resolve(__dirname, '../caixa.service.ts'), 'utf8');

describe('#270 — caixa.service.ts não escreve nos modelos do comercial', () => {
  it.each(['sessaoPOS', 'venda'])('nenhum acesso Prisma directo a `.%s.`', (modelo) => {
    const re = new RegExp(`\\b(?:prisma|prismaBase|tx|db|client)\\s*\\.\\s*${modelo}\\s*\\.`);
    expect(fonte).not.toMatch(re);
  });
});
