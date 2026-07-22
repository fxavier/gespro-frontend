/**
 * Testes unitários — Email Provider e Templates (WS 13)
 *
 * Cobre:
 *  - Provider noop: regista na consola, não lança
 *  - Provider fake: assert de conteúdo dos templates (sem I/O real)
 *  - Templates: conteúdo pt-PT, links corretos
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { noopEmailProvider } from '../noop';
import { resetPasswordTemplate } from '../templates/reset';
import { conviteTemplate } from '../templates/convite';
import { alertaTemplate } from '../templates/alerta';

// ---------------------------------------------------------------------------
// Provider noop
// ---------------------------------------------------------------------------

describe('noopEmailProvider', () => {
  it('não lança ao enviar email', async () => {
    await expect(
      noopEmailProvider.enviar({
        para: 'teste@demo.mz',
        assunto: 'Teste',
        html: '<p>Teste</p>',
        texto: 'Teste',
      }),
    ).resolves.toBeUndefined();
  });

  it('regista na consola (provider fake — sem I/O real)', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await noopEmailProvider.enviar({
      para: 'admin@demo.mz',
      assunto: 'Assunto de teste',
      html: '<p>HTML</p>',
      texto: 'Texto',
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[email:noop]'),
      expect.objectContaining({
        para: 'admin@demo.mz',
        assunto: 'Assunto de teste',
      }),
    );

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Template: reset de password
// ---------------------------------------------------------------------------

describe('resetPasswordTemplate', () => {
  it('gera HTML com o link de reset', () => {
    const { html, texto } = resetPasswordTemplate({
      linkReset: 'https://demo.gespro.mz/reset?token=abc123',
    });

    expect(html).toContain('https://demo.gespro.mz/reset?token=abc123');
    expect(texto).toContain('https://demo.gespro.mz/reset?token=abc123');
  });

  it('inclui saudação personalizada quando nome é fornecido', () => {
    const { html, texto } = resetPasswordTemplate({
      linkReset: 'https://link',
      nomeUtilizador: 'Maria Nhampule',
    });

    expect(html).toContain('Maria Nhampule');
    expect(texto).toContain('Maria Nhampule');
  });

  it('está em português de Portugal', () => {
    const { html } = resetPasswordTemplate({ linkReset: 'https://link' });

    expect(html).toContain('Recupera');
    expect(html).toContain('palavra-passe');
  });

  it('menciona a expiração em horas', () => {
    const { texto } = resetPasswordTemplate({
      linkReset: 'https://link',
      expiracaoHoras: 2,
    });

    expect(texto).toContain('2 hora');
  });
});

// ---------------------------------------------------------------------------
// Template: convite de utilizador
// ---------------------------------------------------------------------------

describe('conviteTemplate', () => {
  it('inclui o link de convite no HTML e texto', () => {
    const { html, texto } = conviteTemplate({
      linkConvite: 'https://demo.gespro.mz/aceitar-convite?token=xyz',
      emailConvidado: 'novo@empresa.mz',
    });

    expect(html).toContain('https://demo.gespro.mz/aceitar-convite?token=xyz');
    expect(texto).toContain('https://demo.gespro.mz/aceitar-convite?token=xyz');
  });

  it('inclui o email convidado', () => {
    const { html } = conviteTemplate({
      linkConvite: 'https://link',
      emailConvidado: 'colaborador@empresa.mz',
    });

    expect(html).toContain('colaborador@empresa.mz');
  });

  it('inclui o nome da empresa quando fornecido', () => {
    const { html } = conviteTemplate({
      linkConvite: 'https://link',
      emailConvidado: 'x@y.mz',
      nomeEmpresa: 'Empresa ABC, Lda.',
    });

    expect(html).toContain('Empresa ABC, Lda.');
  });

  it('está em português de Portugal', () => {
    const { html } = conviteTemplate({
      linkConvite: 'https://link',
      emailConvidado: 'x@y.mz',
    });

    expect(html).toContain('Convite');
    expect(html).toContain('GestPro');
  });
});

// ---------------------------------------------------------------------------
// Template: alerta
// ---------------------------------------------------------------------------

describe('alertaTemplate', () => {
  it('inclui o título e a mensagem', () => {
    const { html, texto } = alertaTemplate({
      titulo: 'Documento expirado: Carta Verde',
      mensagem: 'A carta verde da viatura MT-12-34 expirou.',
    });

    expect(html).toContain('Documento expirado: Carta Verde');
    expect(html).toContain('A carta verde da viatura MT-12-34 expirou.');
    expect(texto).toContain('Documento expirado: Carta Verde');
  });

  it('marca urgência CRITICO com cor distinta', () => {
    const { html } = alertaTemplate({
      titulo: 'Urgente',
      mensagem: 'Atenção imediata',
      urgencia: 'CRITICO',
    });

    // Crítico usa fundo vermelho claro (#fef2f2)
    expect(html).toContain('Crítico');
    expect(html).toContain('#fef2f2');
  });

  it('inclui botão de detalhe quando linkDetalhe é fornecido', () => {
    const { html } = alertaTemplate({
      titulo: 'T',
      mensagem: 'M',
      linkDetalhe: 'https://demo.gespro.mz/transporte/viaturas/abc',
    });

    expect(html).toContain('https://demo.gespro.mz/transporte/viaturas/abc');
    expect(html).toContain('Ver Detalhes');
  });

  it('não inclui botão de detalhe quando linkDetalhe não é fornecido', () => {
    const { html } = alertaTemplate({ titulo: 'T', mensagem: 'M' });
    expect(html).not.toContain('Ver Detalhes');
  });
});

// ---------------------------------------------------------------------------
// Provider fake: injectável nos testes de serviço
// ---------------------------------------------------------------------------

describe('EmailProvider (fake injectável)', () => {
  it('pode ser substituído por uma função spy nos testes de serviço', async () => {
    const enviados: string[] = [];
    const fakeProvider = {
      enviar: vi.fn(async (dto: { para: string; assunto: string; html: string; texto?: string }) => {
        enviados.push(dto.para);
      }),
    };

    await fakeProvider.enviar({ para: 'dest@demo.mz', assunto: 'A', html: '<p/>', texto: '' });
    expect(enviados).toContain('dest@demo.mz');
    expect(fakeProvider.enviar).toHaveBeenCalledOnce();
  });
});
