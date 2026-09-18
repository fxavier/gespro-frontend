/**
 * Rótulos das naturezas de diário. Módulo sem directiva — é importado tanto
 * pelo Server Component de detalhe como pelos Client Components (tabela e
 * formulário). Não pode viver no ficheiro `'use client'`: um SC que importe
 * de um módulo cliente recebe referências, não o objecto.
 */
import type { CriarDiarioInput } from '@/lib/validations/contabilidade';

export const TIPO_DIARIO_LABEL: Record<CriarDiarioInput['tipo'], string> = {
  VENDAS: 'Vendas',
  COMPRAS: 'Compras',
  CAIXA: 'Caixa',
  BANCO: 'Banco',
  OPERACOES: 'Operações',
  SALARIOS: 'Salários',
  ABERTURA: 'Abertura',
  ENCERRAMENTO: 'Encerramento',
  OUTROS: 'Outros',
};
