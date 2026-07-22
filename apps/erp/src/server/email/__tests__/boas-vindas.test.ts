import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../templates/layout';
import { boasVindasTemplate } from '../templates/boas-vindas';

describe('escapeHtml', () => {
  it('neutraliza os caracteres que abrem markup', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml(`"aspas" 'plicas'`)).toBe('&quot;aspas&quot; &#39;plicas&#39;');
  });

  it('escapa o & primeiro, para não duplicar entidades', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('deixa texto normal intacto (incluindo acentuação pt-PT)', () => {
    expect(escapeHtml('Padaria Ana, Lda — Construções')).toBe('Padaria Ana, Lda — Construções');
  });
});

describe('template de boas-vindas — dados de origem anónima', () => {
  const link = 'https://app.gespro.mz/api/publico/verificar-email?token=abc';

  it('escapa nome e empresa antes de os interpolar no HTML', () => {
    const { html } = boasVindasTemplate({
      nomeUtilizador: '<script>alert(1)</script>',
      nomeEmpresa: '<a href="http://phishing.example">Clique aqui</a>',
      linkVerificacao: link,
      trialDias: 14,
    });

    // O payload não pode sobreviver como markup: é o nosso domínio a assinar
    // o email, e o campo veio de um endpoint sem autenticação.
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="http://phishing.example"');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;a href=&quot;http://phishing.example&quot;&gt;');
  });

  it('escapa também o link de verificação', () => {
    const { html } = boasVindasTemplate({
      nomeUtilizador: 'Ana',
      nomeEmpresa: 'Padaria',
      linkVerificacao: 'https://x.mz/?a=1&b=2',
      trialDias: 14,
    });
    expect(html).toContain('https://x.mz/?a=1&amp;b=2');
  });

  it('mantém o conteúdo legítimo e o link utilizável', () => {
    const { html, texto } = boasVindasTemplate({
      nomeUtilizador: 'Ana Sitoe',
      nomeEmpresa: 'Padaria Ana, Lda',
      linkVerificacao: link,
      trialDias: 14,
    });
    expect(html).toContain('Ana Sitoe');
    expect(html).toContain('Padaria Ana, Lda');
    expect(html).toContain(link);
    // A versão em texto simples não é HTML — não leva escaping.
    expect(texto).toContain('Padaria Ana, Lda');
    expect(texto).toContain(link);
  });
});
