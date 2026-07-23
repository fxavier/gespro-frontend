import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * `POST /api/vitals` — recolhe Core Web Vitals de campo (Requisito 9.2).
 *
 * Escreve uma linha de log estruturado, que é o que o backend de observabilidade
 * recolhe (mesmo padrão do ERP: log JSON no stdout, sem SDK proprietário no
 * bundle do cliente). Nenhum identificador de utilizador é registado — só a
 * métrica, o caminho e o tipo de navegação.
 */

export const dynamic = "force-dynamic";

const metricaSchema = z.object({
  nome: z.string().max(20),
  valor: z.number().finite(),
  classificacao: z.string().max(30).optional(),
  caminho: z.string().max(200),
  navegacao: z.string().max(30).optional(),
});

export async function POST(pedido: Request) {
  let corpo: unknown;
  try {
    corpo = await pedido.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const validado = metricaSchema.safeParse(corpo);
  if (!validado.success) {
    return new NextResponse(null, { status: 204 });
  }

  console.info(
    JSON.stringify({
      nivel: "info",
      evento: "web_vital",
      ...validado.data,
    })
  );

  return new NextResponse(null, { status: 204 });
}
