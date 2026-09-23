import { Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * Aviso de âmbito da projecção — Server Component, visível na própria página
 * (R7.4; ADR-0036 §9): a projecção só conta com direitos e obrigações já
 * DATADOS. Vendas futuras ainda não facturadas não entram, logo o lado das
 * entradas é estruturalmente conservador. Isto vai aqui, não só na
 * documentação — o risco é a projecção ser lida como previsão de negócio.
 */
export function AvisoAmbito() {
  return (
    <Alert>
      <Info className="h-4 w-4" aria-hidden="true" />
      <AlertTitle>Âmbito da projecção</AlertTitle>
      <AlertDescription>
        A projecção inclui apenas compromissos já datados: facturas emitidas
        por cobrar, contas a pagar em aberto, payrolls processados e
        compromissos manuais. <strong>Não inclui vendas futuras ainda não
        facturadas</strong> — é, por construção, conservadora do lado das
        entradas.
      </AlertDescription>
    </Alert>
  );
}
