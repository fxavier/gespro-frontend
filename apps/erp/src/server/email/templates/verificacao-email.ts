import { emailLayout, escapeHtml } from './layout';

interface VerificacaoEmailProps {
  /** Endereço que está a ser confirmado — mostrado para a pessoa reconhecer. */
  email: string;
  /** URL completo e já assinado (`ligacao-verificacao.ts`). */
  url: string;
}

/**
 * E-mail de confirmação de endereço — pt-PT (ADR-0031 §5).
 *
 * A confirmação deixou de ser do Keycloak (`VERIFY_EMAIL`) e passou a ser
 * nossa: quem se regista JÁ ESTÁ dentro do produto, e este e-mail só levanta
 * os dois travões do §5 do ADR (emitir documento fiscal e criar utilizadores).
 * O texto tem de dizer isso — «confirme para poder continuar» seria mentira e
 * mandaria a pessoa para o webmail que este ADR existe para lhe poupar.
 *
 * `escapeHtml` no endereço: chega de um formulário público. O `url` é
 * construído por nós e não passa por aqui sem escape porque é um atributo
 * `href` — vai escapado à mesma, que é o que impede um `"` de fechar o atributo.
 */
export function verificacaoEmailTemplate({ email, url }: VerificacaoEmailProps): {
  html: string;
  texto: string;
} {
  const urlSeguro = escapeHtml(url);

  const conteudo = `
    <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a;">
      Confirme o seu endereço de e-mail
    </h2>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
      A conta GestPro associada a <strong>${escapeHtml(email)}</strong> já está activa —
      não precisa deste e-mail para entrar.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
      A confirmação serve para libertar duas operações que exigem um endereço
      comprovado: <strong>emitir documentos fiscais</strong> e
      <strong>criar utilizadores</strong>.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${urlSeguro}"
         style="display:inline-block;padding:12px 28px;background:#0f172a;color:#ffffff;
                font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
        Confirmar endereço
      </a>
    </div>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#64748b;">
      A ligação é válida durante 24 horas. Se expirar, peça uma nova a partir do
      aviso no painel do GestPro.
    </p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;word-break:break-all;">
      Se o botão não funcionar, copie este endereço para o navegador:<br/>
      ${urlSeguro}
    </p>
    <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#64748b;">
      Se não foi você quem criou esta conta, ignore esta mensagem: sem esta
      confirmação, a conta não emite documentos nem convida ninguém.
    </p>
  `;

  const texto = `Confirme o seu endereço de e-mail

A conta GestPro associada a ${email} já está activa — não precisa deste e-mail para entrar.

A confirmação serve para libertar duas operações que exigem um endereço comprovado: emitir documentos fiscais e criar utilizadores.

Confirmar endereço: ${url}

A ligação é válida durante 24 horas. Se expirar, peça uma nova a partir do aviso no painel do GestPro.

Se não foi você quem criou esta conta, ignore esta mensagem.

-- GestPro`;

  return {
    html: emailLayout(conteudo, 'GestPro — Confirmação de endereço de e-mail'),
    texto,
  };
}
