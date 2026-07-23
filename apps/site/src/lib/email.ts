import "server-only";

import { EMAIL_PROVIDER, CONTACTO_DESTINO } from "./env";

/**
 * Provider de email FINO do site.
 *
 * Deliberadamente separado de `apps/erp/src/server/email/*`: esse módulo é
 * `server-only` do ERP, depende do logger/observabilidade e do modelo
 * `Notificacao`. O site não tem base de dados nem sessão — só precisa de
 * entregar uma mensagem de formulário. Partilhar o do ERP arrastaria Prisma
 * para o bundle do site (exactamente o que ADR-0006 evita).
 *
 * Providers: `noop` (escreve no log — omissão, e o que corre em CI) e `smtp`.
 */

export interface Mensagem {
  assunto: string;
  texto: string;
  responderA?: string;
}

export interface ResultadoEnvio {
  entregue: boolean;
  provider: string;
}

/** Nunca lança: o formulário não deve rebentar por causa do transporte. */
export async function enviarEmail(msg: Mensagem): Promise<ResultadoEnvio> {
  if (EMAIL_PROVIDER !== "smtp") {
    console.info(
      JSON.stringify({
        nivel: "info",
        evento: "email.noop",
        para: CONTACTO_DESTINO,
        assunto: msg.assunto,
      })
    );
    return { entregue: true, provider: "noop" };
  }

  const host = process.env.SMTP_HOST;
  const utilizador = process.env.SMTP_USER;
  const senha = process.env.SMTP_PASSWORD;
  if (!host || !utilizador || !senha) {
    console.error(
      JSON.stringify({
        nivel: "error",
        evento: "email.smtp.configuracao_em_falta",
      })
    );
    return { entregue: false, provider: "smtp" };
  }

  try {
    const { createTransport } = await import("nodemailer");
    const transporte = createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: { user: utilizador, pass: senha },
    });

    await transporte.sendMail({
      from: process.env.SMTP_FROM ?? utilizador,
      to: CONTACTO_DESTINO,
      replyTo: msg.responderA,
      subject: msg.assunto,
      text: msg.texto,
    });

    return { entregue: true, provider: "smtp" };
  } catch (erro) {
    // Não propagar: o handler responde com mensagem amigável e traceId.
    console.error(
      JSON.stringify({
        nivel: "error",
        evento: "email.smtp.falha",
        detalhe: erro instanceof Error ? erro.message : "desconhecido",
      })
    );
    return { entregue: false, provider: "smtp" };
  }
}
