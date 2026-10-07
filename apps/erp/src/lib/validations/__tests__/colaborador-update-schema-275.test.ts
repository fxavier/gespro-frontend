/**
 * Oráculo das issues #272/#275 — o schema de edição do colaborador só aceita o que o
 * `ColaboradorService.actualizar` grava.
 *
 * #272 (tipo de contrato e regime descartados) já está corrigido no serviço e tem regressão em
 * `src/server/services/pessoas-projetos/__tests__/colaborador-contrato-regime.test.ts`. O que fica
 * por fechar é a #275: `UpdateColaboradorSchema = CreateColaboradorSchema.partial().omit({codigo})`
 * aceita 23 campos (e `status`) que o `actualizar` ignora — «sucesso» e nada muda.
 *
 * Contrato (opção conservadora: recusar > aceitar em silêncio):
 *   1. As chaves do `UpdateColaboradorSchema` são EXACTAMENTE os campos que o `actualizar` grava
 *      (lista `EDITAVEIS`, lida de rh.service.ts). Nem mais (buraco da #272/#161), nem menos
 *      (o formulário de edição deixaria de poder mandar um campo que o serviço sabe gravar).
 *   2. Um pedido com qualquer campo fora dessa lista — `codigo`, `status` ou um dos 23 — é
 *      RECUSADO pela validação (`safeParse` falha). Despir a chave em silêncio não conta: era
 *      exactamente «sucesso e nada muda».
 *   3. Continua parcial: `{}` e qualquer subconjunto dos editáveis passam, e o resultado não
 *      ganha chaves que o pedido não trazia (sem defaults injectados — ex.: `nivelAcesso`).
 *   4. O que o formulário de edição manda hoje continua a passar.
 *
 * Escrito pelo verificador do nó D:colaborador-editar-272; um agente de implementação que o
 * altere é BLOCKER.
 */
import { describe, expect, it } from 'vitest';
import { CreateColaboradorSchema, UpdateColaboradorSchema } from '@/lib/validations/rh';

/** Os campos que `ColaboradorService.actualizar` põe no `data` do `update`. */
const EDITAVEIS = [
  'nome',
  'email',
  'telefone',
  'tipoContrato',
  'regimeTrabalho',
  'departamentoId',
  'cargoId',
  'supervisorId',
  'salarioBase',
  'subsidioAlimentacao',
  'subsidioTransporte',
  'subsidioHabitacao',
  'subsidiosOutros',
  'horarioTrabalho',
  'localizacao',
  'nivelAcesso',
  'observacoes',
  'fotoUrl',
] as const;

/** Valores VÁLIDOS para o schema de criação de cada campo que o `actualizar` ignora. */
const IGNORADOS: Record<string, unknown> = {
  codigo: 'COL-999',
  status: 'INACTIVO',
  dataNascimento: new Date(1991, 1, 2, 12),
  genero: 'MASCULINO',
  estadoCivil: 'CASADO',
  nacionalidade: 'Moçambicana',
  naturalidadeProvincia: 'Sofala',
  naturalidadeDistrito: 'Beira',
  bi: '110100000001B',
  nuit: '100000002',
  niss: '12345678901',
  telefoneAlternativo: '+258840000009',
  enderecoRua: 'Av. Eduardo Mondlane',
  enderecoNumero: '22',
  enderecoBairro: 'Sommerschield',
  enderecoCidade: 'Maputo',
  enderecoProvincia: 'Maputo',
  enderecoCodigoPostal: '1100',
  emergenciaNome: 'Outro Contacto',
  emergenciaParentesco: 'Mãe',
  emergenciaTelefone: '+258840000008',
  dataAdmissao: new Date(2025, 5, 1, 12),
  bancoBanco: 'BCI',
  bancoNib: '000800000000000000000',
  bancoTitular: 'Ana Maria',
};

const CUID_A = 'cjld2cjxh0000qzrmn831i7rn';
const CUID_B = 'cjld2cjxh0001qzrmn831i7ro';
const CUID_C = 'cjld2cjxh0002qzrmn831i7rp';

/** Payload com todos os editáveis preenchidos com valores válidos. */
const TODOS_EDITAVEIS = {
  nome: 'Ana Maria Editada',
  email: 'ana.editada@test.mz',
  telefone: '+258841111111',
  tipoContrato: 'TERMO_CERTO',
  regimeTrabalho: 'TEMPO_PARCIAL',
  departamentoId: CUID_A,
  cargoId: CUID_B,
  supervisorId: CUID_C,
  salarioBase: 45000,
  subsidioAlimentacao: 1500,
  subsidioTransporte: 2000,
  subsidioHabitacao: 3000,
  subsidiosOutros: 500,
  horarioTrabalho: '08:00-17:00',
  localizacao: 'Sede',
  nivelAcesso: 'GERENTE',
  observacoes: 'Revisto',
  fotoUrl: 'https://exemplo.mz/foto.png',
};

const schema = UpdateColaboradorSchema as unknown as {
  shape?: Record<string, unknown>;
  safeParse: (v: unknown) => { success: boolean; data?: Record<string, unknown> };
};

describe('UpdateColaboradorSchema alinhado com ColaboradorService.actualizar (#275)', () => {
  it('as chaves do schema são exactamente os campos que o actualizar grava', () => {
    const chaves = Object.keys(schema.shape ?? {}).sort();
    expect(chaves).toEqual([...EDITAVEIS].sort());
  });

  it('o payload de teste cobre todos os editáveis (guarda do próprio oráculo)', () => {
    expect(Object.keys(TODOS_EDITAVEIS).sort()).toEqual([...EDITAVEIS].sort());
  });

  it('aceita {} (edição parcial) sem injectar chaves', () => {
    const r = schema.safeParse({});
    expect(r.success).toBe(true);
    expect(r.data).toEqual({});
  });

  it('aceita todos os editáveis e devolve-os sem chaves a mais', () => {
    const r = schema.safeParse(TODOS_EDITAVEIS);
    expect(r.success, JSON.stringify(r)).toBe(true);
    expect(Object.keys(r.data ?? {}).sort()).toEqual([...EDITAVEIS].sort());
  });

  it('aceita o que o formulário de edição manda hoje', () => {
    const r = schema.safeParse({
      nome: 'Ana Maria',
      email: 'ana@test.mz',
      telefone: '+258840000000',
      tipoContrato: 'EFECTIVO',
      regimeTrabalho: 'TEMPO_INTEGRAL',
      salarioBase: 30000,
      observacoes: undefined,
      departamentoId: CUID_A,
      cargoId: undefined,
      subsidioAlimentacao: 1000,
      subsidioTransporte: undefined,
      subsidioHabitacao: undefined,
      subsidiosOutros: 0,
    });
    expect(r.success, JSON.stringify(r)).toBe(true);
    expect(r.data).not.toHaveProperty('nivelAcesso');
    expect(r.data).not.toHaveProperty('status');
  });

  it('a lista de ignorados tem os 23 campos da #275 mais codigo e status', () => {
    expect(Object.keys(IGNORADOS)).toHaveLength(25);
  });

  it('os valores dos ignorados são válidos no schema de criação (a recusa não pode vir do valor)', () => {
    const shape = CreateColaboradorSchema.shape as Record<string, { safeParse: (v: unknown) => { success: boolean } }>;
    for (const [campo, valor] of Object.entries(IGNORADOS)) {
      expect(shape[campo], `campo «${campo}» não existe no schema de criação`).toBeDefined();
      expect(shape[campo].safeParse(valor).success, `valor inválido para «${campo}»`).toBe(true);
    }
  });

  for (const [campo, valor] of Object.entries(IGNORADOS)) {
    it(`recusa «${campo}» — o actualizar não o grava`, () => {
      const r = schema.safeParse({ nome: 'Ana Maria', [campo]: valor });
      expect(r.success, `«${campo}» foi aceite: ${JSON.stringify(r.data)}`).toBe(false);
    });
  }
});
