/**
 * Oráculo do `parcial()` (#625, zod 4) — `src/lib/validations/common.ts`.
 *
 * No Zod 4 o `.partial()` aplica os `.default()` às chaves ausentes; numa edição parcial isso
 * reescreve campos que o pedido não trazia (classe #275: `status` volta a `ACTIVO`, `ativo` a
 * `true`). O `parcial()` desembrulha os defaults antes do `.partial()`.
 *
 * Contrato:
 *   1. Formas suportadas (`campo.default(x)` directo): `{}` → `{}`, sem default injectado; os
 *      valores presentes continuam validados.
 *   2. Formas que esconderiam um default por baixo de outro wrapper — `.default().optional()`,
 *      `.default().transform()`, `.default().refine()` — são RECUSADAS ao construir o schema
 *      (o unwrap não as alcança, ou perderia o refine).
 *   3. Um schema real (`UpdateColaboradorSchema`) com `{}` sai sem `nivelAcesso`/`status`, e o
 *      `.partial()` cru do zod 4 sobre a mesma forma injecta-os (prova que o teste distingue).
 *   4. Todos os módulos de `src/lib/validations/` importam sem lançar — a guarda corre na
 *      construção, logo nenhum schema actual cai nas formas proibidas.
 *
 * Escrito pelo verificador do nó O625b; um agente de implementação que o altere é BLOCKER.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parcial } from '@/lib/validations/common';
import { CreateColaboradorSchema, UpdateColaboradorSchema } from '@/lib/validations/rh';
import {
  CreateEnderecoFornecedorSchema,
  UpdateEnderecoFornecedorSchema,
} from '@/lib/validations/fornecedores';

describe('parcial() — formas suportadas (1)', () => {
  const Base = z.object({
    a: z.string().default('x'),
    b: z.number().default(0),
    c: z.array(z.string()).default([]),
    d: z.string().optional(),
  });
  const P = parcial(Base);

  it('{} → {} (nenhum default injectado)', () => {
    expect(P.parse({})).toEqual({});
    expect(Object.keys(P.parse({}))).toEqual([]);
  });

  it('{ a: "y" } → { a: "y" }', () => {
    expect(P.parse({ a: 'y' })).toEqual({ a: 'y' });
  });

  it('valores presentes continuam validados (tipo errado recusado)', () => {
    expect(P.safeParse({ a: 1 }).success).toBe(false);
    expect(P.safeParse({ b: 'zero' }).success).toBe(false);
    expect(P.safeParse({ c: [1] }).success).toBe(false);
    expect(P.safeParse({ d: 2 }).success).toBe(false);
  });

  it('controlo: o .partial() cru do zod 4 injecta os defaults', () => {
    expect(Base.partial().parse({})).toEqual({ a: 'x', b: 0, c: [] });
  });
});

describe('parcial() — formas que vazariam um default são recusadas ao construir (2)', () => {
  it('(a) .default().optional()', () => {
    expect(() => parcial(z.object({ a: z.string().default('x').optional() }))).toThrow();
  });

  it('(b) .default().transform()', () => {
    expect(() =>
      parcial(z.object({ a: z.string().default('x').transform((s) => s + '!') })),
    ).toThrow();
  });

  it('(c) .default().refine() (o unwrap perderia o refine)', () => {
    expect(() => parcial(z.object({ a: z.number().default(0).refine((n) => n >= 0) }))).toThrow();
  });
});

describe('schemas reais do repo (3)', () => {
  it('UpdateColaboradorSchema com {} sai sem nivelAcesso/status', () => {
    const out = UpdateColaboradorSchema.parse({});
    expect(out).toEqual({});
    expect(out).not.toHaveProperty('nivelAcesso');
    expect(out).not.toHaveProperty('status');
    expect(out).not.toHaveProperty('ativo');
  });

  it('controlo: o .partial() cru sobre a mesma forma injecta nivelAcesso', () => {
    const cru = CreateColaboradorSchema.pick({ nome: true, nivelAcesso: true }).partial();
    expect(cru.parse({})).toEqual({ nivelAcesso: 'USUARIO' });
    const doRepo = parcial(CreateColaboradorSchema.pick({ nome: true, nivelAcesso: true }));
    expect(doRepo.parse({})).toEqual({});
  });

  it('UpdateEnderecoFornecedorSchema com {} sai sem tipo/principal (o cru injecta-os)', () => {
    expect(UpdateEnderecoFornecedorSchema.parse({})).toEqual({});
    expect(CreateEnderecoFornecedorSchema.partial().parse({})).toEqual({
      tipo: 'SEDE',
      principal: false,
    });
  });

  it('valor presente continua validado no schema real', () => {
    expect(UpdateColaboradorSchema.safeParse({ nivelAcesso: 'NAO_EXISTE' }).success).toBe(false);
    expect(UpdateColaboradorSchema.parse({ nome: 'Ana Maria' })).toEqual({ nome: 'Ana Maria' });
  });
});

describe('varrimento: todos os módulos de validations importam sem lançar (4)', () => {
  const modulos = import.meta.glob('../*.ts');
  const nomes = Object.keys(modulos).filter((p) => !p.endsWith('.test.ts'));

  it('encontra os módulos (o glob não está vazio)', () => {
    expect(nomes.length).toBeGreaterThanOrEqual(25);
    expect(nomes).toContain('../common.ts');
    expect(nomes).toContain('../rh.ts');
  });

  it.each(nomes)('%s importa sem lançar', async (p) => {
    await expect(modulos[p]()).resolves.toBeDefined();
  });
});
