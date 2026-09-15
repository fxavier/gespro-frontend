/**
 * Para onde vai cada chave de um `fieldErrors` do servidor.
 *
 * A fronteira partilhada (`registarTenant`) devolve `error.flatten()`, e o
 * `flatten()` do Zod só conhece o **topo** do schema: um erro dentro de
 * `empresa` chega como `empresa`, nunca como `empresa.nuit`. Um mapeamento que
 * só aceitasse caminhos pontuados ficava morto precisamente para os dois
 * grupos — os erros existiam e não acendiam em campo nenhum, que é a avaria
 * que este ecrã tem por obrigação não ter.
 *
 * As chaves de grupo apontam ao **primeiro campo do grupo**: é onde a pessoa
 * começa a ler, e é melhor do que a mensagem ficar só no aviso de topo.
 *
 * Módulo sem React: existe separado da folha cliente para que o teste possa
 * comparar este mapa com as chaves que o `RegistoTenantSchema` produz de
 * facto. Um campo novo no schema da L1 parte esse teste até este mapa saber
 * onde o pôr.
 */

import type { Path } from 'react-hook-form';
import type { RegistoTenantInput } from '@/lib/validations/onboarding';

export const DESTINO_DO_ERRO: Record<string, Path<RegistoTenantInput>> = {
  // Grupos — o que o `flatten()` devolve de facto.
  empresa: 'empresa.nome',
  admin: 'admin.nome',
  // Campos de topo, que já vêm com o nome final.
  senha: 'senha',
  confirmacao: 'confirmacao',
  planoId: 'planoId',
  provincia: 'provincia',
  captchaToken: 'captchaToken',
  // Caminhos pontuados, caso a fronteira passe um dia a devolvê-los.
  'empresa.nome': 'empresa.nome',
  'empresa.nuit': 'empresa.nuit',
  'admin.nome': 'admin.nome',
  'admin.email': 'admin.email',
};

/** Códigos de recusa do provisionamento que têm um campo culpado nomeável. */
export const CAMPO_POR_CODIGO: Record<string, Path<RegistoTenantInput>> = {
  EMAIL_JA_REGISTADO: 'admin.email',
  NUIT_JA_REGISTADO: 'empresa.nuit',
};
