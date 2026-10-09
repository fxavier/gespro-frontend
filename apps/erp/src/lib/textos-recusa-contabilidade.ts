/**
 * Textos legíveis das recusas do fecho de período (ADR-0033 §6) e do apuramento de IVA
 * (ADR-0034 §4), por código. Módulo neutro (client-safe): os ecrãs importam-nos daqui.
 *
 * Cada texto aponta o passo que resolve — nunca um que não resolve (#144). Os códigos não mudam.
 */

export interface InfoRecusaApuramento {
  titulo: string;
  descricao: string;
  isProrataWarning?: boolean;
}

/**
 * DOCUMENTO_SEM_LANCAMENTO: o lançamento de um documento fiscal nasce na emissão e só a
 * emissão o liga ao documento. Não há acção no produto que crie essa ligação depois.
 */
const DOCUMENTO_SEM_LANCAMENTO =
  'O lançamento de um documento fiscal é criado e ligado ao documento no momento da emissão, e estes ' +
  'documentos ficaram sem essa ligação. Um lançamento manual não fica ligado ao documento e não levanta ' +
  'esta recusa. Contacte o suporte do GestPro com os números dos documentos.';

/** Textos por código de impedimento do fecho de período. */
export const TEXTO_IMPEDIMENTO_FECHO: Record<string, string> = {
  RASCUNHOS_NO_PERIODO:
    'Existem lançamentos em rascunho no período. Confirme ou elimine todos os rascunhos antes de fechar.',
  SESSAO_CAIXA_ABERTA:
    'Existe pelo menos uma sessão de caixa aberta com abertura neste período. Feche a sessão de caixa antes de fechar o período.',
  RECONCILIACAO_EM_ANDAMENTO:
    'Existe uma reconciliação bancária em curso que abrange datas deste período. Conclua ou cancele a reconciliação primeiro.',
  DOCUMENTO_SEM_LANCAMENTO:
    'Existem facturas, notas de crédito ou notas de débito emitidas neste período sem o lançamento contabilístico correspondente. ' +
    DOCUMENTO_SEM_LANCAMENTO,
  BALANCETE_DESEQUILIBRADO:
    'O balancete do período não está equilibrado — o total dos débitos é diferente do total dos créditos. Corrija os lançamentos antes de fechar.',
  PERIODO_ANTERIOR_ABERTO:
    'O período anterior ainda está aberto. O fecho tem de ser feito por ordem: feche o mês anterior primeiro.',
  IVA_NAO_APURADO:
    'O apuramento do IVA do período ainda não foi executado. Apure o IVA em Contabilidade → Apuramento de IVA antes de fechar o período.',
};

/** Textos por código de recusa do apuramento de IVA. */
export const TEXTOS_RECUSA_APURAMENTO: Record<string, InfoRecusaApuramento> = {
  PRORATA_NAO_SUPORTADO: {
    titulo: 'Pro rata não suportado — apuramento recusado',
    descricao:
      'Este período tem operações isentas (a 0 %), à taxa reduzida de 5 % ou fora do campo do imposto. ' +
      'Nessas situações, a dedução do IVA é limitada pelo coeficiente de pro rata, cujo cálculo ' +
      'o produto ainda não implementa. ' +
      'O sistema recusa produzir um número em vez de devolver um número que não sabe calcular — ' +
      'um valor incorrecto numa declaração assinada é pior do que nenhum valor. ' +
      'Enquanto o período tiver estas operações, o apuramento no GestPro continua recusado: ' +
      'consulte o seu contabilista para apurar este período fora do produto.',
    isProrataWarning: true,
  },
  PERIODO_COM_RASCUNHOS: {
    titulo: 'Existem lançamentos em rascunho no período',
    descricao:
      'O apuramento lê o razão contabilístico. Um lançamento em rascunho é um número que ainda ' +
      'pode mudar — apurar com rascunhos em aberto produziria um mapa que não reflecte o razão ' +
      'final. Confirme ou elimine todos os rascunhos do período antes de apurar.',
  },
  DOCUMENTO_SEM_LANCAMENTO: {
    titulo: 'Existem documentos fiscais sem lançamento contabilístico',
    descricao:
      'Há facturas, notas de crédito ou notas de débito emitidas neste período sem o lançamento ' +
      'contabilístico correspondente. O razão não contém o IVA desses documentos, e o apuramento ' +
      'ficaria incompleto. ' +
      DOCUMENTO_SEM_LANCAMENTO,
  },
  PERIODO_JA_APURADO: {
    titulo: 'O período já tem um apuramento activo',
    descricao:
      'Já existe um apuramento para este período no estado APURADO ou DECLARADO. ' +
      'Para recalcular, estorne o apuramento actual e execute um novo apuramento (versão seguinte). ' +
      'Se o apuramento já foi declarado à AT, a correcção tem de ser uma regularização no período ' +
      'seguinte (ADR-0034 §7).',
  },
  APURAMENTO_PERIODO_ENCERRAMENTO: {
    titulo: 'O período 13 não tem IVA a apurar',
    descricao:
      'O período 13 é o do encerramento do exercício: só recebe os lançamentos de encerramento e ' +
      'não tem operações. O IVA apura-se nos doze períodos mensais (ADR-0035 §7) — o de Dezembro ' +
      'inclui as operações do último dia do ano.',
  },
};
