import "server-only";

import { ENDPOINT_REGISTO, URL_CALLBACK_REGISTO } from "./env";
import { paraPayloadRegisto, type DadosRegisto } from "./validations";

/**
 * Cliente de `POST /api/publico/registo` (spec 19).
 *
 * Chamado **do servidor** (Server Action), não do browser. Duas razões:
 *   1. sem chamada cross-origin não é preciso pôr a origem do site na
 *      allowlist CORS do ERP para o fluxo funcionar (continua a ser preciso
 *      para qualquer chamada futura feita a partir do browser);
 *   2. a senha do administrador nunca passa por um endpoint intermédio nosso
 *      além do próprio processo Node do site.
 *
 * Contrato (congelado em docs/handoff/execucao-paralela-18-19.md):
 *   headers: `Idempotency-Key` obrigatório
 *   → 201 { tenantSlug, handoffToken }
 *   → 4xx { traceId, erro }
 * O site **relaia** o `handoffToken` para `${APP_URL}/auth/registo-callback?token=…`
 * e nunca inspecciona os seus claims.
 */

export type ResultadoRegisto =
  | { estado: "sucesso"; destino: string }
  | { estado: "erro"; chaveMensagem: "generico" | "indisponivel"; traceId?: string };

const TIMEOUT_MS = 15_000;

export async function submeterRegisto(
  dados: DadosRegisto,
  opcoes: { chaveIdempotencia: string; ipCliente?: string }
): Promise<ResultadoRegisto> {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  try {
    const resposta = await fetch(ENDPOINT_REGISTO, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Idempotency-Key": opcoes.chaveIdempotencia,
        ...(opcoes.ipCliente ? { "X-Forwarded-For": opcoes.ipCliente } : {}),
      },
      body: JSON.stringify(paraPayloadRegisto(dados)),
      cache: "no-store",
      signal: controlador.signal,
    });

    const corpo: unknown = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      // Nunca reencaminhar a mensagem do backend para a UI: pode conter detalhe
      // interno. Guarda-se o traceId (opaco) para correlação de suporte.
      const traceId =
        corpo && typeof corpo === "object" && "traceId" in corpo
          ? String((corpo as { traceId: unknown }).traceId)
          : undefined;
      registar("registo.rejeitado", { estado: resposta.status, traceId });
      return { estado: "erro", chaveMensagem: "generico", traceId };
    }

    const token =
      corpo && typeof corpo === "object" && "handoffToken" in corpo
        ? String((corpo as { handoffToken: unknown }).handoffToken)
        : "";

    if (!token) {
      registar("registo.resposta_sem_token", { estado: resposta.status });
      return { estado: "erro", chaveMensagem: "generico" };
    }

    return {
      estado: "sucesso",
      destino: `${URL_CALLBACK_REGISTO}?token=${encodeURIComponent(token)}`,
    };
  } catch (erro) {
    // Endpoint ainda inexistente (spec 19 por integrar), rede em baixo ou
    // timeout: mensagem específica que convida a usar o formulário de contacto.
    registar("registo.indisponivel", {
      detalhe: erro instanceof Error ? erro.name : "desconhecido",
    });
    return { estado: "erro", chaveMensagem: "indisponivel" };
  } finally {
    clearTimeout(temporizador);
  }
}

function registar(evento: string, dados: Record<string, unknown>): void {
  // Log estruturado, sem PII: nem email, nem NUIT, nem senha.
  console.warn(JSON.stringify({ nivel: "warn", evento, ...dados }));
}
