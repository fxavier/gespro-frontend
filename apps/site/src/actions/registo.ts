"use server";

import { headers } from "next/headers";
import { registoSchema } from "@/lib/validations";
import { submeterRegisto } from "@/lib/registo";
import { identificarCliente, verificarLimite } from "@/lib/rate-limit";

/**
 * Server Action do formulário "Começar teste grátis".
 *
 * Corre no servidor do SITE e chama `POST /api/publico/registo` do spec 19.
 * Nunca lança para o cliente: devolve sempre um resultado tratável, com uma
 * chave de tradução em vez de mensagem literal (o texto vive em `messages`).
 *
 * O redireccionamento é feito pelo cliente com o `destino` devolvido — e não
 * com `redirect()` aqui — para o formulário poder registar o evento de
 * analytics e mostrar a mensagem de sucesso antes de sair da página.
 */

export type EstadoRegisto =
  | { estado: "inicial" }
  | { estado: "sucesso"; destino: string }
  | {
      estado: "erro";
      chaveMensagem: string;
      camposComErro?: Record<string, string>;
    };

const LIMITE_TENTATIVAS = 5;
const JANELA_MS = 10 * 60 * 1000;

export async function registarEmpresa(
  _anterior: EstadoRegisto,
  formulario: FormData
): Promise<EstadoRegisto> {
  const cabecalhos = await headers();
  const cliente = identificarCliente(cabecalhos);

  const limite = verificarLimite(
    `registo:${cliente}`,
    LIMITE_TENTATIVAS,
    JANELA_MS
  );
  if (!limite.permitido) {
    return { estado: "erro", chaveMensagem: "generico" };
  }

  const bruto = Object.fromEntries(formulario.entries());

  // Campo-armadilha preenchido → robô. Responde como sucesso silencioso, sem
  // chamar o endpoint de provisionamento.
  if (typeof bruto.website === "string" && bruto.website.length > 0) {
    return { estado: "sucesso", destino: "/" };
  }

  const validado = registoSchema.safeParse(bruto);
  if (!validado.success) {
    const camposComErro: Record<string, string> = {};
    for (const problema of validado.error.issues) {
      const campo = String(problema.path[0] ?? "");
      if (campo && !camposComErro[campo]) {
        camposComErro[campo] = problema.message;
      }
    }
    return { estado: "erro", chaveMensagem: "generico", camposComErro };
  }

  const chaveIdempotencia =
    typeof bruto.chaveIdempotencia === "string" && bruto.chaveIdempotencia
      ? bruto.chaveIdempotencia
      : crypto.randomUUID();

  const resultado = await submeterRegisto(validado.data, {
    chaveIdempotencia,
    ipCliente: cliente === "desconhecido" ? undefined : cliente,
  });

  if (resultado.estado === "sucesso") {
    return { estado: "sucesso", destino: resultado.destino };
  }

  return { estado: "erro", chaveMensagem: resultado.chaveMensagem };
}
