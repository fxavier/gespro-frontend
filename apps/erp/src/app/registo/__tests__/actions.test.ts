/**
 * `registarTenantPublico` — a Server Action do ecrã de registo (ADR-0031).
 *
 * O que estes testes guardam:
 *   · a entrada imediata: sessão na mesma submissão e `/dashboard?onboarding=1`;
 *   · o caso que o design §7 manda vigiar — provisionamento feito, `signIn`
 *     falhado — com mensagem própria e `entrada.imediata.falhou`, NUNCA um
 *     erro genérico;
 *   · a palavra-passe não sai daqui para lado nenhum que persista.
 *
 * Como confirmar que valem: trocar o `sem-sessao` por um `erro` genérico, ou
 * ler só a excepção do `signIn` e ignorar o `error=` da URL devolvida — em
 * qualquer dos casos há testes a acender.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const SENHA = 'palavra-passe-longa-2026';

const registarTenant = vi.hoisted(() => vi.fn());
const signIn = vi.hoisted(() => vi.fn());
const enviarEmailVerificacao = vi.hoisted(() => vi.fn());
const registarEventoPlausible = vi.hoisted(() => vi.fn());
const linhasLog = vi.hoisted(() => [] as { nivel: string; dados: unknown; msg: string }[]);

vi.mock('@/server/provisioning/registo-publico', () => ({ registarTenant }));
vi.mock('@/lib/auth', () => ({ signIn }));
vi.mock('@/server/auth/keycloak', () => ({ enviarEmailVerificacao }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '41.220.0.9, 10.0.0.1' }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    const e = new Error(`NEXT_REDIRECT:${url}`);
    (e as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${url}`;
    throw e;
  },
}));
vi.mock('@/server/analytics/plausible', async (original) => ({
  ...(await original<typeof import('@/server/analytics/plausible')>()),
  registarEventoPlausible,
}));
vi.mock('@/server/observability/logger', () => ({
  logger: {
    info: (dados: unknown, msg: string) => linhasLog.push({ nivel: 'info', dados, msg }),
    warn: (dados: unknown, msg: string) => linhasLog.push({ nivel: 'warn', dados, msg }),
    error: (dados: unknown, msg: string) => linhasLog.push({ nivel: 'error', dados, msg }),
    debug: () => {},
  },
}));

import { registarTenantPublico, type EstadoRegisto } from '../actions';
import type { RegistoTenantInput } from '@/lib/validations/onboarding';

const DADOS = {
  empresa: { nome: 'Padaria Central, Lda.', nuit: '123456789' },
  admin: { nome: 'Ana Machava', email: 'ana@padaria.mz' },
  senha: SENHA,
  confirmacao: SENHA,
  planoId: 'PROFISSIONAL',
  provincia: 'Maputo Cidade',
  captchaToken: 'token-do-widget',
} as unknown as RegistoTenantInput;

function sucesso(extra: Partial<Record<string, unknown>> = {}) {
  return {
    ok: true,
    tenantSlug: 'padaria-central',
    sub: '33333333-3333-4333-8333-333333333333',
    email: 'ana@padaria.mz',
    repetido: false,
    mensagem: 'Conta criada.',
    ...extra,
  };
}

async function correr(entrada = { dados: DADOS, idempotencyKey: 'chave-de-teste-1234' }) {
  try {
    return { estado: await registarTenantPublico(entrada), redireccionou: undefined as string | undefined };
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.startsWith('NEXT_REDIRECT:')) {
      return { estado: undefined as EstadoRegisto | undefined, redireccionou: msg.slice('NEXT_REDIRECT:'.length) };
    }
    throw e;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  linhasLog.length = 0;
  signIn.mockResolvedValue('/dashboard');
  enviarEmailVerificacao.mockResolvedValue(true);
  registarEventoPlausible.mockResolvedValue(true);
});

describe('caminho feliz — entrada imediata', () => {
  beforeEach(() => registarTenant.mockResolvedValue(sucesso()));

  it('dá sessão na mesma submissão e encaminha para o painel', async () => {
    const r = await correr();

    expect(signIn).toHaveBeenCalledWith('credentials', {
      identificador: 'ana@padaria.mz',
      palavraPasse: SENHA,
      redirect: false,
    });
    expect(r.redireccionou).toBe('/dashboard?onboarding=1');
  });

  it('o e-mail de verificação sai DEPOIS da sessão e não a trava', async () => {
    await correr();
    expect(enviarEmailVerificacao).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333',
      'ana@padaria.mz',
    );
  });

  it('o IP vai para a fronteira partilhada, já extraído do proxy', async () => {
    await correr();
    expect(registarTenant.mock.calls[0]?.[1]).toEqual({
      ip: '41.220.0.9',
      idempotencyKey: 'chave-de-teste-1234',
    });
  });

  it('mede a conversão uma vez, no domínio do site e sem PII', async () => {
    await correr({ dados: DADOS, idempotencyKey: 'k1234567', utm: { utm_source: 'google' } } as never);

    expect(registarEventoPlausible).toHaveBeenCalledTimes(1);
    const [nome, opcoes] = registarEventoPlausible.mock.calls[0] as [string, { url: string; props: Record<string, string> }];
    expect(nome).toBe('registo_concluido');
    expect(opcoes.url).toContain('utm_source=google');
    expect(opcoes.props).toEqual({ plano: 'PROFISSIONAL' });
  });

  it('a reentrega idempotente NÃO volta a contar a conversão', async () => {
    registarTenant.mockResolvedValue(sucesso({ repetido: true }));
    await correr();
    expect(registarEventoPlausible).not.toHaveBeenCalled();
  });

  it('re-normaliza os `utm_*` do cliente — a página não é prova de nada', async () => {
    // O `utm` chega no CORPO da Server Action. Quem a chamar directamente não
    // passou pela normalização da página, e a URL do evento é um canal de
    // saída para um fornecedor externo.
    await correr({
      dados: DADOS,
      idempotencyKey: 'k1234567',
      utm: {
        // Forma normal de um parâmetro repetido numa query string. E a porta
        // por onde a PII passava: `['ana@x.mz'].includes('@')` é `false`, e o
        // `URLSearchParams` escrevia o array na mesma. Só o `normalizarUtm`
        // desfaz arrays — a URL, sozinha, só sabe recusá-los.
        utm_source: ['newsletter', 'outro'],
        utm_content: ['ana@padaria.mz'],
        utm_campaign: 'z'.repeat(5000),
        inventado: 'x',
      },
    } as never);

    const [, opcoes] = registarEventoPlausible.mock.calls[0] as [string, { url: string }];
    const params = new URL(opcoes.url).searchParams;

    expect(opcoes.url).not.toContain('ana');
    expect(opcoes.url).not.toContain('%40');
    expect(opcoes.url).not.toContain('inventado');
    // Sem a re-normalização na action, isto desaparece da URL: o
    // `urlEventoRegisto` recusa o que não é texto, mas não desfaz o array.
    expect(params.get('utm_source')).toBe('newsletter');
    expect(params.get('utm_campaign')?.length).toBe(120);
  });

  it('o `plano` que entra no log e no evento é uma das três constantes', async () => {
    // Vem do cliente e é lido ANTES do Zod da fronteira partilhada: sem
    // saneamento, quem chamasse a action escrevia o que quisesse no nosso log
    // estruturado e no fornecedor de analítica.
    await correr({
      dados: { ...DADOS, planoId: '<script>alert(1)</script>' },
      idempotencyKey: 'k1234567',
    } as never);

    const iniciado = linhasLog.find(
      (l) => (l.dados as { evento?: string })?.evento === 'registo.iniciado',
    );
    expect((iniciado?.dados as { plano?: string })?.plano).toBe('');

    const [, opcoes] = registarEventoPlausible.mock.calls[0] as [string, { props: Record<string, string> }];
    expect(opcoes.props).toEqual({ plano: '' });
  });
});

describe('o signIn falha depois de o provisionamento ter concluído (design §7/§8)', () => {
  beforeEach(() => registarTenant.mockResolvedValue(sucesso()));

  it('lançar no signIn não vira erro genérico — a conta EXISTE', async () => {
    signIn.mockRejectedValue(new Error('CredentialsSignin'));

    const r = await correr();

    expect(r.redireccionou).toBeUndefined();
    expect(r.estado).toMatchObject({ fase: 'sem-sessao', email: 'ana@padaria.mz' });
    expect((r.estado as { mensagem: string }).mensagem).toContain('conta foi criada');
  });

  it('uma URL de erro devolvida pelo signIn conta como falha de sessão', async () => {
    // O Auth.js v5 pode recusar SEM lançar: devolve a URL da página de erro.
    // Ler só a excepção deixava passar por sessão o que não é sessão nenhuma.
    signIn.mockResolvedValue('/auth/erro?error=CredentialsSignin&code=credenciais');

    const r = await correr();

    expect(r.estado).toMatchObject({ fase: 'sem-sessao' });
  });

  it('um `error=` dentro do callbackUrl NÃO é uma falha de sessão', async () => {
    // A leitura por substring dava aqui um falso negativo: mandava para o ecrã
    // de «inicie sessão» quem tinha acabado de entrar. Lê-se o parâmetro.
    // `error=` aparece na cadeia — dentro do `callbackUrl`, que o Auth.js monta
    // a partir do Referer. A procura por subcadeia dizia «falhou»; o parâmetro
    // de topo chama-se `callbackUrl` e não há `error` nenhum.
    signIn.mockResolvedValue('/dashboard?callbackUrl=/vendas?error=algo');

    const r = await correr();

    expect(r.redireccionou).toBe('/dashboard?onboarding=1');
  });

  it('regista o alerta `entrada.imediata.falhou`, que é o que se vigia', async () => {
    signIn.mockRejectedValue(new Error('indisponivel'));
    await correr();

    const alerta = linhasLog.find(
      (l) => (l.dados as { evento?: string })?.evento === 'entrada.imediata.falhou',
    );
    expect(alerta).toBeDefined();
    expect(alerta?.nivel).toBe('error');
    // O `sub` é opaco e é a chave de correlação; o endereço não entra no log.
    expect(JSON.stringify(alerta?.dados)).not.toContain('ana@padaria.mz');
  });

  it('o e-mail de verificação sai à mesma — a conta existe e tem de ser confirmável', async () => {
    signIn.mockRejectedValue(new Error('indisponivel'));
    await correr();
    expect(enviarEmailVerificacao).toHaveBeenCalled();
  });
});

describe('recusa da fronteira partilhada', () => {
  it('devolve o código publicado e não tenta sessão nenhuma', async () => {
    registarTenant.mockResolvedValue({
      ok: false,
      code: 'EMAIL_JA_REGISTADO',
      mensagem: 'Este email já está registado.',
      estado: 409,
    });

    const r = await correr();

    expect(r.estado).toMatchObject({ fase: 'erro', code: 'EMAIL_JA_REGISTADO' });
    expect(signIn).not.toHaveBeenCalled();
    expect(enviarEmailVerificacao).not.toHaveBeenCalled();
    expect(registarEventoPlausible).not.toHaveBeenCalled();
  });

  it('os fieldErrors do Zod chegam ao formulário para acenderem no campo', async () => {
    registarTenant.mockResolvedValue({
      ok: false,
      code: 'VALIDACAO',
      mensagem: 'Dados de registo inválidos.',
      estado: 422,
      detalhes: { fieldErrors: { senha: ['A palavra-passe tem de ter pelo menos 10 caracteres'] } },
    });

    const r = await correr();

    expect((r.estado as { fieldErrors?: Record<string, string[]> }).fieldErrors).toEqual({
      senha: ['A palavra-passe tem de ter pelo menos 10 caracteres'],
    });
  });
});

describe('a palavra-passe não sai daqui', () => {
  it('nem no estado devolvido ao cliente, nem no log', async () => {
    registarTenant.mockResolvedValue(sucesso());
    signIn.mockRejectedValue(new Error('indisponivel'));

    const r = await correr();

    expect(JSON.stringify(r.estado)).not.toContain(SENHA);
    expect(JSON.stringify(linhasLog)).not.toContain(SENHA);
  });

  it('nem no evento de medição', async () => {
    registarTenant.mockResolvedValue(sucesso());
    await correr();
    expect(JSON.stringify(registarEventoPlausible.mock.calls)).not.toContain(SENHA);
  });
});
