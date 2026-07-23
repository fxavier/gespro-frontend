#!/usr/bin/env node
/**
 * Gate: zero cores hardcoded fora de `packages/brand` e do `@theme` do site
 * (Requisito 2.3 / critério de aceitação 2).
 *
 * Procura literais de cor (`#rgb`, `rgb()`, `hsl()`, `oklch()`) em todo o
 * código-fonte do site e falha se aparecerem fora dos ficheiros autorizados.
 *
 * Único ficheiro autorizado: `src/app/theme.css` — é o `@theme` do site.
 * Contextos que não resolvem custom properties (barra do browser, `next/og`,
 * favicons) importam de `packages/brand/cores.json`, não declaram literais.
 * `public/` fica fora do varrimento: são assets estáticos servidos a terceiros.
 *
 * Uso: `pnpm --filter site gate:cores`
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const DIRECTORIOS = ["src", "content", "messages"];
const EXTENSOES = [".ts", ".tsx", ".css", ".mdx", ".json"];

const AUTORIZADOS = new Set(
  ["src/app/theme.css"].map((p) => p.split("/").join(sep))
);

const PADRAO_COR =
  /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\boklab\(|\bcolor-mix\(/g;

/** `color-mix(in oklch, var(--token) …)` só combina tokens — não é literal. */
const LINHA_SEGURA = /color-mix\([^)]*var\(--/;

function* ficheiros(directorio) {
  for (const entrada of readdirSync(directorio)) {
    if (entrada === "node_modules" || entrada.startsWith(".")) continue;
    const caminho = join(directorio, entrada);
    if (statSync(caminho).isDirectory()) {
      yield* ficheiros(caminho);
    } else if (EXTENSOES.some((e) => entrada.endsWith(e))) {
      yield caminho;
    }
  }
}

const violacoes = [];

for (const directorio of DIRECTORIOS) {
  const absoluto = join(RAIZ, directorio);
  try {
    statSync(absoluto);
  } catch {
    continue;
  }

  for (const caminho of ficheiros(absoluto)) {
    const relativo = relative(RAIZ, caminho);
    if (AUTORIZADOS.has(relativo)) continue;

    const linhas = readFileSync(caminho, "utf8").split("\n");
    linhas.forEach((linha, indice) => {
      if (LINHA_SEGURA.test(linha)) return;
      const encontrados = linha.match(PADRAO_COR);
      if (encontrados) {
        violacoes.push(
          `${relativo}:${indice + 1}  ${encontrados.join(", ")}  →  ${linha.trim().slice(0, 100)}`
        );
      }
    });
  }
}

if (violacoes.length > 0) {
  console.error(
    `\n✖ Gate de cores: ${violacoes.length} literal(is) de cor fora de packages/brand e do @theme do site:\n`
  );
  for (const violacao of violacoes) console.error(`  ${violacao}`);
  console.error(
    "\n  Usar tokens (`bg-primary`, `text-muted-foreground`, `var(--…)`).\n" +
      "  Tokens novos vão para src/app/theme.css ou packages/brand/tokens.css.\n"
  );
  process.exit(1);
}

console.log("✓ Gate de cores: zero literais fora de packages/brand e do @theme.");
