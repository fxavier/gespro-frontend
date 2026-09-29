/**
 * Oráculo da issue #161 — formulário de colaborador.
 *
 * Contrato:
 *   1. `ColaboradorService.listarOpcoes(ctx)` devolve os departamentos e cargos
 *      do tenant do contexto, só os `ativo: true`, cada lista ordenada por nome
 *      ascendente, exactamente com os campos
 *        departamentos: { id, nome }
 *        cargos:        { id, nome, departamentoId }
 *   2. `ColaboradorService.actualizar` grava `subsidiosOutros` (hoje é
 *      descartado em silêncio).
 *   3. Guarda de regressão: `actualizar` continua a gravar departamentoId,
 *      cargoId, subsidioAlimentacao, subsidioTransporte e subsidioHabitacao.
 *
 * Requer o Postgres local (DATABASE_URL em .env). Dados isolados em dois
 * tenants próprios, apagados no fim.
 */

import 'dotenv/config';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prismaBase } from '@/server/db/client';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ColaboradorService } from '@/server/services/pessoas-projetos/rh.service';

const SUFIXO = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TENANT_ID = `test-tenant-colab-op-${SUFIXO}`;
const OUTRO_TENANT_ID = `test-tenant-colab-op-b-${SUFIXO}`;
const USER_ID = `test-user-colab-op-${SUFIXO}`;

const ctx = { tenantId: TENANT_ID, userId: USER_ID };

// Tipagem mínima do contrato novo — o método ainda não existe no serviço.
type Opcoes = {
  departamentos: { id: string; nome: string }[];
  cargos: { id: string; nome: string; departamentoId: string | null }[];
};
const listarOpcoes = (c: typeof ctx): Promise<Opcoes> =>
  (ColaboradorService as unknown as { listarOpcoes: (c: typeof ctx) => Promise<Opcoes> }).listarOpcoes(c);

let n = 0;
const codigo = (p: string) => `${p}-${SUFIXO}-${++n}`;

const ids = {
  depFinancas: '',
  depArmazem: '',
  depComercial: '',
  depInactivo: '',
  depOutroTenant: '',
  cargoTesoureiro: '',
  cargoAuditor: '',
  cargoMotorista: '',
  cargoInactivo: '',
  cargoOutroTenant: '',
  colaborador: '',
};

async function criarDepartamento(tenantId: string, nome: string, ativo = true) {
  const d = await prismaBase.departamento.create({
    data: { tenantId, codigo: codigo('DEP'), nome, ativo },
  });
  return d.id;
}

async function criarCargo(tenantId: string, nome: string, departamentoId: string | null, ativo = true) {
  const c = await prismaBase.cargo.create({
    data: { tenantId, codigo: codigo('CAR'), nome, departamentoId, ativo },
  });
  return c.id;
}

beforeAll(async () => {
  for (const [i, [id, slug]] of (
    [
      [TENANT_ID, `test-colab-op-${SUFIXO}`],
      [OUTRO_TENANT_ID, `test-colab-op-b-${SUFIXO}`],
    ] as const
  ).entries()) {
    await prismaBase.tenant.create({
      data: {
        id,
        nome: `Tenant de Teste Colaborador ${slug}`,
        slug,
        nuit: `${Date.now()}${i}`.slice(-9),
      },
    });
  }
  await prismaBase.user.create({
    data: {
      id: USER_ID,
      tenantId: TENANT_ID,
      nome: 'Gestor RH',
      email: `${USER_ID}@test.local`,
      keycloakSub: `kc-${USER_ID}`,
    },
  });

  // Criados fora de ordem alfabética, para a ordenação ser provada.
  ids.depFinancas = await criarDepartamento(TENANT_ID, 'Finanças');
  ids.depArmazem = await criarDepartamento(TENANT_ID, 'Armazém');
  ids.depComercial = await criarDepartamento(TENANT_ID, 'Comercial');
  ids.depInactivo = await criarDepartamento(TENANT_ID, 'Antigo Inactivo', false);
  ids.depOutroTenant = await criarDepartamento(OUTRO_TENANT_ID, 'Administração Alheia');

  ids.cargoTesoureiro = await criarCargo(TENANT_ID, 'Tesoureiro', ids.depFinancas);
  ids.cargoMotorista = await criarCargo(TENANT_ID, 'Motorista', null);
  ids.cargoAuditor = await criarCargo(TENANT_ID, 'Auditor', ids.depFinancas);
  ids.cargoInactivo = await criarCargo(TENANT_ID, 'Aprendiz Inactivo', ids.depArmazem, false);
  ids.cargoOutroTenant = await criarCargo(OUTRO_TENANT_ID, 'Analista Alheio', ids.depOutroTenant);

  const colab = await prismaBase.colaborador.create({
    data: {
      tenantId: TENANT_ID,
      codigo: codigo('COL'),
      nome: 'Ana Colaboradora',
      dataNascimento: new Date(1990, 0, 15, 12),
      genero: 'FEMININO',
      estadoCivil: 'SOLTEIRO',
      nacionalidade: 'Moçambicana',
      naturalidadeProvincia: 'Maputo',
      naturalidadeDistrito: 'KaMpfumo',
      bi: '110100000000A',
      nuit: '100000001',
      email: `ana-${SUFIXO}@test.local`,
      telefone: '+258840000000',
      enderecoRua: 'Av. 24 de Julho',
      enderecoNumero: '1',
      enderecoBairro: 'Polana',
      enderecoCidade: 'Maputo',
      enderecoProvincia: 'Maputo',
      emergenciaNome: 'Contacto',
      emergenciaParentesco: 'Irmão',
      emergenciaTelefone: '+258840000001',
      dataAdmissao: new Date(2024, 0, 2, 12),
      status: 'ACTIVO',
      tipoContrato: 'EFECTIVO',
      regimeTrabalho: 'TEMPO_INTEGRAL',
      salarioBase: 30000,
      nivelAcesso: 'USUARIO',
    },
  });
  ids.colaborador = colab.id;
});

afterAll(async () => {
  const tenants = { in: [TENANT_ID, OUTRO_TENANT_ID] };
  await prismaBase.colaborador.deleteMany({ where: { tenantId: tenants } });
  await prismaBase.cargo.deleteMany({ where: { tenantId: tenants } });
  await prismaBase.departamento.deleteMany({ where: { tenantId: tenants } });
  await prismaBase.user.deleteMany({ where: { tenantId: tenants } });
  await prismaBase.tenant.deleteMany({ where: { id: tenants } });
});

describe('ColaboradorService.listarOpcoes', () => {
  it('devolve só os departamentos activos do tenant, por nome, com { id, nome }', async () => {
    const opcoes = await runWithTenantContext(ctx, () => listarOpcoes(ctx));

    expect(opcoes.departamentos).toEqual([
      { id: ids.depArmazem, nome: 'Armazém' },
      { id: ids.depComercial, nome: 'Comercial' },
      { id: ids.depFinancas, nome: 'Finanças' },
    ]);
  });

  it('devolve só os cargos activos do tenant, por nome, com { id, nome, departamentoId }', async () => {
    const opcoes = await runWithTenantContext(ctx, () => listarOpcoes(ctx));

    expect(opcoes.cargos).toEqual([
      { id: ids.cargoAuditor, nome: 'Auditor', departamentoId: ids.depFinancas },
      { id: ids.cargoMotorista, nome: 'Motorista', departamentoId: null },
      { id: ids.cargoTesoureiro, nome: 'Tesoureiro', departamentoId: ids.depFinancas },
    ]);
  });

  it('não expõe registos de outro tenant nem inactivos', async () => {
    const opcoes = await runWithTenantContext(ctx, () => listarOpcoes(ctx));
    const todos = [...opcoes.departamentos, ...opcoes.cargos].map((o) => o.id);

    expect(todos).not.toContain(ids.depOutroTenant);
    expect(todos).not.toContain(ids.cargoOutroTenant);
    expect(todos).not.toContain(ids.depInactivo);
    expect(todos).not.toContain(ids.cargoInactivo);
  });
});

describe('ColaboradorService.actualizar', () => {
  it('grava subsidiosOutros', async () => {
    await runWithTenantContext(ctx, () =>
      ColaboradorService.actualizar(ids.colaborador, { subsidiosOutros: 1234.5 }, ctx),
    );

    const gravado = await prismaBase.colaborador.findUniqueOrThrow({
      where: { id: ids.colaborador },
      select: { subsidiosOutros: true },
    });
    expect(gravado.subsidiosOutros?.toString()).toBe('1234.5');
  });

  it('[regressão] grava departamentoId, cargoId e os subsídios de alimentação, transporte e habitação', async () => {
    await runWithTenantContext(ctx, () =>
      ColaboradorService.actualizar(
        ids.colaborador,
        {
          departamentoId: ids.depFinancas,
          cargoId: ids.cargoTesoureiro,
          subsidioAlimentacao: 1500,
          subsidioTransporte: 800.25,
          subsidioHabitacao: 2000,
        },
        ctx,
      ),
    );

    const gravado = await prismaBase.colaborador.findUniqueOrThrow({
      where: { id: ids.colaborador },
      select: {
        departamentoId: true,
        cargoId: true,
        subsidioAlimentacao: true,
        subsidioTransporte: true,
        subsidioHabitacao: true,
      },
    });
    expect(gravado.departamentoId).toBe(ids.depFinancas);
    expect(gravado.cargoId).toBe(ids.cargoTesoureiro);
    expect(gravado.subsidioAlimentacao?.toString()).toBe('1500');
    expect(gravado.subsidioTransporte?.toString()).toBe('800.25');
    expect(gravado.subsidioHabitacao?.toString()).toBe('2000');
  });
});
