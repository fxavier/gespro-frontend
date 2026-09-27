import { describe, expect, it } from 'vitest';
import { hrefActivo } from '../barra-lateral';

// #203: o item «Dashboard» de um grupo aponta para a raiz do módulo e ficava
// activo em todas as sub-páginas, ao lado do item do ecrã actual.
const HREFS = [
  '/dashboard',
  '/contabilidade',
  '/contabilidade/lancamentos',
  '/contabilidade/fluxo-caixa/rubricas',
  '/faturacao/dashboard',
  '/faturacao/series',
  '/rh',
];

describe('hrefActivo', () => {
  it('sub-página: só o item mais específico, não o Dashboard do grupo', () => {
    expect(hrefActivo('/contabilidade/lancamentos', HREFS)).toBe('/contabilidade/lancamentos');
    expect(hrefActivo('/contabilidade/lancamentos/abc/editar', HREFS)).toBe('/contabilidade/lancamentos');
  });

  it('raiz do módulo e sub-página sem item próprio caem no Dashboard do grupo', () => {
    expect(hrefActivo('/contabilidade', HREFS)).toBe('/contabilidade');
    expect(hrefActivo('/contabilidade/balancete', HREFS)).toBe('/contabilidade');
  });

  it('o maior prefixo ganha entre itens aninhados', () => {
    expect(hrefActivo('/contabilidade/fluxo-caixa/rubricas/nova', HREFS)).toBe(
      '/contabilidade/fluxo-caixa/rubricas',
    );
  });

  it('prefixo só por segmento inteiro', () => {
    expect(hrefActivo('/rhx', HREFS)).toBeNull();
    expect(hrefActivo('/faturacao/series-antigas', HREFS)).toBeNull();
  });

  it('/ activa o Dashboard geral', () => {
    expect(hrefActivo('/', HREFS)).toBe('/dashboard');
    expect(hrefActivo('/dashboard', HREFS)).toBe('/dashboard');
  });

  it('rota sem item no menu não activa nada', () => {
    expect(hrefActivo('/definicoes/perfil', HREFS)).toBeNull();
  });
});
