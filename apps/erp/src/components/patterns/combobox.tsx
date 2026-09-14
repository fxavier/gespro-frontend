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

interface ComboboxProps {
  options: ComboboxOption[];
  value?: string;
  onChange: (value: string) => void;
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
}

/**
 * Combobox — selecção com pesquisa. Popover + Command (nunca Dialog: a regra
 * sem-modais do CLAUDE.md vale aqui também).
 *
 * Por omissão filtra localmente sobre `options`. Quem tiver mais registos do
 * que cabe numa lista passa `onSearchChange` e alimenta `options` do servidor.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Seleccionar…',
  searchPlaceholder = 'Pesquisar…',
  emptyText = 'Sem resultados.',
  disabled,
  id,
  className,
  onSearchChange,
  footer,
}: ComboboxProps) {
  const [aberto, setAberto] = useState(false);
  const escolhida = options.find((o) => o.value === value);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={aberto}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', !escolhida && 'text-muted-foreground', className)}
        >
          <span className="truncate">{escolhida?.label ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        {/* shouldFilter=false quando a pesquisa é do servidor: a lista já vem filtrada. */}
        <Command shouldFilter={!onSearchChange}>
          <CommandInput placeholder={searchPlaceholder} onValueChange={onSearchChange} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((opcao) => (
                <CommandItem
                  key={opcao.value}
                  value={onSearchChange ? opcao.value : opcao.label}
                  onSelect={() => {
                    onChange(opcao.value);
                    setAberto(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4 shrink-0',
                      opcao.value === value ? 'opacity-100' : 'opacity-0'
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
