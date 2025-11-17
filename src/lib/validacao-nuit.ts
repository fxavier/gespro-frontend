
/**
 * Valida o formato do NUIT (Número Único de Identificação Tributária) de Moçambique
 * Formato: 9 dígitos
 */
export function validarNUIT(nuit: string): boolean {
  if (!nuit) return false;
  
  // Remove caracteres não numéricos
  const nuitLimpo = nuit.replace(/\D/g, '');
  
  // Verifica se tem 9 dígitos
  if (nuitLimpo.length !== 9) return false;
  
  // Verifica se não são todos dígitos iguais
  if (/^(\d)\1{8}$/.test(nuitLimpo)) return false;
  
  return true;
}

/**
 * Alias para manter compatibilidade com código existente
 */
export function validarNuit(nuit: string): boolean {
  return validarNUIT(nuit);
}

/**
 * Formata o NUIT para exibição
 * Exemplo: 123456789 -> 123 456 789
 */
export function formatarNUIT(nuit: string): string {
  if (!nuit) return '';
  
  const nuitLimpo = nuit.replace(/\D/g, '');
  
  if (nuitLimpo.length === 9) {
    return `${nuitLimpo.slice(0, 3)} ${nuitLimpo.slice(3, 6)} ${nuitLimpo.slice(6)}`;
  }
  
  return nuitLimpo;
}

/**
 * Alias para manter compatibilidade com código existente
 */
export function formatarNuit(nuit: string): string {
  return formatarNUIT(nuit);
}

/**
 * Gera um NUIT aleatório válido (apenas para testes)
 */
export function gerarNUITAleatorio(): string {
  const digitos = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  return digitos.join('');
}

/**
 * Valida o formato de email
 */
export function validarEmail(email: string): boolean {
  if (!email) return false;
  
  // Regex básico para validação de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
