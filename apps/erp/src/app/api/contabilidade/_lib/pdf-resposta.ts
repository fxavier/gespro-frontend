/** A resposta `application/pdf` em anexo, sem cache, das exportações PDF dos mapas (#365). */
export function respostaPdf(pdf: Uint8Array, nome: string): Response {
  return new Response(pdf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nome}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
