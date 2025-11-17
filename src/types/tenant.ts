
export interface Tenant {
  id: string;
  nomeEmpresa: string;
  nuit: string;
  email: string;
  telefone?: string;
  endereco?: string;
  cidade?: string;
  provincia?: string;
  codigoPostal?: string;
  timezone: string;
  moedaBase: string;
  planoAssinatura: 'basico' | 'profissional' | 'empresarial';
  statusAtivo: boolean;
  dataRegistro: string;
  configuracoesFiscais: ConfiguracoesFiscais;
}

export interface ConfiguracoesFiscais {
  regimeIva: 'normal' | 'simplificado' | 'isento';
  taxaIvaDefault: number;
  seriesFaturas: SerieDocumento[];
  proximoNumeroFatura: number;
  proximoNumeroRecibo: number;
  assinaturaDigital?: string;
  logoEmpresa?: string;
}

export interface SerieDocumento {
  id: string;
  tipo: 'fatura' | 'recibo' | 'nota_credito' | 'nota_debito';
  serie: string;
  proximoNumero: number;
  ativo: boolean;
}

export interface Usuario {
  id: string;
  tenantId: string;
  nome: string;
  email: string;
  funcao: 'TENANT_ADMIN' | 'MANAGER' | 'CASHIER' | 'VIEWER';
  ativo: boolean;
  ultimoLogin?: string;
  permissoes: string[];
}
