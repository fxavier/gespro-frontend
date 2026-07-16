import { type ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export interface DetailTab {
  key: string;
  label: string;
  content: ReactNode;
  count?: number;
}

interface MetadataItem {
  label: string;
  value: ReactNode;
}

interface DetailShellProps {
  /** Conteúdo do cabeçalho (PageHeader ou similar) */
  header: ReactNode;
  /** Abas de conteúdo principal */
  tabs: DetailTab[];
  /** Metadados laterais (ex.: criado por, data, departamento) */
  metadata?: MetadataItem[];
  /** Aba activa por defeito */
  defaultTab?: string;
  className?: string;
}

/**
 * Shell de detalhe de entidade: cabeçalho + abas principais + sidebar de metadados.
 * Componente de servidor — sem interactividade própria.
 */
export function DetailShell({
  header,
  tabs,
  metadata,
  defaultTab,
  className,
}: DetailShellProps) {
  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {/* Cabeçalho */}
      {header}

      {/* Conteúdo principal + metadados */}
      <div className={cn('flex gap-6', metadata ? 'flex-col lg:flex-row' : '')}>
        {/* Abas */}
        <div className="flex-1 min-w-0">
          <Tabs defaultValue={defaultTab ?? tabs[0]?.key}>
            <TabsList className="w-full justify-start h-auto p-0 bg-transparent border-b rounded-none gap-0">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.key}
                  value={tab.key}
                  className={cn(
                    'relative rounded-none border-b-2 border-transparent pb-3 pt-2 px-4',
                    'text-sm font-medium text-muted-foreground',
                    'hover:text-foreground transition-colors',
                    'data-[state=active]:border-primary data-[state=active]:text-foreground',
                    'data-[state=active]:shadow-none',
                    'bg-transparent'
                  )}
                >
                  {tab.label}
                  {tab.count !== undefined && (
                    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                      {tab.count}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            {tabs.map((tab) => (
              <TabsContent key={tab.key} value={tab.key} className="mt-6">
                {tab.content}
              </TabsContent>
            ))}
          </Tabs>
        </div>

        {/* Metadados laterais */}
        {metadata && metadata.length > 0 && (
          <Card className="lg:w-72 xl:w-80 flex-shrink-0 self-start">
            <CardContent className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Informações
              </h3>
              <div className="space-y-3">
                {metadata.map((item, index) => (
                  <div key={index}>
                    {index > 0 && <Separator className="mb-3" />}
                    <dt className="text-xs font-medium text-muted-foreground mb-0.5">
                      {item.label}
                    </dt>
                    <dd className="text-sm text-foreground">{item.value}</dd>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
