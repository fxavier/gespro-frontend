import { emailLayout } from './layout';

interface AlertaTemplateProps {
  titulo: string;
  mensagem: string;
  urgencia?: 'CRITICO' | 'AVISO' | 'INFO';
  linkDetalhe?: string;
  nomeEmpresa?: string;
}

const URGENCIA_CORES: Record<string, { fundo: string; texto: string; borda: string }> = {
  CRITICO: { fundo: '#fef2f2', texto: '#991b1b', borda: '#fca5a5' },
  AVISO: { fundo: '#fffbeb', texto: '#92400e', borda: '#fcd34d' },
  INFO: { fundo: '#eff6ff', texto: '#1e40af', borda: '#93c5fd' },
};

const URGENCIA_LABELS: Record<string, string> = {
  CRITICO: 'Crítico',
  AVISO: 'Aviso',
  INFO: 'Informação',
};

/**
 * Template de email para alertas de operação (transporte, manutenção, etc.) — pt-PT.
 */
export function alertaTemplate({
  titulo,
  mensagem,
  urgencia = 'AVISO',
  linkDetalhe,
  nomeEmpresa,
}: AlertaTemplateProps): { html: string; texto: string } {
  const cores = URGENCIA_CORES[urgencia] ?? URGENCIA_CORES.AVISO!;
  const labelUrgencia = URGENCIA_LABELS[urgencia] ?? urgencia;
  const empresa = nomeEmpresa ? ` — ${nomeEmpresa}` : '';

  const botaoDetalhe = linkDetalhe
    ? `<div style="text-align:center;margin:24px 0 0;">
        <a href="${linkDetalhe}"
           style="display:inline-block;padding:10px 24px;background:#0f172a;color:#ffffff;
                  font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">
          Ver Detalhes
        </a>
      </div>`
    : '';

  const conteudo = `
    <div style="background:${cores.fundo};border:1px solid ${cores.borda};border-radius:6px;padding:12px 16px;margin-bottom:20px;">
      <span style="color:${cores.texto};font-size:13px;font-weight:700;text-transform:uppercase;
                   letter-spacing:0.5px;">${labelUrgencia}</span>
    </div>
    <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a;">
      ${titulo}
    </h2>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
      ${mensagem}
    </p>
    ${botaoDetalhe}
  `;

  const texto = `[${labelUrgencia}] ${titulo}

${mensagem}

${linkDetalhe ? `Ver detalhes: ${linkDetalhe}` : ''}

-- GestPro${empresa}`;

  return {
    html: emailLayout(conteudo, `GestPro${empresa} — Alerta: ${labelUrgencia}`),
    texto,
  };
}
