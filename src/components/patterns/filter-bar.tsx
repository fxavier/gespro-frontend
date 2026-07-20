'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  options: FilterOption[];
  placeholder?: string;
}

interface FilterBarProps {
  /** Placeholder do campo de pesquisa */
  searchPlaceholder?: string;
  /** Chave do searchParam para a pesquisa textual */
  searchKey?: string;
  /** Filtros select adicionais */
  filters?: FilterConfig[];
  /** Componentes adicionais à direita */
  extra?: ReactNode;
  className?: string;
}

/**
 * Barra de filtros sincronizada com searchParams.
 * Pesquisa com debounce de 300ms; filtros activos como chips removíveis.
 * Todos os valores vivem na URL — partilháveis e persistentes.
 */
export function FilterBar({
  searchPlaceholder = 'Pesquisar...',
  searchKey = 'q',
  filters = [],
  extra,
  className,
}: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [searchValue, setSearchValue] = useState(
    searchParams.get(searchKey) ?? ''
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sincronizar o valor de pesquisa com searchParams (ex.: ao navegar para trás)
  useEffect(() => {
    setSearchValue(searchParams.get(searchKey) ?? '');
  }, [searchParams, searchKey]);

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      // Repor cursor ao alterar filtros
      params.delete('cursor');
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParam(searchKey, value || null);
    }, 300);
  };

  const clearSearch = () => {
    setSearchValue('');
    updateParam(searchKey, null);
  };

  // Filtros activos (excepto pesquisa)
  const activeFilters = filters.filter((f) => {
    const val = searchParams.get(f.key);
    return val && val !== '';
  });

  const clearAll = () => {
    const params = new URLSearchParams();
    router.replace(`?${params.toString()}`, { scroll: false });
    setSearchValue('');
  };

  const hasActiveFilters =
    activeFilters.length > 0 || (searchParams.get(searchKey) ?? '') !== '';

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Campo de pesquisa */}
        <div className="relative flex-1 min-w-0">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
          <Input
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9 pr-8"
            aria-label={searchPlaceholder}
          />
          {searchValue && (
            <button
              onClick={clearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Limpar pesquisa"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filtros select */}
        {filters.map((filter) => {
          const currentValue = searchParams.get(filter.key) ?? '';
          return (
            <select
              key={filter.key}
              value={currentValue}
              onChange={(e) => updateParam(filter.key, e.target.value || null)}
              className={cn(
                'h-9 rounded-md border border-input bg-background px-3 py-1 text-sm',
                'focus:outline-none focus:ring-1 focus:ring-ring',
                'text-foreground',
                'min-w-[140px]'
              )}
              aria-label={filter.label}
            >
              <option value="">{filter.placeholder ?? `Todos: ${filter.label}`}</option>
              {filter.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          );
        })}

        {extra}
      </div>

      {/* Chips de filtros activos */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Filtros activos:</span>

          {searchParams.get(searchKey) && (
            <Badge variant="secondary" className="gap-1 pr-1">
              <span className="text-xs">
                Pesquisa: &ldquo;{searchParams.get(searchKey)}&rdquo;
              </span>
              <button
                onClick={clearSearch}
                className="ml-0.5 rounded hover:bg-muted-foreground/20 p-0.5"
                aria-label="Remover filtro de pesquisa"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {activeFilters.map((filter) => {
            const val = searchParams.get(filter.key)!;
            const opt = filter.options.find((o) => o.value === val);
            return (
              <Badge key={filter.key} variant="secondary" className="gap-1 pr-1">
                <span className="text-xs">
                  {filter.label}: {opt?.label ?? val}
                </span>
                <button
                  onClick={() => updateParam(filter.key, null)}
                  className="ml-0.5 rounded hover:bg-muted-foreground/20 p-0.5"
                  aria-label={`Remover filtro ${filter.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}

          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={clearAll}
          >
            Limpar tudo
          </Button>
        </div>
      )}
    </div>
  );
}
