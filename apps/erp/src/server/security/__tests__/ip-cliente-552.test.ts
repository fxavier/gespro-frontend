/**
 * #552 — o IP do cliente que chega aos limitadores.
 *
 * O `X-Forwarded-For` é uma lista a que cada proxy ACRESCENTA, à direita, o
 * endereço de quem lhe ligou. Os valores à esquerda vêm do cliente e são
 * forjáveis; só os últimos `TRUSTED_PROXY_HOPS` foram escritos por proxies
 * nossos. Ler o primeiro valor dava a quem ataca um balde novo por pedido.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ipDoCliente, saltosDeConfianca } from '../ip-cliente';

const h = (c: Record<string, string>) => new Headers(c);

afterEach(() => vi.unstubAllEnvs());

describe('ipDoCliente — omissão: um proxy de confiança (App Runner / Caddy)', () => {
  it('um só valor (o que o proxy escreveu) é o cliente', () => {
    expect(ipDoCliente(h({ 'x-forwarded-for': '41.220.0.9' }))).toBe('41.220.0.9');
  });

  it('valor forjado à esquerda é ignorado: conta o último, que o proxy acrescentou', () => {
    expect(ipDoCliente(h({ 'x-forwarded-for': '1.2.3.4, 41.220.0.9' }))).toBe('41.220.0.9');
    expect(ipDoCliente(h({ 'x-forwarded-for': '9.9.9.9, 8.8.8.8, 41.220.0.9' }))).toBe('41.220.0.9');
  });

  it('mudar o valor forjado não muda o IP', () => {
    const a = ipDoCliente(h({ 'x-forwarded-for': '10.0.0.1, 41.220.0.9' }));
    const b = ipDoCliente(h({ 'x-forwarded-for': '10.0.0.2, 41.220.0.9' }));
    expect(a).toBe(b);
  });

  it('espaços e entradas vazias não contam como saltos', () => {
    expect(ipDoCliente(h({ 'x-forwarded-for': ' 1.2.3.4 ,  41.220.0.9 , ' }))).toBe('41.220.0.9');
    expect(ipDoCliente(h({ 'x-forwarded-for': '  ,  ' }))).toBe('unknown');
  });

  it('IPv6 sai intacto', () => {
    expect(ipDoCliente(h({ 'x-forwarded-for': '1.2.3.4, 2001:db8::1' }))).toBe('2001:db8::1');
  });

  it('sem XFF, recorre ao x-real-ip; sem nenhum, `unknown`', () => {
    expect(ipDoCliente(h({ 'x-real-ip': ' 197.218.4.7 ' }))).toBe('197.218.4.7');
    expect(ipDoCliente(h({}))).toBe('unknown');
    expect(ipDoCliente(undefined)).toBe('unknown');
  });

  it('com XFF, o x-real-ip não é lido', () => {
    expect(ipDoCliente(h({ 'x-forwarded-for': '41.220.0.9', 'x-real-ip': '6.6.6.6' }))).toBe('41.220.0.9');
  });
});

describe('ipDoCliente — TRUSTED_PROXY_HOPS', () => {
  it('2 saltos (ex.: CDN + balanceador): o penúltimo é o cliente', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '2');
    expect(ipDoCliente(h({ 'x-forwarded-for': '1.2.3.4, 41.220.0.9, 10.0.0.1' }))).toBe('41.220.0.9');
  });

  it('2 saltos com cadeia mais curta do que o esperado: o valor mais à esquerda', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '2');
    expect(ipDoCliente(h({ 'x-forwarded-for': '41.220.0.9' }))).toBe('41.220.0.9');
  });

  it('0 saltos (sem proxy de confiança): nenhum cabeçalho é de confiança → `unknown`', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '0');
    expect(ipDoCliente(h({ 'x-forwarded-for': '41.220.0.9', 'x-real-ip': '197.218.4.7' }))).toBe('unknown');
  });

  it.each(['-1', 'um', '1.5', '2x'])('valor inválido «%s» lança, não adivinha', (v) => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', v);
    expect(() => saltosDeConfianca()).toThrow(/TRUSTED_PROXY_HOPS/);
  });

  it('por omissão é 1', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', undefined as unknown as string);
    expect(saltosDeConfianca()).toBe(1);
  });
});
