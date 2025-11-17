
/**
 * Valida o formato do Bilhete de Identidade de Moçambique
 * Formato: 12 dígitos seguidos de uma letra (ex: 110100123456A)
 */
export function validarBI(bi: string): boolean {
  if (!bi) return false;
  
  // Remove espaços e converte para maiúsculas
  const biLimpo = bi.replace(/\s/g, '').toUpperCase();
  
  // Verifica o formato: 12 dígitos + 1 letra
  const regex = /^\d{12}[A-Z]$/;
  
  return regex.test(biLimpo);
}

/**
 * Formata o BI para exibição
 * Exemplo: 110100123456A
 */
export function formatarBI(bi: string): string {
  if (!bi) return '';
  
  const biLimpo = bi.replace(/\s/g, '').toUpperCase();
  
  if (biLimpo.length === 13) {
    return `${biLimpo.slice(0, 6)} ${biLimpo.slice(6, 12)}${biLimpo.slice(12)}`;
  }
  
  return biLimpo;
}

/**
 * Valida o formato do NISS (Número de Identificação da Segurança Social)
 * Formato: 9 dígitos
 */
export function validarNISS(niss: string): boolean {
  if (!niss) return false;
  
  const nissLimpo = niss.replace(/\D/g, '');
  
  return nissLimpo.length === 9;
}

/**
 * Formata o NISS para exibição
 * Exemplo: 123456789
 */
export function formatarNISS(niss: string): string {
  if (!niss) return '';
  
  const nissLimpo = niss.replace(/\D/g, '');
  
  if (nissLimpo.length === 9) {
    return `${nissLimpo.slice(0, 3)} ${nissLimpo.slice(3, 6)} ${nissLimpo.slice(6)}`;
  }
  
  return nissLimpo;
}
