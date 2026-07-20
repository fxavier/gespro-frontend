import 'server-only';

/**
 * DTO de envio de email. Todos os campos de texto devem estar em pt-PT.
 */
export interface EnviarEmailDto {
  para: string;
  assunto: string;
  html: string;
  texto?: string;
}

/**
 * Porta de email — interface que todos os adaptadores devem implementar.
 * Inversão de dependência: os serviços dependem desta interface, não das implementações.
 */
export interface EmailProvider {
  enviar(dto: EnviarEmailDto): Promise<void>;
}
