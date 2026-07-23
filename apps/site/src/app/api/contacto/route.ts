import { NextResponse } from "next/server";
import { contactoSchema } from "@/lib/validations";
import { enviarEmail } from "@/lib/email";
import { identificarCliente, verificarLimite } from "@/lib/rate-limit";

/**
 * `POST /api/contacto` — recebe o formulário público.
 *
 * Nunca devolve detalhe interno: erros de validação vêm como chaves de
 * tradução por campo, erros de transporte como um `ok: false` genérico. O
 * segredo SMTP fica no processo do servidor e nunca chega ao cliente
 * (Requisito 5.4).
 */

export const dynamic = "force-dynamic";

const LIMITE = 3;
const JANELA_MS = 10 * 60 * 1000;

export async function POST(pedido: Request) {
  const cliente = identificarCliente(pedido.headers);
  const limite = verificarLimite(`contacto:${cliente}`, LIMITE, JANELA_MS);

  if (!limite.permitido) {
    return NextResponse.json(
      { ok: false },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(limite.reiniciaEm / 1000)),
        },
      }
    );
  }

  let corpo: unknown;
  try {
    corpo = await pedido.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const validado = contactoSchema.safeParse(corpo);
  if (!validado.success) {
    const camposComErro: Record<string, string> = {};
    for (const problema of validado.error.issues) {
      const campo = String(problema.path[0] ?? "");
      if (campo && !camposComErro[campo]) {
        camposComErro[campo] = problema.message;
      }
    }
    return NextResponse.json({ ok: false, camposComErro }, { status: 422 });
  }

  const dados = validado.data;

  // Armadilha preenchida → robô. Responde 200 sem enviar nada: dar erro
  // ensinaria o robô a evitar o campo.
  if (dados.website) {
    return NextResponse.json({ ok: true });
  }

  const resultado = await enviarEmail({
    assunto: `[Site] ${dados.assunto} — ${dados.empresa}`,
    responderA: dados.email,
    texto: [
      `Nome: ${dados.nome}`,
      `E-mail: ${dados.email}`,
      `Empresa: ${dados.empresa}`,
      `Telefone: ${dados.telefone || "—"}`,
      `Assunto: ${dados.assunto}`,
      "",
      dados.mensagem,
    ].join("\n"),
  });

  if (!resultado.entregue) {
    return NextResponse.json({ ok: false }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
