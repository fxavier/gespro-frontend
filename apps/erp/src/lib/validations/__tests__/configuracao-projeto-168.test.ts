/**
 * Oráculo — issue #168: `papeisEquipaAtivos` sai da configuração de projectos.
 *
 * Os papéis vivem em `MembroEquipa`, que pertence a uma `Equipa` partilhável por vários
 * projectos: uma lista de papéis activos por projecto não tem leitor natural. Decisão
 * (conservadora, sem migração): retirar o campo do schema da action e do formulário; a coluna
 * fica na base. O comportamento (a action deixa de a gravar) é provado em
 * `test/integration/projectos-configuracoes-168.test.ts`.
 *
 * Os dois campos que ficam (`politicaAprovacaoTimesheet`, `tiposTarefaAtivos`) continuam no
 * schema — são lidos por `TimesheetService.registar` e `TarefaService.criar`.
 *
 * Escrito pelo verificador do nó A:projectos-configuracoes-168; um agente de implementação que o
 * altere é BLOCKER.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as validacoes from '@/lib/validations/projetos';

const RAIZ_APP = join(__dirname, '..', '..', '..', '..');
const ler = (rel: string) => readFileSync(join(RAIZ_APP, rel), 'utf8');

describe('UpdateConfiguracaoProjetoSchema (#168)', () => {
  // Acesso dinâmico: falha o caso, não o ficheiro.
  const schema = (validacoes as Record<string, any>).UpdateConfiguracaoProjetoSchema;

  it('mantém os campos com leitor: política de aprovação e tipos de tarefa', () => {
    const chaves = Object.keys(schema.shape);
    expect(chaves).toContain('projetoId');
    expect(chaves).toContain('politicaAprovacaoTimesheet');
    expect(chaves).toContain('tiposTarefaAtivos');
  });

  it('não tem papeisEquipaAtivos — e um valor enviado não sobrevive ao parse', () => {
    expect(Object.keys(schema.shape)).not.toContain('papeisEquipaAtivos');

    const r = schema.safeParse({
      projetoId: 'ckabcdefghijklmnopqrstuvw',
      politicaAprovacaoTimesheet: 'AUTOMATICA',
      tiposTarefaAtivos: ['TAREFA'],
      papeisEquipaAtivos: ['GERENTE'],
    });
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
    expect(r.data).not.toHaveProperty('papeisEquipaAtivos');
    expect(r.data.politicaAprovacaoTimesheet).toBe('AUTOMATICA');
    expect(r.data.tiposTarefaAtivos).toEqual(['TAREFA']);
  });
});

describe('ecrã de configurações de projectos (#168)', () => {
  it('o formulário já não oferece papéis de equipa', () => {
    const fonte = ler('src/app/(dashboard)/projetos/configuracoes/_components/configuracao-form.tsx');
    expect(fonte).not.toMatch(/papeisEquipaAtivos/);
    expect(fonte).not.toMatch(/Papéis de Equipa/i);
    // Os dois campos com leitor continuam no formulário.
    expect(fonte).toMatch(/politicaAprovacaoTimesheet/);
    expect(fonte).toMatch(/tiposTarefaAtivos/);
  });

  it('a página não passa nem mostra papéis de equipa', () => {
    const fonte = ler('src/app/(dashboard)/projetos/configuracoes/page.tsx');
    expect(fonte).not.toMatch(/papeisEquipaAtivos/);
    expect(fonte).not.toMatch(/papéis/i);
  });
});
