/**
 * Oráculo da issue #192 — `docs/runbooks/agendador.md` alinhado com o código.
 *
 * Três fontes que têm de dizer a mesma coisa (regra do CLAUDE.md: «uma rota
 * `/api/cron/*` nova entra nos dois sítios ou não corre em lado nenhum»):
 *   1. as rotas que existem: `apps/erp/src/app/api/cron/<nome>/route.ts`;
 *   2. o agendador local: `infra/local/cron/crontab` (`M H * * * chamar /api/cron/<nome>`);
 *   3. o contrato para produção: a tabela de `docs/runbooks/agendador.md`
 *      (`| \`/api/cron/<nome>\` | diário, HH:MM UTC | … |`).
 *
 * Contrato (decisão do orquestrador):
 *   - o conjunto de rotas é igual nas três fontes, sem duplicados;
 *   - o horário de cada rota no runbook é o do crontab (diário, HH:MM UTC);
 *   - se o runbook disser por extenso quantas rotas há («Quatro rotas do ERP…»),
 *     o número é o real;
 *   - o runbook não contradiz o `middleware.ts`: o `/api/cron/` está em `PUBLIC_PATHS`
 *     (o middleware deixa passar; a credencial é o `Bearer <CRON_SECRET>` da própria
 *     rota), logo o runbook não pode afirmar que «não estão em PUBLIC_PATHS». O mesmo
 *     vale para o comentário do `docker-compose.yml` junto ao `CRON_SECRET`;
 *   - os comentários «Agendamento … HH:MM UTC» no cabeçalho de cada `route.ts`
 *     batem com o crontab (a issue cita «comentários das rotas»).
 *
 * Teste de leitura de ficheiros (lógica pura, sem base nem servidor).
 * Escrito pelo autor do oráculo; um agente de implementação que o altere é BLOCKER.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

// __tests__ → cron → api → app → src → erp → apps → raiz da worktree
const RAIZ = path.resolve(__dirname, '../../../../../../..');
const DIR_CRON = path.resolve(__dirname, '..');
const CRONTAB = path.join(RAIZ, 'infra/local/cron/crontab');
const RUNBOOK = path.join(RAIZ, 'docs/runbooks/agendador.md');
const MIDDLEWARE = path.join(RAIZ, 'apps/erp/middleware.ts');
const COMPOSE = path.join(RAIZ, 'docker-compose.yml');

const ler = (f: string) => readFileSync(f, 'utf8');

/** HH:MM com dois dígitos. */
const hhmm = (h: number, m: number) =>
  `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

function rotasExistentes(): string[] {
  return readdirSync(DIR_CRON, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== '__tests__')
    .filter((d) => existsSync(path.join(DIR_CRON, d.name, 'route.ts')))
    .map((d) => `/api/cron/${d.name}`)
    .sort();
}

/** Entradas activas do crontab: rota → horário diário (HH:MM UTC). */
function entradasCrontab(): Array<{ rota: string; horario: string; linha: string }> {
  return ler(CRONTAB)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((linha) => {
      const m = linha.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+chamar\s+(\/api\/cron\/[\w-]+)\s*$/);
      expect(m, `linha do crontab fora do formato esperado: «${linha}»`).not.toBeNull();
      const [, min, hora, dia, mes, semana, rota] = m!;
      expect([dia, mes, semana], `«${linha}» não é diária`).toEqual(['*', '*', '*']);
      return { rota, horario: hhmm(Number(hora), Number(min)), linha };
    });
}

/** Linhas da tabela do contrato no runbook: rota → texto da coluna «Quando». */
function tabelaRunbook(): Array<{ rota: string; quando: string }> {
  return ler(RUNBOOK)
    .split('\n')
    .map((l) => l.match(/^\|\s*`(\/api\/cron\/[\w-]+)`\s*\|\s*([^|]*)\|/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ rota: m[1], quando: m[2].trim() }));
}

function publicPathsDoMiddleware(): string[] {
  const src = ler(MIDDLEWARE);
  const bloco = src.match(/const PUBLIC_PATHS\s*=\s*\[([\s\S]*?)\];/);
  expect(bloco, 'PUBLIC_PATHS não encontrado em middleware.ts').not.toBeNull();
  const semComentarios = bloco![1].replace(/\/\/[^\n]*/g, '');
  return [...semComentarios.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const NUMERAIS: Record<string, number> = {
  uma: 1, duas: 2, 'três': 3, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
};

// Tolera ênfase markdown (`**não**`), quebra de linha e o `#` de continuação de comentário YAML.
const NEGA_PUBLIC_PATHS = /n[ãa]o[\s*#]+est[ãa]o[\s*#]+em[\s*#]+`?PUBLIC_PATHS`?/i;

describe('#192 — rotas /api/cron/* ↔ crontab ↔ runbook', () => {
  it('há rotas de cron (sanidade do caminho)', () => {
    expect(rotasExistentes().length).toBeGreaterThan(0);
  });

  it('o crontab chama exactamente as rotas que existem, cada uma uma vez', () => {
    const doCrontab = entradasCrontab().map((e) => e.rota);
    expect(new Set(doCrontab).size, 'rota repetida no crontab').toBe(doCrontab.length);
    expect([...doCrontab].sort()).toEqual(rotasExistentes());
  });

  it('a tabela do runbook lista exactamente as rotas que existem, cada uma uma vez', () => {
    const doRunbook = tabelaRunbook().map((l) => l.rota);
    expect(new Set(doRunbook).size, 'rota repetida no runbook').toBe(doRunbook.length);
    expect([...doRunbook].sort()).toEqual(rotasExistentes());
  });

  it('o horário de cada rota no runbook é o do crontab (diário, HH:MM UTC)', () => {
    const porRota = new Map(entradasCrontab().map((e) => [e.rota, e.horario]));
    for (const { rota, quando } of tabelaRunbook()) {
      const m = quando.match(/di[áa]rio,\s*(\d{1,2}):(\d{2})\s*UTC/i);
      expect(m, `runbook: «${quando}» para ${rota} não está no formato «diário, HH:MM UTC»`).not.toBeNull();
      expect(hhmm(Number(m![1]), Number(m![2])), `horário de ${rota}`).toBe(porRota.get(rota));
    }
  });

  it('se o runbook disser quantas rotas há, diz o número real', () => {
    const total = rotasExistentes().length;
    const texto = ler(RUNBOOK);
    const contagens = [...texto.matchAll(/\b(\p{L}+)\s+rotas\b/giu)]
      .map((m) => m[1].toLowerCase())
      .filter((p) => p in NUMERAIS);
    for (const p of contagens) {
      expect(NUMERAIS[p], `o runbook diz «${p} rotas»; existem ${total}`).toBe(total);
    }
  });
});

describe('#192 — runbook e compose não contradizem o middleware', () => {
  const cronPublico = () => publicPathsDoMiddleware().some((p) => '/api/cron/x'.startsWith(p));

  it('o middleware deixa passar /api/cron/* (pressuposto do contrato)', () => {
    expect(cronPublico()).toBe(true);
  });

  it('o runbook não afirma que as rotas não estão em PUBLIC_PATHS', () => {
    const texto = ler(RUNBOOK);
    if (cronPublico()) {
      expect(texto).not.toMatch(NEGA_PUBLIC_PATHS);
      expect(texto, 'o runbook deve dizer que /api/cron/ está em PUBLIC_PATHS').toMatch(/PUBLIC_PATHS/);
    }
  });

  it('o comentário do CRON_SECRET no docker-compose.yml não afirma o contrário', () => {
    if (cronPublico()) expect(ler(COMPOSE)).not.toMatch(NEGA_PUBLIC_PATHS);
  });
});

describe('#192 — comentários de agendamento nas rotas batem com o crontab', () => {
  const porRota = () => new Map(entradasCrontab().map((e) => [e.rota, e.horario]));

  for (const rota of rotasExistentes()) {
    it(`${rota}: «Agendamento … HH:MM UTC» = crontab`, () => {
      const nome = rota.replace('/api/cron/', '');
      const src = ler(path.join(DIR_CRON, nome, 'route.ts'));
      const mencoes = [...src.matchAll(/Agendamento[^\n]*?(\d{1,2}):(\d{2})\s*UTC/gi)];
      for (const m of mencoes) {
        expect(hhmm(Number(m[1]), Number(m[2])), `comentário em ${nome}/route.ts: «${m[0]}»`).toBe(
          porRota().get(rota),
        );
      }
    });
  }
});
