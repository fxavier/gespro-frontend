'use client';

import { useEffect, useRef, useState } from 'react';
import { Combobox, type ComboboxOption } from './combobox';

interface ComboboxRemotoProps {
  /** Primeira página, carregada pelo Server Component. */
  opcoesIniciais: ComboboxOption[];
  /**
   * Pesquisa no servidor. Devolver `null` significa «falhou» — a lista
   * anterior fica como está, em vez de piscar para vazio.
   */
  procurar: (termo: string) => Promise<ComboboxOption[] | null>;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  id?: string;
}

/**
 * Combobox cuja pesquisa vai ao servidor, com atraso e sem corridas.
 *
 * Existe porque a alternativa — pré-carregar tudo e filtrar no cliente — cala
 * os registos que ficam de fora da primeira página: o utilizador escreve um
 * nome que existe e a caixa diz que não há nada. Com 4000 produtos ou 2000
 * clientes isso é o caso comum, não o extremo.
 */
export function ComboboxRemoto({
  opcoesIniciais,
  procurar,
  ...resto
}: ComboboxRemotoProps) {
  const [opcoes, setOpcoes] = useState<ComboboxOption[]>(opcoesIniciais);
  const [termo, setTermo] = useState('');

  // As duas props ficam em refs, e fora das dependências do efeito, porque a
  // sua IDENTIDADE muda a cada render de quem chama (um `.map()` inline gera
  // um array novo de cada vez). Com elas nas dependências, cada render
  // reiniciava a pesquisa: a lista piscava de volta à primeira página e o
  // clique numa opção acabava a escolher outra. Não é hipótese — foi o que
  // aconteceu. Aqui só o que o utilizador escreve manda.
  const iniciais = useRef(opcoesIniciais);
  const procurarRef = useRef(procurar);

  // A actualização vive num efeito — escrever numa ref durante o render é o
  // que a regra `react-hooks/refs` proíbe, e com razão: o render tem de poder
  // ser repetido sem efeitos colaterais.
  useEffect(() => {
    procurarRef.current = procurar;
  });

  useEffect(() => {
    if (!termo.trim()) {
      setOpcoes(iniciais.current);
      return;
    }

    let cancelado = false;
    const temporizador = setTimeout(async () => {
      const resultado = await procurarRef.current(termo.trim());
      // A resposta a um termo anterior pode chegar depois desta — descarta-se.
      if (!cancelado && resultado) setOpcoes(resultado);
    }, 250);

    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [termo]);

  return <Combobox {...resto} options={opcoes} onSearchChange={setTermo} />;
}
