/**
 * Regularização das vendas convertidas de encomenda antes do #608 (issue #612).
 *
 * Vendas `origem ENCOMENDA` sem `faturaId` e com um lançamento `documentoOrigemTipo 'Venda'`:
 * por venda, numa só transacção, estorna o lançamento antigo e emite o documento fiscal pela via
 * do POS (Factura-Recibo, ou Factura se houver parte a CREDITO), ambos com a data do lançamento
 * antigo. Período fechado ou com IVA apurado → nada escrito para essa venda, motivo no relatório.
 * A lógica vive em `src/server/services/comercial/regularizacao-encomenda.service.ts` (testada em
 * `test/integration/regularizar-encomendas-612.test.ts`); este ficheiro só escolhe tenants e relata.
 *
 * Escreve PELOS SERVIÇOS, nunca por SQL. Corre com `tsx -C react-server` (como o `db:seed`), para
 * que `server-only` resolva para vazio:
 *
 *   npx tsx -C react-server scripts/regularizar-vendas-encomenda.ts                 # dry-run (omissão)
 *   npx tsx -C react-server scripts/regularizar-vendas-encomenda.ts --aplicar       # escreve
 *   npx tsx -C react-server scripts/regularizar-vendas-encomenda.ts --tenant demo   # só um tenant
 *
 * O dry-run corre cada transacção até ao fim e reverte-a: o relatório mostra o documento e o
 * próximo número livre da série; cada simulação reverte, logo todas mostram o mesmo — o `--aplicar`
 * numera-as em sequência.
 * Idempotente: uma venda já com `faturaId` não volta a ser seleccionada.
 */
import 'dotenv/config';
import { prismaBase } from '../src/server/db/client';
import {
  regularizarVendasEncomenda,
  type ResultadoRegularizacao,
} from '../src/server/services/comercial/regularizacao-encomenda.service';

function argumentos() {
  const args = process.argv.slice(2);
  const aplicar = args.includes('--aplicar');
  const i = args.indexOf('--tenant');
  const slug = i >= 0 ? args[i + 1] : undefined;
  if (i >= 0 && !slug) {
    console.error('uso: regularizar-vendas-encomenda.ts [--aplicar] [--tenant <slug>]');
    process.exit(1);
  }
  return { aplicar, slug };
}

const diaMaputo = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Maputo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

function linha(r: ResultadoRegularizacao): string {
  const base = `${r.numero}  ${diaMaputo(r.data)}  ${r.total.padStart(12)} MT  ${r.documento.padEnd(13)}`;
  switch (r.estado) {
    case 'REGULARIZADA':
      return `  ✓ ${base} → ${r.faturaNumero}`;
    case 'SIMULADA':
      return `  · ${base} → emitiria a próxima da série (hoje ${r.faturaNumero})`;
    case 'SALTADA':
      return `  - ${base} → já regularizada entretanto`;
    case 'BLOQUEADA':
      return `  ✗ ${base} → BLOQUEADA ${r.motivo?.codigo}: ${r.motivo?.mensagem}`;
  }
}

async function main() {
  const { aplicar, slug } = argumentos();
  // Tenants com `deletedAt` entram de propósito: nada se apaga nunca (ADR-0027 §6) e um tenant fechado
  // continua a ter livros e acesso de leitura — a venda sem documento fica errada na mesma. Os períodos
  // fechados desses tenants caem no D3 (bloqueio no relatório), não aqui.
  const tenants = await prismaBase.tenant.findMany({
    where: slug ? { slug } : {},
    select: { id: true, slug: true },
    orderBy: { slug: 'asc' },
  });
  if (slug && tenants.length === 0) throw new Error(`Tenant "${slug}" não encontrado`);

  console.log(aplicar ? 'Modo: APLICAR (escreve)' : 'Modo: dry-run (nada é escrito; use --aplicar para escrever)');
  const totais = { REGULARIZADA: 0, SIMULADA: 0, BLOQUEADA: 0, SALTADA: 0 };

  for (const t of tenants) {
    const resultados = await regularizarVendasEncomenda(t.id, { aplicar });
    if (resultados.length === 0) continue;
    console.log(`\nTenant ${t.slug} — ${resultados.length} venda(s)`);
    for (const r of resultados) {
      console.log(linha(r));
      totais[r.estado] += 1;
    }
  }

  console.log(
    `\nResumo: ${totais.REGULARIZADA} regularizada(s), ${totais.SIMULADA} simulada(s), ` +
      `${totais.BLOQUEADA} bloqueada(s), ${totais.SALTADA} saltada(s).`,
  );
  if (totais.BLOQUEADA > 0) process.exitCode = 2;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prismaBase.$disconnect());
