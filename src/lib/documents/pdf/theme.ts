/**
 * Tokens de marca para documentos PDF (motor `@react-pdf/renderer`).
 *
 * Nota: a regra "zero cores hardcoded" do CLAUDE.md aplica-se à UI (tokens
 * `@theme`/Tailwind). Documentos PDF são renderizados fora do DOM e precisam de
 * valores de cor concretos — centralizados AQUI (fonte única) para consistência
 * de marca, à imagem de um tema.
 */
export const PDF_THEME = {
  cor: {
    tinta: '#111827', // texto principal
    suave: '#6B7280', // texto secundário
    linha: '#E5E7EB', // separadores
    fundoCabecalhoTabela: '#F3F4F6',
    marca: '#1E3A8A', // azul institucional
  },
  espaco: {
    pagina: 40,
  },
  fonte: {
    base: 9,
    pequena: 8,
    titulo: 16,
    seccao: 11,
  },
} as const;
