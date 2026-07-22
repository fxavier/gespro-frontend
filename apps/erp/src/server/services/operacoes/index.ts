// WS F — Operações: barril de exportações
// Exporta serviços, constantes e tipos públicos do módulo.
// NÃO exportar helpers internos (_helpers.ts).

import 'server-only';

// Serviços
export { alocacaoService, calcularEstadoDocumento, verificarConflitosAgenda, validarAlocacaoViatura, validarAlocacaoMotorista } from './alocacao.service';
export { alertasService, gerarAlertasDocumentos, gerarAlertasManutencao, recalcularEstadosDocumentos } from './alertas.service';
export { viaturaService } from './viatura.service';
export { motoristaService } from './motorista.service';
export { atividadeService } from './atividade.service';
export { rotaService } from './rota.service';
export { entregaService } from './entrega.service';
export { abastecimentoService } from './abastecimento.service';
export { ticketService, categoriaTicketService, equipeSuporteService, baseConhecimentoService, calcularSla, recalcularSlaEmAtraso } from './ticket.service';

// Contratos cruzados (exportados para uso por outros WS se necessário)
// Sem contratos cruzados obrigatórios no WS F — ver docs/handoff/ws-f-operacoes.md

// Mapas de estado e tipos (re-exportados das interfaces)
export { TRANSICOES_ATIVIDADE } from './atividade.interface';
export { TRANSICOES_VIATURA } from './viatura.interface';
export { TRANSICOES_TICKET, SLA_PADRAO_MIN } from './ticket.interface';
export { TRANSICOES_ROTA } from './rota.interface';
export { TRANSICOES_ENTREGA } from './entrega.interface';
