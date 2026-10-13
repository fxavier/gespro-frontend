#!/usr/bin/env python3
"""Gera docs/manual/GestPro-Manual-de-Utilizador.pdf a partir dos capítulos Markdown.

Os Markdown são a fonte de verdade; o PDF regenera-se, nunca se edita à mão.

Uso (na raiz do repositório):
    pip install markdown-it-py playwright pillow pypdf && playwright install chromium   # uma vez (pillow e pypdf são opcionais)
    python3 docs/manual/tools/build_pdf.py [--out caminho.pdf] [--html caminho.html]

O que faz:
  * junta capa, índice e os capítulos NN-*.md por ordem numérica;
  * gera âncoras ao estilo do GitHub (as mesmas que os .md já usam) e prefixa-as por
    capítulo, para que as ligações entre capítulos funcionem dentro do PDF;
  * ligações para ficheiros fora do manual (ADRs, CONTEXT.md…) ficam como texto;
  * embebe as capturas de img/ e acrescenta marcadores (outline) e numeração de páginas.
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import re
import sys
from pathlib import Path
from urllib.parse import unquote

from markdown_it import MarkdownIt

MANUAL_DIR = Path(__file__).resolve().parents[1]
DEFAULT_OUT = MANUAL_DIR / "GestPro-Manual-de-Utilizador.pdf"
AUTOR = "Xavier Francisco Nhagumbe"
AUTOR_FUNCAO = "Engenheiro de Software"
CHAPTER_RE = re.compile(r"^(\d{2})-[\w-]+\.md$")
GENERIC_H2 = {"Para que serve", "Objectivo do módulo", "Conceitos", "Ecrãs", "Estados", "Erros frequentes", "Perguntas frequentes"}

MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto",
         "Setembro", "Outubro", "Novembro", "Dezembro"]


def gh_slug(value: str, separator: str = "-") -> str:
    """Slug igual ao do GitHub: minúsculas, sem pontuação (mantém acentos), espaços → '-'."""
    value = re.sub(r"<[^>]+>", "", value)
    value = html.unescape(value).strip().lower()
    value = re.sub(r"[^\w\- ]", "", value)
    return value.replace(" ", separator)


_MD = MarkdownIt("commonmark", {"html": True}).enable(["table", "strikethrough"])


def render_md(text: str) -> str:
    """CommonMark + tabelas (o mesmo que o GitHub) e ids de título ao estilo do GitHub."""
    out = _MD.render(text)
    seen: dict[str, int] = {}

    def add_id(m: re.Match) -> str:
        slug = gh_slug(m.group(2))
        n = seen.get(slug, 0)
        seen[slug] = n + 1
        hid = slug if n == 0 else f"{slug}-{n}"
        return f'<{m.group(1)} id="{hid}">{m.group(2)}</{m.group(1)}>'

    return re.sub(r"<(h[1-6])>(.*?)</\1>", add_id, out, flags=re.S)


_JPEG_DIR: Path | None = None


def embed_uri(img: Path) -> str:
    """URI da captura a embeber. Com Pillow, converte para JPEG (q=85) numa pasta temporária:
    o PDF fica com ~metade do tamanho, sem perda visível em capturas de ecrã. Sem Pillow, usa o PNG."""
    global _JPEG_DIR
    try:
        from PIL import Image
    except ImportError:
        return img.as_uri()
    if _JPEG_DIR is None:
        import tempfile
        _JPEG_DIR = Path(tempfile.mkdtemp(prefix="manual-img-"))
    out = _JPEG_DIR / (img.parent.name + "__" + img.stem + ".jpg")
    if not out.exists():
        Image.open(img).convert("RGB").save(out, "JPEG", quality=85, optimize=True)
    return out.as_uri()


def chapters() -> list[tuple[str, Path]]:
    found = sorted(
        (m.group(1), p) for p in MANUAL_DIR.iterdir() if (m := CHAPTER_RE.match(p.name))
    )
    if not found:
        sys.exit(f"Nenhum capítulo NN-*.md em {MANUAL_DIR}")
    return found


def render_chapter(num: str, path: Path, file_to_num: dict[str, str]) -> tuple[str, list[tuple[int, str, str]]]:
    body = render_md(path.read_text(encoding="utf-8"))
    prefix = f"c{num}-"

    # ids dos títulos → prefixados por capítulo
    body = re.sub(r'<(h[1-6]) id="([^"]+)"', lambda m: f'<{m.group(1)} id="{prefix}{m.group(2)}"', body)

    def fix_link(m: re.Match) -> str:
        href, text = unquote(html.unescape(m.group(1))), m.group(2)
        if href.startswith(("http://", "https://", "mailto:")):
            return f'<a href="{href}">{text}</a>'
        if href.startswith("#"):
            return f'<a href="#{prefix}{href[1:]}">{text}</a>'
        target, _, frag = href.partition("#")
        tnum = file_to_num.get(Path(target).name) if "/" not in target else None
        if tnum:
            return f'<a href="#c{tnum}-{frag}">{text}</a>' if frag else f'<a href="#chapter-{tnum}">{text}</a>'
        if target == "README.md":
            return f'<a href="#intro-{frag}">{text}</a>' if frag else f'<a href="#introducao">{text}</a>'
        return f'<span class="extref">{text}</span>'  # ficheiro fora do manual

    body = re.sub(r'<a href="([^"]*)">(.*?)</a>', fix_link, body, flags=re.S)

    # imagens: caminho absoluto + legenda a partir do alt
    def fix_img(m: re.Match) -> str:
        src, alt = m.group(1), m.group(2)
        img_path = (path.parent / src).resolve()
        if not img_path.exists():
            print(f"AVISO: imagem em falta: {src} ({path.name})", file=sys.stderr)
            return f'<p class="missing">[captura em falta: {html.escape(src)}]</p>'
        return (f'<figure><img src="{embed_uri(img_path)}" alt="{alt}">'
                f'<figcaption>{alt}</figcaption></figure>')

    body = re.sub(r'<p>\s*<img src="([^"]+)" alt="([^"]*)"\s*/?>\s*</p>', fix_img, body)

    # tabelas de duas colunas sem cabeçalho («| | |»): retira o cabeçalho vazio
    body = re.sub(r"<thead>\s*<tr>\s*(?:<th[^>]*>\s*</th>\s*)+</tr>\s*</thead>\s*", "", body)

    # listas de verificação «- [ ]» (GitHub) → caixa
    body = re.sub(r"<li>\[ \]\s*", '<li class="check">', body)

    # caixas Atenção / Nota / Dica
    def callout(m: re.Match) -> str:
        inner = m.group(1)
        kind = "note"
        if re.search(r"<strong>\s*Atenção", inner):
            kind = "warn"
        elif re.search(r"<strong>\s*(Dica|Regra de ouro)", inner):
            kind = "tip"
        return f'<blockquote class="{kind}">{inner}</blockquote>'

    body = re.sub(r"<blockquote>(.*?)</blockquote>", callout, body, flags=re.S)

    # índice: H1 + H2 não genéricos + H3 de «Tarefas» e das H2 não genéricas
    toc: list[tuple[int, str, str]] = []
    current_h2 = None
    for level, hid, text in re.findall(r'<h([123]) id="([^"]+)">(.*?)</h\1>', body, flags=re.S):
        text = re.sub(r"<[^>]+>", "", text)
        level = int(level)
        if level == 1:
            toc.append((1, hid, text))
        elif level == 2:
            current_h2 = text
            if text not in GENERIC_H2 and text != "Tarefas":
                toc.append((2, hid, text))
        elif level == 3 and current_h2 is not None and current_h2 not in GENERIC_H2:
            toc.append((3, hid, text))

    return f'<section class="chapter" id="chapter-{num}">{body}</section>', toc


CSS = """
@page { size: A4; margin: 18mm 16mm 20mm 16mm; }
:root { --ink:#1b2430; --muted:#5b6675; --line:#d9dee5; --brand:#0f5c4c; --brand-soft:#e7f2ef;
        --warn:#9a5b00; --warn-bg:#fff6e5; --note:#1d4f91; --note-bg:#eef4fc; --tip-bg:#ecf7f0; --tip:#1f6b3a; }
html { font-family: "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; font-size: 10pt;
       color: var(--ink); line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; }
h1 { font-size: 22pt; color: var(--brand); margin: 0 0 6mm; padding-bottom: 3mm; border-bottom: 2px solid var(--brand); }
h2 { font-size: 14pt; color: var(--brand); margin: 8mm 0 3mm; break-after: avoid; }
h3 { font-size: 11.5pt; margin: 6mm 0 2mm; break-after: avoid; }
h4 { font-size: 10.5pt; margin: 4mm 0 2mm; break-after: avoid; }
p, li { orphans: 3; widows: 3; }
a { color: var(--note); text-decoration: none; }
.extref { font-style: italic; }
code { font-family: "JetBrains Mono", Menlo, Consolas, monospace; font-size: 8.8pt;
       background: #f2f4f7; padding: 0 3px; border-radius: 3px; }
pre { background: #f6f8fa; border: 1px solid var(--line); border-radius: 4px; padding: 3mm;
      font-size: 8.5pt; line-height: 1.35; white-space: pre-wrap; break-inside: avoid; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 3mm 0 4mm; font-size: 8.8pt; break-inside: auto; }
tr { break-inside: avoid; }
th, td { border: 1px solid var(--line); padding: 1.6mm 2mm; vertical-align: top; text-align: left; }
th { background: var(--brand-soft); font-weight: 600; }
td, th { font-variant-numeric: tabular-nums; }
blockquote { margin: 3mm 0; padding: 2.5mm 4mm; border-left: 4px solid var(--note);
             background: var(--note-bg); border-radius: 0 4px 4px 0; break-inside: avoid; }
blockquote.warn { border-color: var(--warn); background: var(--warn-bg); }
blockquote.tip { border-color: var(--tip); background: var(--tip-bg); }
blockquote p { margin: 1.5mm 0; }
figure { margin: 4mm 0 5mm; break-inside: avoid; text-align: center; }
figure img { max-width: 100%; max-height: 120mm; border: 1px solid var(--line); border-radius: 4px; }
figcaption { font-size: 8.5pt; color: var(--muted); margin-top: 1.5mm; }
.missing { color: var(--warn); font-style: italic; }
hr { border: 0; border-top: 1px solid var(--line); margin: 6mm 0; }
li.check { list-style: none; margin-left: -5mm; }\nli.check::before { content: "\\2610"; margin-right: 2mm; color: var(--brand); }
.chapter { break-before: page; }
/* capa */
.cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; }
.cover .brand { font-size: 12pt; letter-spacing: .2em; color: var(--brand); font-weight: 700; }
.cover h1 { font-size: 34pt; border: 0; margin: 4mm 0 2mm; color: var(--ink); }
.cover .sub { font-size: 14pt; color: var(--muted); }
.cover .autor { margin-top: 14mm; font-size: 11pt; color: var(--ink); }
.cover .autor span { display: block; font-size: 10pt; color: var(--muted); margin-top: 1mm; }
.cover .meta { margin-top: 18mm; font-size: 10pt; color: var(--muted); border-top: 1px solid var(--line); padding-top: 4mm; }
/* índice */
#indice { break-before: page; }
#indice h1 { font-size: 20pt; }
.toc { list-style: none; padding: 0; margin: 0; }
.toc li { margin: 0; }
.toc .l1 { font-weight: 700; margin-top: 3.5mm; font-size: 10.5pt; }
.toc .l2 { padding-left: 5mm; margin-top: 1mm; font-weight: 600; font-size: 9.3pt; }
.toc .l3 { padding-left: 10mm; font-size: 8.8pt; color: var(--muted); }
.toc a { color: inherit; }
.intro table { font-size: 9pt; }
"""


def build_html() -> str:
    chs = chapters()
    file_to_num = {p.name: n for n, p in chs}
    rendered, toc_all = [], []
    for num, path in chs:
        sec, toc = render_chapter(num, path, file_to_num)
        rendered.append(sec)
        toc_all.extend(toc)

    # introdução a partir do README (sem as secções técnicas)
    readme = (MANUAL_DIR / "README.md").read_text(encoding="utf-8")
    readme = re.split(r"^## (Capturas de ecrã|Versão em PDF)", readme, flags=re.M)[0]
    readme = re.sub(r"^# .*\n", "", readme, count=1)
    intro = render_md(readme)
    intro = re.sub(r'<(h[1-6]) id="([^"]+)"', lambda m: f'<{m.group(1)} id="intro-{m.group(2)}"', intro)
    intro = re.sub(r'<a href="(\d{2})-[\w-]+\.md(?:#[^"]*)?">', lambda m: f'<a href="#chapter-{m.group(1)}">', intro)

    hoje = dt.date.today()
    data = f"{hoje.day} de {MESES[hoje.month - 1]} de {hoje.year}"
    cover = f"""
<section class="cover">
  <div class="brand">GESTPRO</div>
  <h1>Manual de Utilizador</h1>
  <div class="sub">Guia completo dos módulos, com capturas de ecrã e casos práticos ponta-a-ponta</div>
  <div class="autor">Autor: <strong>{AUTOR}</strong><span>{AUTOR_FUNCAO}</span></div>
  <div class="meta">Edição de {data} · {len(chs)} capítulos</div>
</section>"""

    toc_html = "\n".join(
        f'<li class="l{lvl}"><a href="#{hid}">{html.escape(html.unescape(text))}</a></li>' for lvl, hid, text in toc_all
    )
    indice = f"""
<section id="indice">
  <h1>Índice</h1>
  <ul class="toc">{toc_html}</ul>
</section>
<section class="chapter intro" id="introducao"><h1>Como usar este manual</h1>{intro}</section>"""

    return f"""<!doctype html><html lang="pt"><head><meta charset="utf-8">
<title>GestPro — Manual de Utilizador</title><meta name="author" content="{AUTOR} — {AUTOR_FUNCAO}"><style>{CSS}</style></head>
<body>{cover}{indice}{''.join(rendered)}</body></html>"""


def definir_metadados(pdf: Path) -> None:
    """Grava autor e título nos metadados do PDF (o Chromium não os escreve). Com pypdf; sem ele, ignora."""
    try:
        from pypdf import PdfReader, PdfWriter
    except ImportError:
        print("aviso: pypdf não instalado — metadados de autor não gravados", file=sys.stderr)
        return
    reader = PdfReader(str(pdf))
    # O Chromium pode devolver um PDF truncado sem erro (visto com pouca memória livre):
    # confirma que o último capítulo chegou aos marcadores antes de dar o PDF por bom.
    ultimo = max(int(m.group(1)) for f in MANUAL_DIR.iterdir() if (m := CHAPTER_RE.match(f.name)))
    titulos = [o.title for o in reader.outline if not isinstance(o, list)]
    if not any(t.startswith(f"{ultimo}.") for t in titulos):
        sys.exit(f"erro: PDF truncado — o capítulo {ultimo} não está nos marcadores ({len(reader.pages)} páginas). Gere outra vez.")
    writer = PdfWriter(clone_from=reader)
    writer.add_metadata({"/Title": "GestPro — Manual de Utilizador",
                         "/Author": f"{AUTOR} — {AUTOR_FUNCAO}",
                         "/Subject": "Manual de utilizador do GestPro"})
    with open(pdf, "wb") as f:
        writer.write(f)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--html", type=Path, help="grava também o HTML intermédio (útil para depurar)")
    ap.add_argument("--chromium", help="caminho do executável Chromium (opcional)")
    args = ap.parse_args()

    doc = build_html()
    tmp_html = args.html or MANUAL_DIR / ".manual-build.html"
    tmp_html.write_text(doc, encoding="utf-8")

    from playwright.sync_api import sync_playwright

    footer = ('<div style="width:100%;font-size:7.5pt;color:#5b6675;padding:0 16mm;display:flex;'
              'justify-content:space-between;font-family:Arial,sans-serif">'
              '<span>GestPro — Manual de Utilizador</span>'
              '<span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>')
    with sync_playwright() as p:
        launch = {"executable_path": args.chromium} if args.chromium else {}
        browser = p.chromium.launch(**launch)
        page = browser.new_page()
        page.goto(tmp_html.resolve().as_uri(), wait_until="networkidle")
        page.pdf(path=str(args.out), format="A4", print_background=True,
                 display_header_footer=True, header_template="<span></span>", footer_template=footer,
                 margin={"top": "18mm", "bottom": "20mm", "left": "16mm", "right": "16mm"},
                 outline=True, tagged=True)
        browser.close()
    if not args.html:
        tmp_html.unlink(missing_ok=True)
    definir_metadados(args.out)
    print(f"PDF gerado: {args.out}")


if __name__ == "__main__":
    main()
