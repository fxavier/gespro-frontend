import { describe, expect, it } from 'vitest';
import { parseExtratoCsv } from '../extrato-csv';

const CSV_VALIDO = `referencia;data;descricao;valor;tipo
MOV-001;2026-06-05;Transferência recebida;1500,00;DEBITO
MOV-002;05/06/2026;Taxa de manutenção;250.50;CREDITO`;

describe('parseExtratoCsv', () => {
  it('parseia CSV válido (datas e decimais em ambos os formatos)', () => {
    const r = parseExtratoCsv(CSV_VALIDO);
    expect(r.erros).toHaveLength(0);
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[0]).toMatchObject({
      extratoReferencia: 'MOV-001',
      descricao: 'Transferência recebida',
      valor: 1500,
      tipoMovimento: 'DEBITO',
    });
    expect(r.linhas[0].data.toISOString().slice(0, 10)).toBe('2026-06-05');
    expect(r.linhas[1].data.toISOString().slice(0, 10)).toBe('2026-06-05');
    expect(r.linhas[1].valor).toBe(250.5);
    expect(r.linhas[1].tipoMovimento).toBe('CREDITO');
  });

  it('aceita separador vírgula e colunas por ordem livre', () => {
    const r = parseExtratoCsv('data,tipo,valor,referencia,descricao\n2026-01-02,C,10.00,R1,Comissão');
    expect(r.erros).toHaveLength(0);
    expect(r.linhas[0]).toMatchObject({ extratoReferencia: 'R1', tipoMovimento: 'CREDITO', valor: 10 });
  });

  it('cabeçalho sem colunas obrigatórias → erro global', () => {
    const r = parseExtratoCsv('ref;quando;quanto\nx;y;z');
    expect(r.linhas).toHaveLength(0);
    expect(r.erros[0].mensagem).toMatch(/Colunas em falta/);
  });

  it('linhas inválidas são reportadas com o número da linha', () => {
    const r = parseExtratoCsv(
      'referencia;data;descricao;valor;tipo\nR1;2026-13-99;Desc;abc;XPTO',
    );
    expect(r.linhas).toHaveLength(0);
    expect(r.erros).toHaveLength(1);
    expect(r.erros[0].linha).toBe(2);
    expect(r.erros[0].mensagem).toMatch(/data inválida/);
    expect(r.erros[0].mensagem).toMatch(/valor inválido/);
    expect(r.erros[0].mensagem).toMatch(/tipo inválido/);
  });

  it('referências duplicadas no ficheiro são rejeitadas', () => {
    const r = parseExtratoCsv(
      'referencia;data;descricao;valor;tipo\nR1;2026-06-01;A;10;D\nR1;2026-06-02;B;20;C',
    );
    expect(r.linhas).toHaveLength(1);
    expect(r.erros[0].mensagem).toMatch(/duplicada/);
  });

  it('valores não positivos são inválidos', () => {
    const r = parseExtratoCsv('referencia;data;descricao;valor;tipo\nR1;2026-06-01;A;-5;D');
    expect(r.erros).toHaveLength(1);
  });

  it('ficheiro vazio', () => {
    const r = parseExtratoCsv('  \n ');
    expect(r.erros[0].mensagem).toMatch(/vazio/i);
  });
});
