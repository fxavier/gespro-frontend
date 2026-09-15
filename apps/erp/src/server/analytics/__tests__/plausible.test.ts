/**
 * Medição do funil através da fronteira de domínio (spec 21, tarefa 7).
 *
 * O que estes testes guardam, por ordem de importância:
 *   1. ZERO PII no que sai daqui (Requisito 7.2) — incluindo o IP.
 *   2. Os `utm_*` sobrevivem ao salto site → ERP.
 *   3. Desligado por omissão (ADR-0008): sem domínio, não há chamada nenhuma.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EVENTOS_PLAUSIBLE,
  normalizarUtm,
  registarEventoPlausible,
  urlEventoRegisto,
} from '../plausible';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function ok() {
  return { ok: true, status: 202 } as Response;
}

function corpoEnviado(): Record<string, unknown> {
  return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
}

function cabecalhosEnviados(): Record<string, string> {
  return (fetchMock.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SITE_URL = 'https://gestpro.co.mz';
  process.env.PLAUSIBLE_DOMINIO = 'gestpro.co.mz';
  delete process.env.PLAUSIBLE_HOST;
});

afterEach(() => {
  delete process.env.SITE_URL;
  delete process.env.PLAUSIBLE_DOMINIO;
});

describe('normalizarUtm', () => {
  it('deixa passar as cinco chaves conhecidas e mais nenhuma', () => {
    const utm = normalizarUtm({
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'trial-mz',
      utm_content: 'variante-b',
      utm_term: 'erp mocambique',
      // Tudo abaixo é lixo que quem constrói o link pode acrescentar.
      email: 'ana@padaria.mz',
      plano: 'PROFISSIONAL',
      utm_qualquer_coisa: 'x',
    });

    expect(Object.keys(utm).sort()).toEqual([
      'utm_campaign',
      'utm_content',
      'utm_medium',
      'utm_source',
      'utm_term',
    ]);
  });

  it('aceita a primeira ocorrência quando o parâmetro vem repetido', () => {
    expect(normalizarUtm({ utm_source: ['google', 'bing'] })).toEqual({ utm_source: 'google' });
  });

  it('descarta valores vazios', () => {
    expect(normalizarUtm({ utm_source: '   ' })).toEqual({});
  });

  it('descarta um utm com forma de endereço — é o canal por onde a PII fugia', () => {
    // `utm_content=<endereço do destinatário>` é prática corrente numa campanha
    // de e-mail. Sem isto, o endereço entrava na URL do evento e chegava ao
    // fornecedor — o filtro das `props` não guarda a URL.
    expect(
      normalizarUtm({ utm_source: 'newsletter', utm_content: 'ana@padaria.mz' }),
    ).toEqual({ utm_source: 'newsletter' });
  });

  it('trunca valores compridos de mais', () => {
    const { utm_campaign: valor } = normalizarUtm({ utm_campaign: 'x'.repeat(5000) });
    expect(valor?.length).toBe(120);
  });
});

describe('urlEventoRegisto', () => {
  it('aponta para a entrada do funil NO DOMÍNIO DO SITE, com os utm_*', () => {
    const url = urlEventoRegisto({ utm_source: 'google', utm_campaign: 'trial-mz' });

    // /comecar e não /registo: o evento é atribuído ao domínio do site, e é o
    // Plausible que lê os utm_* da própria URL. É a mesma URL do canónico.
    expect(url).toBe('https://gestpro.co.mz/comecar?utm_source=google&utm_campaign=trial-mz');
  });

  it('sem utm_*, é a entrada do funil e mais nada', () => {
    expect(urlEventoRegisto({})).toBe('https://gestpro.co.mz/comecar');
  });

  it('NÃO deixa um endereço entrar na URL, mesmo que lhe seja entregue à mão', () => {
    // A URL é um canal de saída tão real como as `props`, e durante uma versão
    // foi o canal por onde a PII passava. Quem chame esta função com um `Utm`
    // que não veio do `normalizarUtm` não a consegue furar.
    const url = urlEventoRegisto({
      utm_source: 'newsletter',
      utm_content: 'ana@padaria.mz',
    } as Parameters<typeof urlEventoRegisto>[0]);

    expect(url).not.toContain('ana');
    expect(url).not.toContain('%40');
    expect(url).toBe('https://gestpro.co.mz/comecar?utm_source=newsletter');
  });

  it('recusa na URL um utm que não seja texto — o array era a porta de trás', () => {
    // `['ana@x.mz'].includes('@')` é `false`: o `includes` de um array compara
    // ELEMENTOS, não subcadeias. Sem o guarda de tipo, o filtro do endereço
    // não via nada e o `URLSearchParams` escrevia o array na mesma,
    // codificado — o endereço saía inteiro para o fornecedor. O `Utm` diz que
    // são strings, mas isto atravessa a fronteira de uma Server Action, onde o
    // tipo não é aplicado em tempo de execução.
    const url = urlEventoRegisto({
      utm_source: 'newsletter',
      utm_content: ['ana@padaria.mz'],
    } as unknown as Parameters<typeof urlEventoRegisto>[0]);

    expect(url).not.toContain('ana');
    expect(url).not.toContain('%40');
    expect(url).toBe('https://gestpro.co.mz/comecar?utm_source=newsletter');
  });

  it('trunca na URL o que lhe chegue comprido de mais', () => {
    const url = urlEventoRegisto({ utm_campaign: 'y'.repeat(5000) });
    expect(new URL(url).searchParams.get('utm_campaign')?.length).toBe(120);
  });
});

describe('registarEventoPlausible', () => {
  it('sem PLAUSIBLE_DOMINIO não chama nada (ADR-0008: desligado por omissão)', async () => {
    delete process.env.PLAUSIBLE_DOMINIO;

    const enviado = await registarEventoPlausible(EVENTOS_PLAUSIBLE.registoConcluido, {
      url: urlEventoRegisto({}),
    });

    expect(enviado).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envia o evento com o domínio do SITE e sem o IP de quem se regista', async () => {
    fetchMock.mockResolvedValueOnce(ok());

    await registarEventoPlausible(EVENTOS_PLAUSIBLE.registoConcluido, {
      url: urlEventoRegisto({ utm_source: 'newsletter' }),
      props: { plano: 'BASICO' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://plausible.io/api/event');

    const corpo = corpoEnviado();
    expect(corpo.domain).toBe('gestpro.co.mz');
    expect(corpo.name).toBe('registo_concluido');
    expect(corpo.props).toEqual({ plano: 'BASICO' });

    // O Requisito 7.2 proíbe o IP no evento, e o protocolo do Plausible
    // recebe-o por este cabeçalho. Se alguém o acrescentar «para a atribuição
    // funcionar», este teste acende.
    const cabecalhos = cabecalhosEnviados();
    const nomes = Object.keys(cabecalhos).map((n) => n.toLowerCase());
    expect(nomes).not.toContain('x-forwarded-for');
    expect(nomes).not.toContain('x-real-ip');
  });

  it('recusa propriedades com nome reservado a PII', async () => {
    fetchMock.mockResolvedValueOnce(ok());

    await registarEventoPlausible('registo_concluido', {
      url: urlEventoRegisto({}),
      props: { plano: 'BASICO', nuit: '123456789', nome: 'Ana Machava' },
    });

    expect(corpoEnviado().props).toEqual({ plano: 'BASICO' });
  });

  it('recusa propriedades que pareçam um endereço, seja qual for o nome', async () => {
    fetchMock.mockResolvedValueOnce(ok());

    await registarEventoPlausible('registo_concluido', {
      url: urlEventoRegisto({}),
      props: { plano: 'BASICO', referencia: 'ana@padaria.mz' },
    });

    expect(corpoEnviado().props).toEqual({ plano: 'BASICO' });
  });

  it('uma falha de rede não lança — medir não pode partir um registo', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(
      registarEventoPlausible('registo_concluido', { url: urlEventoRegisto({}) }),
    ).resolves.toBe(false);
  });

  it('honra PLAUSIBLE_HOST (self-hosted / região EU)', async () => {
    process.env.PLAUSIBLE_HOST = 'https://analytics.gestpro.co.mz/';
    fetchMock.mockResolvedValueOnce(ok());

    await registarEventoPlausible('registo_concluido', { url: urlEventoRegisto({}) });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://analytics.gestpro.co.mz/api/event',
    );
  });
});
