import { emailLayout, escapeHtml } from './layout';

interface BoasVindasTemplateProps {
  nomeUtilizador: string;
  nomeEmpresa: string;
  linkVerificacao: string;
  trialDias: number;
}

/**
 * Email de boas-vindas + verificação de endereço (spec 19) — pt-PT.
 *
 * O link de verificação é obrigatório: o login fica bloqueado até ser usado,
 * independentemente do estado da subscrição.
 */
export function boasVindasTemplate({
  nomeUtilizador,
  nomeEmpresa,
  linkVerificacao,
  trialDias,
}: BoasVindasTemplateProps): { html: string; texto: string } {
  // Nome do utilizador, nome da empresa e link vêm de um endpoint anónimo: nada
  // é interpolado em HTML sem passar por aqui.
  const nome = escapeHtml(nomeUtilizador);
  const empresa = escapeHtml(nomeEmpresa);
  const link = escapeHtml(linkVerificacao);

  const conteudo = `
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;">
      Bem-vindo ao GestPro
    </h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#334155;">
      Olá, ${nome},
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">
      A conta de <strong>${empresa}</strong> está criada e tem
      <strong>${trialDias} dias</strong> de teste gratuito, sem cartão de crédito.
      Para entrar, confirme primeiro este endereço de email.
    </p>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${link}"
         style="display:inline-block;padding:12px 28px;background:#0f172a;color:#ffffff;
                font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
        Confirmar endereço de email
      </a>
    </div>
    <p style="margin:0 0 8px;font-size:13px;color:#64748b;">
      Este link expira em <strong>48 horas</strong>.
    </p>
    <p style="margin:0;font-size:13px;color:#64748b;">
      Se o botão não funcionar, copie e cole este endereço no navegador:<br/>
      <a href="${link}" style="color:#3b82f6;word-break:break-all;">${link}</a>
    </p>
  `;

  const texto = `Olá, ${nomeUtilizador},

A conta de ${nomeEmpresa} está criada no GestPro e tem ${trialDias} dias de teste gratuito, sem cartão de crédito.

Para entrar, confirme primeiro o seu endereço de email:
${linkVerificacao}

Este link expira em 48 horas.

-- GestPro`;

  return {
    html: emailLayout(conteudo, 'GestPro — Bem-vindo'),
    texto,
  };
}
