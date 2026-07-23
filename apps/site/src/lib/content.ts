import "server-only";

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";

/**
 * Camada de conteúdo — MDX file-based (Requisito 4).
 *
 * Porquê ficheiros e não um CMS: o volume actual é baixo, os autores são a
 * própria equipa e o conteúdo beneficia de revisão em PR como o resto do
 * código. A migração para CMS headless (Sanity/Contentlayer) fica anotada como
 * opção futura em ADR-0007 §Alternativas — o ponto de troca é este módulo:
 * as páginas só conhecem `listar()` / `obter()`, não o sistema de ficheiros.
 *
 * O frontmatter é validado com Zod no carregamento: um artigo mal formado falha
 * o build (`generateStaticParams` corre em build), nunca chega a produção meio
 * renderizado.
 */

const RAIZ_CONTEUDO = path.join(process.cwd(), "content");

export const COLECCOES = ["blog", "recursos", "legal"] as const;
export type Coleccao = (typeof COLECCOES)[number];

const frontmatterSchema = z.object({
  titulo: z.string().min(1),
  resumo: z.string().min(1),
  /** ISO `YYYY-MM-DD`. `gray-matter` pode devolver `Date` — normalizado abaixo. */
  data: z
    .union([z.string(), z.date()])
    .transform((v) =>
      v instanceof Date ? v.toISOString().slice(0, 10) : v.trim()
    )
    .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), {
      message: "Data deve estar no formato YYYY-MM-DD",
    }),
  autor: z.string().min(1),
  imagemOg: z.string().optional(),
  etiquetas: z.array(z.string()).default([]),
  destaque: z.boolean().default(false),
  rascunho: z.boolean().default(false),
});

export type Frontmatter = z.infer<typeof frontmatterSchema>;

export interface Documento extends Frontmatter {
  slug: string;
  coleccao: Coleccao;
  corpo: string;
  minutosLeitura: number;
}

const PALAVRAS_POR_MINUTO = 200;

function calcularLeitura(corpo: string): number {
  const palavras = corpo.trim().split(/\s+/u).length;
  return Math.max(1, Math.round(palavras / PALAVRAS_POR_MINUTO));
}

function directorio(coleccao: Coleccao): string {
  return path.join(RAIZ_CONTEUDO, coleccao);
}

function ler(coleccao: Coleccao, ficheiro: string): Documento {
  const caminho = path.join(directorio(coleccao), ficheiro);
  const bruto = fs.readFileSync(caminho, "utf8");
  const { data, content } = matter(bruto);

  const validado = frontmatterSchema.safeParse(data);
  if (!validado.success) {
    const detalhe = validado.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(
      `Frontmatter inválido em content/${coleccao}/${ficheiro} — ${detalhe}`
    );
  }

  return {
    ...validado.data,
    slug: ficheiro.replace(/\.mdx?$/, ""),
    coleccao,
    corpo: content,
    minutosLeitura: calcularLeitura(content),
  };
}

/** Todos os documentos publicados de uma colecção, do mais recente para o mais antigo. */
export function listar(coleccao: Coleccao): Documento[] {
  const dir = directorio(coleccao);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".mdx") || f.endsWith(".md"))
    .map((f) => ler(coleccao, f))
    .filter((d) => !d.rascunho || process.env.NODE_ENV !== "production")
    .sort((a, b) => b.data.localeCompare(a.data));
}

/** Artigos que alimentam `/recursos` — blog e recursos fundidos numa só lista. */
export function listarArtigos(): Documento[] {
  return [...listar("blog"), ...listar("recursos")].sort((a, b) =>
    b.data.localeCompare(a.data)
  );
}

/** Um documento por slug. Devolve `null` (e não lança) para a página fazer `notFound()`. */
export function obter(coleccao: Coleccao, slug: string): Documento | null {
  for (const extensao of [".mdx", ".md"]) {
    const caminho = path.join(directorio(coleccao), `${slug}${extensao}`);
    if (fs.existsSync(caminho)) return ler(coleccao, `${slug}${extensao}`);
  }
  return null;
}

/** Um artigo por slug, procurando em ambas as colecções editoriais. */
export function obterArtigo(slug: string): Documento | null {
  return obter("blog", slug) ?? obter("recursos", slug);
}

/** Slugs para `generateStaticParams` de `/recursos/[slug]`. */
export function slugsDeArtigos(): string[] {
  return listarArtigos().map((d) => d.slug);
}

/** Etiquetas distintas presentes nos artigos publicados, por ordem alfabética. */
export function etiquetas(): string[] {
  const conjunto = new Set<string>();
  for (const doc of listarArtigos()) {
    for (const e of doc.etiquetas) conjunto.add(e);
  }
  return [...conjunto].sort((a, b) => a.localeCompare(b, "pt"));
}

/** Artigos com etiquetas em comum, excluindo o próprio. */
export function relacionados(doc: Documento, limite = 2): Documento[] {
  return listarArtigos()
    .filter(
      (outro) =>
        outro.slug !== doc.slug &&
        outro.etiquetas.some((e) => doc.etiquetas.includes(e))
    )
    .slice(0, limite);
}

export { frontmatterSchema };
