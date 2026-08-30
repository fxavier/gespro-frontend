import "server-only";

import { ENDPOINT_REGISTO } from "./env";
import { paraPayloadRegisto, type DadosRegisto } from "./validations";

/**
 * Cliente de `POST /api/publico/registo` (spec 19, ADR-0013).
 *
 * Chamado **do servidor** (Server Action), não do browser. Duas razões:
 *   1. sem chamada cross-origin não é preciso pôr a origem do site na
 *      allowlist CORS do ERP para o fluxo funcionar (continua a ser preciso
 *      para qualquer chamada futura feita a partir do browser);
 *   2. o servidor do site é a única camada que toca nos dados — nunca o browser.
 *
 * Contrato actualizado (ADR-0013 §5, ADR-0016):
 *   headers: `Idempotency-Key` obrigatório
 *   body: { empresa, admin (sem senha), planoId, provincia, captchaToken }
 *   → 201 { tenantSlug, mensagem }   (sem handoffToken)
 *   → 4xx { traceId, erro, error: { code, message } }
 *
 * Em 201, o utilizador fica no site e é instruído a verificar o e-mail.
 * Não há redirect para o ERP: a entrada é pelo link de activação do Keycloak.
 */

export type ResultadoRegisto =
  | { estado: "sucesso" }
  | {
      estado: "erro";
      chaveMensagem: "generico" | "indisponivel" | "emailJaRegistado";
      traceId?: string;
    };

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
      // Extrair o código de erro para mapear mensagens específicas.
      const code =
        corpo &&
        typeof corpo === "object" &&
        "error" in corpo &&
        corpo.error &&
        typeof corpo.error === "object" &&
        "code" in corpo.error
          ? String((corpo.error as { code: unknown }).code)
          : undefined;

      const traceId =
        corpo && typeof corpo === "object" && "traceId" in corpo
          ? String((corpo as { traceId: unknown }).traceId)
          : undefined;

      registar("registo.rejeitado", { estado: resposta.status, code, traceId });

      // EMAIL_JA_REGISTADO: e-mail único em todo o sistema (CONTEXT.md).
      // A mensagem explica que quem gere duas empresas precisa de dois
      // endereços — o site mostra copy própria (não a mensagem do backend).
      if (code === "EMAIL_JA_REGISTADO") {
        return { estado: "erro", chaveMensagem: "emailJaRegistado", traceId };
      }

      return { estado: "erro", chaveMensagem: "generico", traceId };
    }

    // 201 — conta criada. Sem handoffToken (ADR-0013 §5): entrada pelo e-mail.
    registar("registo.sucesso", { estado: resposta.status });
    return { estado: "sucesso" };
  } catch (erro) {
    // Endpoint inexistente, rede em baixa ou timeout: mensagem específica.
    registar("registo.indisponivel", {
      detalhe: erro instanceof Error ? erro.name : "desconhecido",
    });
    return { estado: "erro", chaveMensagem: "indisponivel" };
  } finally {
    clearTimeout(temporizador);
  }
}

function registar(evento: string, dados: Record<string, unknown>): void {
  // Log estruturado, sem PII: nem email, nem NUIT.
  console.warn(JSON.stringify({ nivel: "warn", evento, ...dados }));
}
