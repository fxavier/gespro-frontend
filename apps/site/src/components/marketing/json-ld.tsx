/**
 * JSON-LD renderizado no servidor (Requisito 7.3).
 *
 * `JSON.stringify` com escape de `<` evita que uma string de conteúdo feche o
 * `<script>` prematuramente. Como os dados vêm de `messages/*.json` e do
 * catálogo do spec 19, o escape é a fronteira de confiança.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
