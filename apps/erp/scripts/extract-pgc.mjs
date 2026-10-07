/**
 * Script de extracção do Plano de Contas PGC-NIRF (Decreto 70/2009).
 * Lê o ficheiro XLSX e gera prisma/seed/data/plano-contas-pgc.json.
 *
 * Colunas detectadas: Classe, Nome da Classe, Código, Descrição, Nível, Observações
 *
 * Uso: node scripts/extract-pgc.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const INPUT = path.join(ROOT, 'docs/plano_contas/Plano_de_Contas_Decreto_70-2009.xlsx');
const OUTPUT = path.join(ROOT, 'prisma/seed/data/plano-contas-pgc.json');

function normalizeCodigo(codigo) {
  // Remove pontos: "1.2.3" → "123"
  return String(codigo ?? '').trim().replace(/\./g, '');
}

function contaPaiCodigo(codigoSemPontos) {
  if (codigoSemPontos.length <= 1) return null;
  return codigoSemPontos.slice(0, -1);
}

// A FONTE DE VERDADE da natureza é prisma/seed/data/plano-contas-pgc.json, revisto à mão
// (classes 6/7 em 2026-09; classe 4 conta a conta na #295) e trancado por testes em
// tenant-bootstrap.test.ts. Esta tabela só reproduz o ficheiro para uma re-extracção não
// o estragar; se divergirem, quem manda é o JSON.
//
// Classe 4 (Terceiros) não tem natureza única: é decidida por prefixo de código.
// Credoras (passivos e contrapartidas a crédito): 419, 42 (excepto 429), 43, 442, 4433
// (IVA liquidado), 44342, 4436, 449, 46, 47, 48, 491, 492. O resto é DEVEDORA — incluindo
// as ambíguas 441 (IRPC), 4435 (apuramento do IVA), 445 e 446, cujo saldo muda de lado
// com o período: ficam DEVEDORA por convenção, e o balancete mostra o lado do saldo.
const CLASSE_4_CREDORA = ['419', '42', '43', '442', '4433', '44342', '4436', '449', '46', '47', '48', '491', '492'];
const CLASSE_4_DEVEDORA_EXCEPCOES = ['429'];

function inferNatureza(classe, codigo = String(classe)) {
  // PGC-NIRF Moçambique (Decreto 70/2009):
  if (classe === 4) {
    const credora =
      CLASSE_4_CREDORA.some((p) => codigo.startsWith(p)) &&
      !CLASSE_4_DEVEDORA_EXCEPCOES.some((p) => codigo.startsWith(p));
    return credora ? 'CREDORA' : 'DEVEDORA';
  }
  if ([1, 2, 3, 6].includes(classe)) return 'DEVEDORA'; // activos e gastos
  return 'CREDORA'; // 5 (Capital próprio), 7 (Rendimentos), 8 (Resultados)
}

async function main() {
  console.log('Lendo ficheiro XLSX:', INPUT);
  const buffer = await readFile(INPUT);
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const sheetName = workbook.SheetNames[0];
  console.log('Sheet:', sheetName);
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  console.log(`Total de linhas: ${rows.length}`);

  // Extrair nomes das classes (nível 1) — existem no campo "Nome da Classe"
  const classeNomes = {};
  for (const row of rows) {
    const classeRaw = parseInt(String(row['Classe'] ?? ''), 10);
    const nomeClasse = String(row['Nome da Classe'] ?? '').trim();
    if (!isNaN(classeRaw) && classeRaw >= 1 && classeRaw <= 8 && nomeClasse && !classeNomes[classeRaw]) {
      classeNomes[classeRaw] = nomeClasse;
    }
  }

  const contas = [];

  // Adicionar contas raiz de classe (nível 1) — não estão no XLSX como linhas
  for (let c = 1; c <= 8; c++) {
    const nomeClasse = classeNomes[c] ?? `Classe ${c}`;
    contas.push({
      codigo: String(c),
      codigoOriginal: String(c),
      nome: `Classe ${c} — ${nomeClasse}`,
      classe: c,
      nivel: 1,
      contaPaiCodigo: null,
      aceitaLancamento: false,
      natureza: inferNatureza(c),
    });
  }

  // Extrair contas do XLSX (níveis 2+)
  for (const row of rows) {
    const classeRaw = row['Classe'];
    const codigoRaw = String(row['Código'] ?? '').trim();
    const descricao = String(row['Descrição'] ?? '').trim();
    const nivelRaw = row['Nível'];

    if (!codigoRaw || !descricao) continue;
    const classe = parseInt(String(classeRaw), 10);
    if (isNaN(classe) || classe < 1 || classe > 8) continue;
    const nivel = parseInt(String(nivelRaw), 10);
    if (isNaN(nivel)) continue;

    const codigoSemPontos = normalizeCodigo(codigoRaw);
    const pai = contaPaiCodigo(codigoSemPontos);

    const obs = String(row['Observações'] ?? '').toLowerCase();
    // Aceita lançamento: nível 3+ é tipicamente folha; explicitamente marcado nas obs
    const aceitaLancamento = nivel >= 3 || obs.includes('movimento');

    contas.push({
      codigo: codigoSemPontos,
      codigoOriginal: codigoRaw,
      nome: descricao,
      classe,
      nivel,
      contaPaiCodigo: pai,
      aceitaLancamento,
      natureza: inferNatureza(classe, codigoSemPontos),
    });
  }

  // Ordenar: primeiro por classe, depois por código original segmento a segmento
  contas.sort((a, b) => {
    if (a.classe !== b.classe) return a.classe - b.classe;
    const partsA = a.codigoOriginal.split('.').map(Number);
    const partsB = b.codigoOriginal.split('.').map(Number);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });

  console.log(`\nContas extraídas: ${contas.length} (incluindo ${Object.keys(classeNomes).length} classes raiz)`);

  const porClasse = {};
  const porNivel = {};
  for (const c of contas) {
    porClasse[c.classe] = (porClasse[c.classe] ?? 0) + 1;
    porNivel[c.nivel] = (porNivel[c.nivel] ?? 0) + 1;
  }
  console.log('Por classe:', porClasse);
  console.log('Por nível:', porNivel);

  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(contas, null, 2), 'utf-8');
  console.log(`\nFicheiro gerado: ${OUTPUT}`);
  console.log('Amostra (primeiras 5 contas):');
  console.log(JSON.stringify(contas.slice(0, 5), null, 2));
}

main().catch((e) => {
  console.error('Erro:', e);
  process.exit(1);
});
