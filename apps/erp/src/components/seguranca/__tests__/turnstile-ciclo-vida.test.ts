/**
 * Guarda a issue #43: o widget anti-robô não se remonta a cada render.
 *
 * O defeito: o efeito que monta o widget declarava as funções de retorno nas
 * dependências, e quem o usava passava-as como funções anónimas escritas no
 * local. Cada render criava funções novas → o efeito limpava (o que REMOVE o
 * widget) e montava outro. Como receber um token provoca um render, o ciclo
 * alimentava-se a si próprio, e o token submetido podia pertencer a um widget
 * já removido — o servidor recusava-o e ninguém percebia porquê.
 *
 * Este projecto de testes corre em `environment: node`, sem DOM nem
 * testing-library: não há como renderizar o componente. A verificação é
 * estrutural sobre a fonte — e é exactamente a estrutura que era o defeito.
 * Não substitui um teste de render; apanha a reintrodução, que é o que
 * interessa aqui.
 *
 * Como confirmar que vale: acrescentar `onToken` às dependências do efeito de
 * montagem. Acende de imediato.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const FONTE = readFileSync(
  path.join(process.cwd(), 'src/components/seguranca/turnstile.tsx'),
  'utf-8',
);

/** Arrays de dependências no formato `}, [ … ])` — useEffect e companhia. */
function arraysDeDependencias(fonte: string): string[] {
  return [...fonte.matchAll(/\}\s*,\s*\[([^\]]*)\]\s*\)/g)].map((m) => m[1].trim());
}

const RETORNOS = ['onToken', 'onExpirado', 'onErro'];

describe('ciclo de vida do widget Turnstile (issue #43)', () => {
  it('nenhuma função de retorno entra numa lista de dependências', () => {
    const arrays = arraysDeDependencias(FONTE);
    expect(arrays.length).toBeGreaterThan(0);

    for (const deps of arrays) {
      for (const retorno of RETORNOS) {
        expect(deps, `dependências \`[${deps}]\``).not.toContain(retorno);
      }
    }
  });

  it('o efeito de montagem depende apenas de `siteKey`', () => {
    expect(arraysDeDependencias(FONTE)).toContain('siteKey');
  });

  it('as funções de retorno são lidas por `ref`, e é isso que as tira das dependências', () => {
    expect(FONTE).toContain('retornosRef');
    expect(FONTE).toContain('retornosRef.current.onToken(token)');
  });

  it('a limpeza continua a remover o widget quando o componente sai do ecrã', () => {
    // O fecho da #43 não pode ser «deixar de limpar»: isso trocava um defeito
    // por uma fuga de widgets.
    expect(FONTE).toContain('window.turnstile.remove(widgetIdRef.current)');
  });

  it('a reposição do desafio não passa pela desmontagem', () => {
    // O token é de uso único: depois de uma submissão recusada o desafio tem
    // de ser reposto. Por `reset`, nunca por remontar.
    expect(FONTE).toContain('window.turnstile.reset(widgetIdRef.current)');
  });
});
