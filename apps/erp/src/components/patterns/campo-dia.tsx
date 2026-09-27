'use client';

/**
 * CampoDia — `<input type="date">` controlado para um campo `Date` do
 * react-hook-form, com o dia civil de Maputo.
 *
 * - O texto mostrado é o do estado (`value`), não um `defaultValue` solto: o que
 *   o ecrã mostra é o que o documento leva.
 * - `aaaa-mm-dd` → `diaIsoParaData` (meio-dia em +02:00), nunca
 *   `new Date(string)`, que lê UTC e muda o dia fora de Maputo.
 * - Guarda o texto tal como o browser o dá enquanto se escreve: formatar de volta
 *   a cada tecla («0002-09-26» a meio do ano) apagaria o campo. Se o `value`
 *   mudar por fora (reset, setValue) para outro dia, o texto segue-o.
 */

import { useState, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { dataParaDiaIso, diaIsoParaData } from '@/lib/format-date';

type Props = Omit<ComponentProps<typeof Input>, 'type' | 'value' | 'defaultValue' | 'onChange'> & {
  value: Date | undefined | null;
  onChange: (valor: Date | undefined) => void;
};

export function CampoDia({ value, onChange, ...props }: Props) {
  const externo = dataParaDiaIso(value);
  const [texto, setTexto] = useState(externo);
  const [ultimoExterno, setUltimoExterno] = useState(externo);

  // Ajuste durante o render (padrão React): o estado mudou por fora.
  if (externo !== ultimoExterno) {
    setUltimoExterno(externo);
    if (externo && externo !== dataParaDiaIso(diaIsoParaData(texto))) setTexto(externo);
  }

  return (
    <Input
      {...props}
      type="date"
      value={texto}
      onChange={(e) => {
        setTexto(e.target.value);
        onChange(e.target.value ? diaIsoParaData(e.target.value) : undefined);
      }}
    />
  );
}
