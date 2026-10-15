/**
 * Oráculo da issue #536 (nó F:docs-plataforma) — a documentação da área de plataforma alinha com o
 * código entregue nos #523–#532. Escrito pelo VERIFICADOR; alterá-lo do lado de quem implementa é
 * BLOCKER.
 *
 * A. ADR-0049: o plano arquivado é `arquivadoEm DateTime?` (como em `prisma/schema/plataforma.prisma`),
 *    não `arquivado Boolean` nem `arquivado = true`.
 * B. `CLAUDE.md` da raiz: o catálogo vive na tabela `Plano` (gerido em `/plataforma/planos`, nunca uma
 *    constante); `PLANO_INDISPONIVEL`; Price ID da tabela ?? `STRIPE_PRICE_<CODIGO>_<CICLO>`; papel
 *    Keycloak `plataforma-admin`, sessão sem tenant, `createSafeAction({ plataforma: true })`;
 *    trilho `AuditoriaPlataforma` fora do `AuditLog`; o `next dev` só carrega o middleware/proxy a
 *    partir de `src/`.
 * C. `docs/status.md` regista a entrega do catálogo de planos / administrador de plataforma.
 * D. Nenhum dos dois documentos diz que os planos vivem numa constante.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), 'utf8');

const ADR = 'docs/decisions/ADR-0049-catalogo-planos-administrador-plataforma.md';

/** «os planos vivem/estão numa constante», «catálogo numa constante», «PLANOS constante» no presente. */
const RE_PLANOS_EM_CONSTANTE =
  /(planos|cat[áa]logo)\s+(vivem|vive|est[ãa]o|est[áa]|ficam|fica|s[ãa]o|[ée])\s+(definid[oa]s?\s+)?(n[ua]ma?|em)\s+(uma\s+)?constante/i;
const RE_TRES = /tr[êe]s\s+(escal[õo]es|planos)(?!\s+de\s+origem)/i;

describe('#536 A — ADR-0049 alinhado com o schema', () => {
  const adr = ler(ADR);
  const schema = ler('apps/erp/prisma/schema/plataforma.prisma');

  it('o schema tem mesmo `arquivadoEm DateTime?` (premissa)', () => {
    expect(schema).toMatch(/^\s*arquivadoEm\s+DateTime\?/m);
  });

  it('o ADR não define `arquivado Boolean`', () => {
    expect(adr).not.toMatch(/^\s*arquivado\s+Boolean\b/m);
  });

  it('o ADR não diz `arquivado = true`', () => {
    expect(adr).not.toMatch(/arquivado\s*=\s*true/);
  });

  it('o modelo do ADR declara `arquivadoEm DateTime?`', () => {
    expect(adr).toMatch(/^\s*arquivadoEm\s+DateTime\?/m);
  });

  it('o ADR não diz que os planos vivem numa constante', () => {
    expect(adr).not.toMatch(RE_PLANOS_EM_CONSTANTE);
  });
});

describe('#536 B — CLAUDE.md da raiz descreve a área de plataforma', () => {
  const md = ler('CLAUDE.md');

  it('menciona a tabela `Plano` e o ADR-0049', () => {
    expect(md).toMatch(/tabela\s+(global\s+)?`Plano`/i);
    expect(md).toMatch(/ADR-0049/);
  });

  it('menciona o ecrã `/plataforma/planos`', () => {
    expect(md).toMatch(/\/plataforma\/planos/);
  });

  it('menciona `PLANO_INDISPONIVEL`', () => {
    expect(md).toMatch(/PLANO_INDISPONIVEL/);
  });

  it('menciona o recurso `STRIPE_PRICE_<CODIGO>_<CICLO>`', () => {
    expect(md).toMatch(/STRIPE_PRICE_<CODIGO>_<CICLO>/);
  });

  it('menciona o papel Keycloak `plataforma-admin`', () => {
    expect(md).toMatch(/`plataforma-admin`/);
  });

  it('menciona `createSafeAction({ plataforma: true })` / `plataforma: true`', () => {
    expect(md).toMatch(/plataforma:\s*true/);
  });

  it('diz que a sessão de plataforma não tem tenant', () => {
    expect(md).toMatch(/sem\s+`?tenant(Id)?`?/i);
  });

  it('menciona `AuditoriaPlataforma` e distingue-a do `AuditLog`', () => {
    expect(md).toMatch(/`AuditoriaPlataforma`/);
    const i = md.indexOf('AuditoriaPlataforma');
    const vizinhanca = md.slice(Math.max(0, i - 400), i + 400);
    expect(vizinhanca).toMatch(/AuditLog/);
  });

  it('diz que o `next dev` só carrega o middleware/proxy a partir de `src/`', () => {
    expect(md).toMatch(/next dev[^\n]*(\n[^\n]*){0,3}?src\/(middleware|proxy)/i);
  });

  it('não diz que os planos vivem numa constante', () => {
    expect(md).not.toMatch(RE_PLANOS_EM_CONSTANTE);
  });

  it('não diz que há três planos/escalões', () => {
    expect(md).not.toMatch(RE_TRES);
  });
});

describe('#536 C — docs/status.md regista a entrega', () => {
  const status = ler('docs/status.md');

  it('tem uma secção que cita o ADR-0049', () => {
    expect(status).toMatch(/^##\s+.*ADR-0049/m);
  });

  it('cita as issues/PRs da entrega (#523 a #532)', () => {
    expect(status).toMatch(/#523/);
    expect(status).toMatch(/#532/);
  });
});
