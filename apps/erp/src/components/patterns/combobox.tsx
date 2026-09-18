'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

export interface ComboboxOption {
  value: string;
  /** Texto mostrado na lista e no botão depois de escolher. */
  label: string;
}

/** Abaixo deste número de opções a lista abre sem campo de pesquisa. */
export const PESQUISA_A_PARTIR_DE = 6;

const semAcentos = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Filtro local: substring, sem acentos nem maiúsculas. O fuzzy do cmdk casava
 * «caixa» com «Activos de exploração…» por ter as letras espalhadas — numa
 * lista de contas PGC isso é ruído, não ajuda.
 */
const filtrar = (valor: string, pesquisa: string) =>
  semAcentos(valor).includes(semAcentos(pesquisa)) ? 1 : 0;

interface ComboboxProps {
  options: ComboboxOption[];
  value?: string;
  /**
   * Valor inicial quando o componente é NÃO controlado (formulários que lêem
   * `FormData` em vez de estado). Ignorado se `value` vier definido.
   */
  defaultValue?: string;
  onChange?: (value: string) => void;
  /**
   * Nome do campo no formulário: escreve o valor escolhido num `<input hidden>`
   * para os formulários que lêem `new FormData(form)` — o `Select` do Radix
   * fazia o mesmo por baixo, e é o que permite trocá-lo sem mudar a lógica.
   */
  name?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  /**
   * Se presente, a pesquisa deixa de ser local: o texto é entregue ao pai
   * (que vai ao servidor) e a lista mostra exactamente as `options` recebidas.
   */
  onSearchChange?: (termo: string) => void;
  /** Rodapé da lista — ex.: «a mostrar os primeiros 20». */
  footer?: React.ReactNode;
  /**
   * Mostrar o campo de pesquisa a partir de quantas opções. Com pesquisa no
   * servidor (`onSearchChange`) aparece sempre — a lista local é só a primeira
   * página e não diz quantos registos existem.
   */
  pesquisaAPartirDe?: number;
}

/**
 * `aria-*` e afins chegam do `<FormControl>` do shadcn (que clona o filho com
 * `id`, `aria-describedby`, `aria-invalid`) e vão para o botão — é ele o
 * controlo que o leitor de ecrã anuncia.
 */
type Props = ComboboxProps & React.AriaAttributes;

/**
 * Combobox — selecção com pesquisa. Popover + Command (nunca Dialog: a regra
 * sem-modais do CLAUDE.md vale aqui também).
 *
 * Por omissão filtra localmente sobre `options`. Quem tiver mais registos do
 * que cabe numa lista passa `onSearchChange` e alimenta `options` do servidor.
 * Listas curtas (menos de `pesquisaAPartirDe`) abrem sem campo de pesquisa.
 */
export function Combobox({
  options,
  value,
  defaultValue,
  onChange,
  name,
  placeholder = 'Seleccionar…',
  searchPlaceholder = 'Pesquisar…',
  emptyText = 'Sem resultados.',
  disabled,
  id,
  className,
  onSearchChange,
  footer,
  pesquisaAPartirDe = PESQUISA_A_PARTIR_DE,
  ...aria
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [interno, setInterno] = useState(defaultValue ?? '');
  const controlado = value !== undefined;
  const actual = controlado ? value : interno;
  const escolhida = options.find((o) => o.value === actual);
  const comPesquisa = Boolean(onSearchChange) || options.length >= pesquisaAPartirDe;

  const escolher = (v: string) => {
    if (!controlado) setInterno(v);
    onChange?.(v);
    setAberto(false);
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      {name ? <input type="hidden" name={name} value={actual ?? ''} /> : null}
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={aberto}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', !escolhida && 'text-muted-foreground', className)}
          {...aria}
        >
          <span className="truncate">{escolhida?.label ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        {/* shouldFilter=false quando a pesquisa é do servidor: a lista já vem filtrada. */}
        <Command shouldFilter={!onSearchChange} filter={filtrar}>
          {comPesquisa && (
            <CommandInput placeholder={searchPlaceholder} onValueChange={onSearchChange} />
          )}
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((opcao) => (
                <CommandItem
                  key={opcao.value}
                  value={onSearchChange ? opcao.value : opcao.label}
                  onSelect={() => escolher(opcao.value)}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4 shrink-0',
                      opcao.value === actual ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="truncate">{opcao.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            {footer && (
              <div className="border-t px-3 py-2 text-xs text-muted-foreground">{footer}</div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
