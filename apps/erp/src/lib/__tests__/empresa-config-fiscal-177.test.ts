/**
 * Oráculo do nó C:empresa-config-fiscal-177 (issue #177) — unit: schema do formulário e porta da rota.
 *
 * Escrito pelo verificador ANTES da implementação; quem implementa não o altera (BLOCKER).
 *
 * Contrato (decisão do orquestrador + escolhas conservadoras do verificador):
 *   S1 `DadosEmpresaSchema` (em `@/lib/validations/plataforma`) é o schema do formulário E da action:
 *      `nome`, `nuit` (com a validação existente — `nuitSchema`/`validarNUIT`), `regimeIva` e a morada
 *      (`endereco`, `cidade`, `provincia`, `codigoPostal`) mais contactos (`email`, `telefone`).
 *   S2 NUIT inválido (≠ 9 dígitos, 9 dígitos iguais, letras) → recusado pelo schema.
 *   S3 Província fora da lista de Moçambique → recusada; regime fora do enum → recusado.
 *   S4 Não leva chaves de outras autoridades: `planoAssinatura`, `statusAtivo`, `slug`, `id`,
 *      `tenantId` não sobrevivem ao parse (o tenant vem SEMPRE do contexto).
 *   S5 Um formulário com contactos vazios (`''`) submete — o `zodResolver` recusar o e-mail vazio
 *      era um formulário que não faz nada sem dizer porquê.
 *   R1 A rota é `/definicoes/empresa`, guardada pela permissão de administração EXISTENTE
 *      `core_tenancy:configurar` (a das actions de configuração do tenant) — só o ADMIN a tem;
 *      GESTOR, FINANCEIRO, OPERADOR e LEITURA não veem a rota.
 *   R2 `definicoes/empresa/layout.tsx` chama `exigirPermissaoPagina('/definicoes/empresa')`;
 *      `page.tsx` é Server Component.
 *
 * Acesso dinâmico: enquanto o schema não existir falha cada caso, não o ficheiro.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as validacoes from '@/lib/validations/plataforma';
import { permissaoDaRota, podeVerRota } from '@/lib/permissoes-rotas';
import { SYSTEM_ROLES } from '../../../prisma/seed/rbac';

const RAIZ = path.resolve(__dirname, '../../..'); // apps/erp
const DIR_ROTA = path.join(RAIZ, 'src', 'app', '(dashboard)', 'definicoes', 'empresa');

const schema = (): any => {
  const s = (validacoes as Record<string, any>).DadosEmpresaSchema;
  expect(s, 'DadosEmpresaSchema não está exportado de @/lib/validations/plataforma').toBeDefined();
  return s;
};

const VALIDO = {
  nome: 'Mercearia Oráculo, Lda',
  nuit: '400177177',
  regimeIva: 'SIMPLIFICADO',
  endereco: 'Av. 24 de Julho, 177',
  cidade: 'Maputo',
  provincia: 'Maputo Cidade',
  codigoPostal: '1100',
  email: 'geral@oraculo.mz',
  telefone: '+258 84 000 0177',
};

const perms = (papel: string): string[] =>
  SYSTEM_ROLES.find((r) => r.nome === papel)?.permissionCodes ?? [];

describe('#177 — DadosEmpresaSchema', () => {
  it('S1: aceita os dados completos da empresa e devolve-os', () => {
    const r = schema().safeParse(VALIDO);
    expect(r.success, JSON.stringify(r.error?.flatten?.())).toBe(true);
    expect(r.data).toMatchObject(VALIDO);
  });

  it('S1: a província de teste existe mesmo na lista de Moçambique (não-vacuidade do S3)', () => {
    expect(validacoes.provinciaSchema.safeParse(VALIDO.provincia).success).toBe(true);
  });

  it.each([
    ['8 dígitos', '40017717'],
    ['10 dígitos', '4001771770'],
    ['9 dígitos iguais', '111111111'],
    ['letras', '40017717A'],
    ['vazio', ''],
  ])('S2: NUIT inválido (%s) → recusado', (_rotulo, nuit) => {
    const r = schema().safeParse({ ...VALIDO, nuit });
    expect(r.success).toBe(false);
    expect(Object.keys(r.error?.flatten?.().fieldErrors ?? {})).toContain('nuit');
  });

  it('S2: o NUIT é obrigatório (o PDF fiscal não sai sem ele)', () => {
    const { nuit: _n, ...semNuit } = VALIDO;
    expect(schema().safeParse(semNuit).success).toBe(false);
  });

  it('S3: província que não é de Moçambique → recusada', () => {
    const r = schema().safeParse({ ...VALIDO, provincia: 'Lisboa' });
    expect(r.success).toBe(false);
    expect(Object.keys(r.error?.flatten?.().fieldErrors ?? {})).toContain('provincia');
  });

  it('S3: regime de IVA fora do enum → recusado', () => {
    expect(schema().safeParse({ ...VALIDO, regimeIva: 'ESPECIAL' }).success).toBe(false);
  });

  it('S3: nome vazio → recusado', () => {
    expect(schema().safeParse({ ...VALIDO, nome: '' }).success).toBe(false);
  });

  it('S4: plano, estado, slug, id e tenantId não passam o parse', () => {
    const r = schema().safeParse({
      ...VALIDO,
      planoAssinatura: 'EMPRESARIAL',
      statusAtivo: false,
      slug: 'outro-slug',
      id: 'cl_outro_tenant',
      tenantId: 'cl_outro_tenant',
    });
    expect(r.success, JSON.stringify(r.error?.flatten?.())).toBe(true);
    for (const chave of ['planoAssinatura', 'statusAtivo', 'slug', 'id', 'tenantId']) {
      expect(r.data, `«${chave}» chegou ao serviço`).not.toHaveProperty(chave);
    }
  });

  it('S5: contactos e morada vazios ("") não impedem o formulário de submeter', () => {
    const r = schema().safeParse({
      nome: VALIDO.nome,
      nuit: VALIDO.nuit,
      regimeIva: 'NORMAL',
      endereco: '',
      cidade: '',
      codigoPostal: '',
      email: '',
      telefone: '',
    });
    expect(r.success, JSON.stringify(r.error?.flatten?.())).toBe(true);
  });
});

describe('#177 — rota /definicoes/empresa', () => {
  it('R1: guardada por core_tenancy:configurar (permissão de administração existente)', () => {
    expect(permissaoDaRota('/definicoes/empresa')).toBe('core_tenancy:configurar');
  });

  it('R1: o ADMIN vê a rota; GESTOR, FINANCEIRO, OPERADOR e LEITURA não', () => {
    expect(perms('ADMIN')).toContain('core_tenancy:configurar');
    expect(podeVerRota('/definicoes/empresa', perms('ADMIN'))).toBe(true);
    for (const papel of ['GESTOR', 'FINANCEIRO', 'OPERADOR', 'LEITURA']) {
      expect(perms(papel).length, `papel ${papel} existe no seed`).toBeGreaterThan(0);
      expect(podeVerRota('/definicoes/empresa', perms(papel)), papel).toBe(false);
    }
  });

  it('R1: a subscrição continua com a sua permissão (o prefixo novo não a engole)', () => {
    expect(permissaoDaRota('/definicoes/faturacao')).toBe('assinatura:ver');
  });

  it('R2: layout.tsx da rota chama exigirPermissaoPagina com a própria rota', () => {
    const layout = path.join(DIR_ROTA, 'layout.tsx');
    expect(existsSync(layout), `${layout} não existe`).toBe(true);
    const fonte = readFileSync(layout, 'utf8');
    expect(fonte).toMatch(/exigirPermissaoPagina\(\s*['"]\/definicoes\/empresa['"]\s*\)/);
  });

  it('R2: page.tsx existe e é Server Component', () => {
    const pagina = path.join(DIR_ROTA, 'page.tsx');
    expect(existsSync(pagina), `${pagina} não existe`).toBe(true);
    expect(readFileSync(pagina, 'utf8')).not.toMatch(/^\s*['"]use client['"]/m);
  });
});
