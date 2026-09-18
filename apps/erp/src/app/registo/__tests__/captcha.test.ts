/**
 * Guarda a issue #44: sem chave anti-robô, o registo tem de submeter na mesma.
 *
 * Como confirmar que o teste vale: pôr `valorInicialCaptcha` a devolver sempre
 * `''`. O segundo teste acende — que é exactamente o defeito que o site tinha.
 */
import { describe, it, expect } from 'vitest';
import { RegistoTenantSchema } from '@/lib/validations/onboarding';
import { TOKEN_SEM_CAPTCHA, captchaConfigurado, valorInicialCaptcha } from '../captcha';

const CORPO_BASE = {
  empresa: { nome: 'Padaria Central, Lda.', nuit: '123456789' },
  admin: { nome: 'Ana Machava', email: 'ana@padaria.mz' },
  senha: 'palavra-passe-longa',
  confirmacao: 'palavra-passe-longa',
  planoId: 'PROFISSIONAL',
  provincia: 'Maputo Cidade',
};

describe('captchaConfigurado', () => {
  it('segue a presença da chave, e só isso', () => {
    expect(captchaConfigurado('1x00000000000000000000AA')).toBe(true);
    expect(captchaConfigurado('')).toBe(false);
    expect(captchaConfigurado('   ')).toBe(false);
    expect(captchaConfigurado(undefined)).toBe(false);
  });
});

describe('valorInicialCaptcha (issue #44)', () => {
  it('SEM chave, o corpo submetido passa o schema partilhado', () => {
    const valor = valorInicialCaptcha(undefined);
    const r = RegistoTenantSchema.safeParse({ ...CORPO_BASE, captchaToken: valor });

    // Sem isto, o zodResolver recusa no cliente e o botão não faz nada —
    // sem nada a explicar porquê, porque o campo não tem widget nenhum.
    expect(r.success).toBe(true);
    expect(valor).toBe(TOKEN_SEM_CAPTCHA);
  });

  it('COM chave, o campo começa vazio — o desafio é obrigatório', () => {
    const valor = valorInicialCaptcha('1x00000000000000000000AA');
    expect(valor).toBe('');

    const r = RegistoTenantSchema.safeParse({ ...CORPO_BASE, captchaToken: valor });
    expect(r.success).toBe(false);

    // E a recusa tem de ser NOMEADA no campo: é isso que o `<FormMessage />`
    // do `captchaToken` mostra. Um erro sem caminho não aparece em lado nenhum.
    const campos = r.success ? {} : r.error.flatten().fieldErrors;
    expect(Object.keys(campos)).toContain('captchaToken');
  });

  it('a sentinela nunca é um token real — o servidor continua a decidir', () => {
    // Não prova a verificação (isso é `verificarCaptcha`), prova que o valor é
    // reconhecível e constante, e não algo que se possa confundir com um token
    // emitido pela Cloudflare.
    expect(TOKEN_SEM_CAPTCHA).toBe('sem-captcha-configurado');
  });
});
