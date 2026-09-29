/**
 * Oráculo da issue #272 — tipo de contrato e regime de trabalho do colaborador.
 *
 * Contrato:
 *   1. `ColaboradorService.actualizar` grava `tipoContrato` e `regimeTrabalho`
 *      (hoje são descartados em silêncio: o formulário mostra sucesso e nada muda).
 *   2. Chamar `actualizar` sem esses campos não lhes toca (undefined = não mexer).
 *
 * Requer o Postgres local (DATABASE_URL em .env). Dados isolados num tenant
 * próprio, apagado no fim.
 */

import 'dotenv/config';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prismaBase } from '@/server/db/client';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ColaboradorService } from '@/server/services/pessoas-projetos/rh.service';

const SUFIXO = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TENANT_ID = `test-tenant-colab-cr-${SUFIXO}`;
const USER_ID = `test-user-colab-cr-${SUFIXO}`;

const ctx = { tenantId: TENANT_ID, userId: USER_ID };

let n = 0;
const codigo = (p: string) => `${p}-${SUFIXO}-${++n}`;

async function criarColaborador(nome: string) {
  const colab = await prismaBase.colaborador.create({
    data: {
      tenantId: TENANT_ID,
      codigo: codigo('COL'),
      nome,
      dataNascimento: new Date(1990, 0, 15, 12),
      genero: 'FEMININO',
      estadoCivil: 'SOLTEIRO',
      nacionalidade: 'Moçambicana',
      naturalidadeProvincia: 'Maputo',
      naturalidadeDistrito: 'KaMpfumo',
      bi: `11010000000${n}A`,
      nuit: `10000000${n}`,
      email: `colab-${n}-${SUFIXO}@test.local`,
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
  return colab.id;
}

const lerContratoRegime = (id: string) =>
  prismaBase.colaborador.findUniqueOrThrow({
    where: { id },
    select: { tipoContrato: true, regimeTrabalho: true, nome: true },
  });

let colabAlterar = '';
let colabIntacto = '';

beforeAll(async () => {
  const slug = `test-colab-cr-${SUFIXO}`;
  await prismaBase.tenant.create({
    data: {
      id: TENANT_ID,
      nome: `Tenant de Teste Colaborador ${slug}`,
      slug,
      nuit: `${Date.now()}7`.slice(-9),
    },
  });
  await prismaBase.user.create({
    data: {
      id: USER_ID,
      tenantId: TENANT_ID,
      nome: 'Gestor RH',
      email: `${USER_ID}@test.local`,
      keycloakSub: `kc-${USER_ID}`,
    },
  });

  colabAlterar = await criarColaborador('Ana Contrato');
  colabIntacto = await criarColaborador('Beto Intacto');
});

afterAll(async () => {
  await prismaBase.colaborador.deleteMany({ where: { tenantId: TENANT_ID } });
  await prismaBase.user.deleteMany({ where: { tenantId: TENANT_ID } });
  await prismaBase.tenant.deleteMany({ where: { id: TENANT_ID } });
});

describe('ColaboradorService.actualizar — tipoContrato e regimeTrabalho (#272)', () => {
  it('grava tipoContrato e regimeTrabalho', async () => {
    const antes = await lerContratoRegime(colabAlterar);
    expect(antes).toMatchObject({ tipoContrato: 'EFECTIVO', regimeTrabalho: 'TEMPO_INTEGRAL' });

    await runWithTenantContext(ctx, () =>
      ColaboradorService.actualizar(
        colabAlterar,
        { tipoContrato: 'TERMO_CERTO', regimeTrabalho: 'TEMPO_PARCIAL' },
        ctx,
      ),
    );

    const gravado = await lerContratoRegime(colabAlterar);
    expect(gravado.tipoContrato).toBe('TERMO_CERTO');
    expect(gravado.regimeTrabalho).toBe('TEMPO_PARCIAL');
  });

  it('não toca em tipoContrato nem regimeTrabalho quando não vêm no input', async () => {
    await runWithTenantContext(ctx, () =>
      ColaboradorService.actualizar(colabIntacto, { nome: 'Beto Renomeado' }, ctx),
    );

    const gravado = await lerContratoRegime(colabIntacto);
    expect(gravado.nome).toBe('Beto Renomeado');
    expect(gravado.tipoContrato).toBe('EFECTIVO');
    expect(gravado.regimeTrabalho).toBe('TEMPO_INTEGRAL');
  });
});
