import 'server-only';
import { registoLimiter } from '@/server/security/rate-limiter';
import { verificarCaptcha } from '@/server/security/captcha';
import { RegistoTenantSchema } from '@/lib/validations/onboarding';
import { AppError } from '@/lib/errors';
import { logger } from '@/server/observability/logger';
import { type PlanoId } from '@/lib/planos';
import { provisionarTenant } from '@/server/services/plataforma/tenant-provisioning.service';
import { criarSubscricaoTrial } from '@/server/services/plataforma/assinatura.service';
import {
  definirPalavraPasse,
  eliminarUtilizador,
  garantirUtilizador,
  ErroKeycloak,
} from '@/server/auth/keycloak';
import { concluirChave, falharChave, fingerprintDe, reservarChave } from '@/server/provisioning/idempotencia';
import { prismaBase } from '@/server/db/client';

/**
 * Fronteira pública do registo self-service — ADR-0031, tarefa 1 do spec 21.
 *
 * Tudo o que o registo público faz vive aqui: captcha, limitação de tráfego,
 * Zod, idempotência, Keycloak e transacção. `POST /api/publico/registo` é um
 * adaptador HTTP por cima desta função, e o ecrã `/registo` do ERP chama-a
 * directamente pela sua Server Action. **Nada de `NextResponse` neste
 * ficheiro** — o resultado é discriminado e é o chamador que decide se vira
 * resposta HTTP, `redirect` ou mensagem de formulário.
 *
 * Isto não é arrumação: é o que mantém a decisão do ADR-0031 reversível. Se um
 * dia o formulário voltar ao site (opção P3 do design §1), volta contido na
 * camada de apresentação, porque a lógica pública está toda num sítio só.
 *
 * ORDEM DAS DEFESAS — não se reordena:
 *   limite por IP → `Idempotency-Key` → corpo legível → Zod → limite por
 *   e-mail → captcha → identidade no Keycloak → transacção em Postgres.
 * O captcha vem SEMPRE antes de tocar no Keycloak (execução paralela W8
 * §6-quater: este caminho faz o nosso servidor escrever na Admin API a pedido
 * de quem quer que chame — amplificação), e depois do Zod de propósito (não se
 * gasta uma chamada ao fornecedor com um corpo inválido). A reentrega
 * idempotente responde antes do captcha porque não tem efeitos: devolve o
 * corpo gravado.
 *
 * Escreve tudo via `prismaBase` (sem contexto de tenant — o tenant é criado
 * aqui) e nunca aceita `tenantId` ou `slug` de quem chama.
 *
 * PALAVRA-PASSE: entra no corpo (ADR-0031) e sai daqui num sítio só — a Admin
 * API do Keycloak. Nunca em log, URL, Postgres nem em resultado devolvido.
 * Nem sequer é passada ao `provisionarTenant`, que não tem onde a pôr.
 */

export const ENDPOINT_REGISTO = 'POST /api/publico/registo';

/**
 * Sentinela para «o corpo chegou mas não é JSON».
 *
 * Quem lê o corpo é o adaptador (só ele tem o `Request`), mas o erro tem de
 * ser emitido no seu lugar na ordem das defesas — depois do limite por IP e da
 * `Idempotency-Key`, nunca antes. Passar esta sentinela em vez de responder no
 * adaptador é o que mantém a ordem intacta.
 */
export const CORPO_ILEGIVEL = Symbol('corpo-ilegivel');

export interface ContextoRegisto {
  /** IP de quem chama, já extraído dos cabeçalhos de proxy. `unknown` se não houver. */
  ip: string;
  /** Valor cru do cabeçalho `Idempotency-Key` (ou o que a Server Action gerar). */
  idempotencyKey: string;
}

export type ResultadoRegisto =
  | {
      ok: true;
      tenantSlug: string;
      /** `sub` da identidade no Keycloak — o que a verificação de e-mail precisa. */
      sub: string;
      /** E-mail do administrador, normalizado. O que o `signIn` precisa. */
      email: string;
      /** `true` quando é a reentrega de uma `Idempotency-Key` já concluída. */
      repetido: boolean;
      /**
       * Mensagem de sucesso tal como foi gravada na chave de idempotência.
       * Acréscimo ao contrato mínimo do handoff: a reentrega idempotente tem de
       * devolver o corpo gravado **verbatim** (contrato publicado em
       * `site-provisionamento.md` §2), e isso obriga a mensagem a viajar aqui.
       */
      mensagem: string;
    }
  | {
      ok: false;
      /** Código estável — os de `site-provisionamento.md` §2 não mudam. */
      code: string;
      mensagem: string;
      estado: number;
      /** `fieldErrors`/`formErrors` do Zod, só em `VALIDACAO`. */
      detalhes?: unknown;
      /** Segundos a esperar, só nos dois códigos de limite de tráfego. */
      retryAfterSec?: number;
    };

export const MENSAGEM_SUCESSO =
  'Conta criada. Enviámos uma ligação de confirmação para a sua caixa de correio: confirme o endereço para poder emitir documentos e convidar colegas.';

function falha(
  estado: number,
  code: string,
  mensagem: string,
  extra?: { detalhes?: unknown; retryAfterSec?: number },
): ResultadoRegisto {
  return { ok: false, code, mensagem, estado, ...extra };
}

/**
 * Apaga a identidade **que este pedido criou**, e só essa.
 *
 * `criouAqui` vem do 201 do Keycloak, logo já exclui a corrida em que dois
 * pedidos partilham o `sub`. O guarda-costas em Postgres cobre o que sobra
 * dela: o pedido que PERDEU a corrida pode cometer o tenant primeiro, e o que
 * a ganhou apanhar `EMAIL_JA_REGISTADO` a seguir — apagar aí deixava um
 * cliente real com tenant cometido e sem identidade, que o ADR-0031 §2-bis
 * declara pior do que o problema original. Se alguém já referencia o `sub`, a
 * identidade tem dono: não se toca.
 */
async function apagarIdentidadeSeForNossa(sub: string, criouAqui: boolean): Promise<void> {
  if (!criouAqui || !sub) return;
  try {
    const dono = await prismaBase.user.findFirst({
      where: { keycloakSub: sub },
      select: { id: true },
    });
    if (dono) {
      logger.warn(
        { sub },
        '[registo] identidade criada por este pedido já tem User local — corrida; não se apaga',
      );
      return;
    }
    await eliminarUtilizador(sub);
  } catch (err) {
    logger.error(
      { err: (err as Error)?.message, sub },
      '[registo] identidade não pôde ser removida — órfã para reconciliação (ADR-0013 §3)',
    );
  }
}

/**
 * Escreve a credencial do registante numa identidade **já provada como sua**
 * pelo commit deste pedido, e recria-a se entretanto tiver sido apagada.
 *
 * SÓ se chega aqui depois de `provisionarTenant` ter cometido o tenant: é essa
 * a prova de posse, e é ela que autoriza a escrita. Se a identidade
 * pertencesse a outra conta, a transacção teria recusado com
 * `EMAIL_JA_REGISTADO`. Não tornar esta função alcançável de mais lado nenhum:
 * sem o commit à frente, é escrita de credencial em identidade alheia.
 *
 * O 404 é o entrelaçamento que o parecer apanhou: outro pedido, com o mesmo
 * e-mail e um NUIT duplicado, é recusado em dezenas de milissegundos, não vê
 * `User` nenhum (a transacção deste ainda não cometeu) e apaga o `sub` que os
 * dois partilhavam. A identidade renasce aqui com a palavra-passe de QUEM SE
 * REGISTOU — não a de quem a apagou —, e o `User` passa a apontar-lhe.
 *
 * Devolve o `sub` que ficou a valer.
 */
async function credencialDepoisDoCommit(
  subCometido: string,
  dados: { admin: { nome: string; email: string }; senha: string },
  tenant: { tenantId: string; userId: string },
): Promise<string> {
  try {
    await definirPalavraPasse(subCometido, dados.senha, { temporaria: false });
    return subCometido;
  } catch (e) {
    const apagada = e instanceof ErroKeycloak && e.status === 404;
    if (apagada) {
      try {
        const { sub: novoSub } = await garantirUtilizador({
          email: dados.admin.email,
          nome: dados.admin.nome,
          accoes: [],
          emailVerificado: false,
        });
        await definirPalavraPasse(novoSub, dados.senha, { temporaria: false });
        // `updateMany` com `tenantId` explícito: `prismaBase` é o cliente cru,
        // sem a extensão multi-tenant (CLAUDE.md).
        await prismaBase.user.updateMany({
          where: { id: tenant.userId, tenantId: tenant.tenantId },
          data: { keycloakSub: novoSub },
        });
        logger.warn(
          { tenantId: tenant.tenantId, subAntigo: subCometido, sub: novoSub },
          '[registo] identidade apagada por outro pedido durante o registo — recriada com a credencial de quem se registou',
        );
        return novoSub;
      } catch (err) {
        logger.error(
          { err: (err as Error)?.message, tenantId: tenant.tenantId, sub: subCometido },
          '[registo] identidade apagada e NÃO recuperada — tenant cometido sem identidade, precisa de intervenção',
        );
        return subCometido;
      }
    }
    // Falha que não é apagamento (503, rede). O tenant existe: não se desfaz
    // nem se mente a dizer que falhou.
    //
    // A verdade adversarial do que fica: a identidade mantém a credencial
    // ANTERIOR. Quando a órfã foi semeada por outra pessoa, essa credencial é
    // dela, está viva, e serve agora um tenant cometido — até o dono recuperar
    // a palavra-passe. Exige empilhar duas falhas raras, e por isso é alerta,
    // não desfecho aceite: quem o vir no painel trata-o como incidente.
    logger.error(
      { err: (e as Error)?.message, tenantId: tenant.tenantId, sub: subCometido },
      '[registo] tenant cometido e credencial NÃO escrita — a identidade pode ter ficado com a credencial de quem a semeou',
    );
    return subCometido;
  }
}

export async function registarTenant(
  entrada: unknown,
  contexto: ContextoRegisto,
): Promise<ResultadoRegisto> {
  // 1. Limite de tráfego por IP.
  const rl = await registoLimiter.consume(`${contexto.ip}::registo`);
  if (rl.limited) {
    return falha(429, 'LIMITE_EXCEDIDO_IP', 'Demasiados pedidos. Tente mais tarde.', {
      retryAfterSec: Math.max(1, rl.retryAfterSec),
    });
  }

  // 2. `Idempotency-Key` obrigatória.
  const chave = contexto.idempotencyKey?.trim();
  if (!chave || chave.length < 8 || chave.length > 200) {
    return falha(
      400,
      'IDEMPOTENCY_KEY_OBRIGATORIA',
      'Cabeçalho Idempotency-Key obrigatório.',
    );
  }

  // 3. Corpo legível.
  if (entrada === CORPO_ILEGIVEL) {
    return falha(400, 'JSON_INVALIDO', 'Corpo do pedido inválido.');
  }

  // 4. Validação Zod estrita.
  const parsed = RegistoTenantSchema.safeParse(entrada);
  if (!parsed.success) {
    return falha(422, 'VALIDACAO', 'Dados de registo inválidos.', {
      detalhes: parsed.error.flatten(),
    });
  }
  const dados = parsed.data;

  // 5. Idempotência — reserva antes de qualquer efeito duradouro.
  //
  //    O `fingerprint` é SHA-256 do corpo, e o corpo passa a incluir a
  //    palavra-passe (ADR-0031 §Consequências). Fica dito aqui porque quem ler
  //    isto daqui a um ano vai perguntar: é o digest de um corpo de alta
  //    entropia — nome da empresa, NUIT, e-mail, província, token de captcha —
  //    e não um verificador de credencial. Não é reversível, não é comparável
  //    contra uma palavra-passe candidata sem o resto do corpo exacto, e nunca
  //    sai daqui: vive na coluna `fingerprint` da `ChaveIdempotencia` e serve
  //    só para distinguir um retry de um pedido novo com a mesma chave.
  const fingerprint = fingerprintDe(dados);
  const reserva = await reservarChave(chave, ENDPOINT_REGISTO, fingerprint);

  if (reserva.tipo === 'REPETIDA') {
    const guardado = (reserva.resposta ?? {}) as {
      tenantSlug?: string;
      mensagem?: string;
      sub?: string;
      email?: string;
    };
    return {
      ok: true,
      repetido: true,
      tenantSlug: guardado.tenantSlug ?? '',
      mensagem: guardado.mensagem ?? MENSAGEM_SUCESSO,
      // Gravados com a resposta para que a reentrega sirva o mesmo que a
      // primeira entrega. Vazios só se a chave tiver sido escrita por uma
      // versão anterior a esta.
      sub: guardado.sub ?? '',
      email: guardado.email ?? dados.admin.email,
    };
  }
  if (reserva.tipo === 'EM_CURSO') {
    return falha(
      409,
      'REGISTO_EM_CURSO',
      'Já existe um registo em curso com esta chave. Aguarde.',
    );
  }
  if (reserva.tipo === 'CONFLITO') {
    return falha(
      409,
      'IDEMPOTENCY_KEY_REUTILIZADA',
      'Esta chave de idempotência já foi usada com dados diferentes.',
    );
  }

  // 6. Limite por e-mail + captcha — OBRIGATORIAMENTE antes de qualquer toque
  //    no Keycloak: sem isto, a Admin API passa a ser a superfície exposta de
  //    um caminho anónimo.
  const rlEmail = await registoLimiter.consume(`${dados.admin.email}::registo`);
  if (rlEmail.limited) {
    await falharChave(chave);
    return falha(429, 'LIMITE_EXCEDIDO_EMAIL', 'Demasiados pedidos para este email.', {
      retryAfterSec: Math.max(1, rlEmail.retryAfterSec),
    });
  }

  const captcha = await verificarCaptcha(dados.captchaToken, contexto.ip);
  if (!captcha.valido) {
    if (captcha.motivo === 'captcha_indisponivel') {
      // Modo degradado (ADR-0016 §modo degradado): Turnstile inacessível →
      // aceitar o registo com alerta. Um verificador em baixa não pode fechar
      // o funil comercial — as camadas 2 (limite de tráfego) e 4 (verificação
      // de e-mail) continuam de pé. O alerta deve ser monitorizado (ADR-0019).
      logger.warn(
        { ip: contexto.ip, motivo: captcha.motivo },
        '[registo] captcha indisponível — aceitar em modo degradado (ADR-0016)',
      );
    } else {
      // 'captcha_invalido' ou 'captcha_nao_configurado': rejeitar.
      await falharChave(chave);
      return falha(
        403,
        'CAPTCHA_INVALIDO',
        'Verificação anti-robô falhou. Actualize a página e tente de novo.',
      );
    }
  }

  // 7. Identidade no Keycloak — SEMPRE antes de Postgres (ADR-0013 §2: o lado
  //    sem transacção vai à frente; ADR-0031 §2: com a palavra-passe já
  //    escrita, senão a sessão da submissão seguinte não existe).
  //
  //    `accoes: []` é o ponto do ADR-0031: com `VERIFY_EMAIL` pendente o
  //    Direct Access Grant (ADR-0029) recusa a sessão e o registo não dá
  //    entrada nenhuma — que é exactamente o defeito que este caminho existe
  //    para corrigir. `temporaria: false` remove `UPDATE_PASSWORD` e devolve a
  //    conta ao normal (ADR-0030).
  //
  //    A credencial só se escreve aqui numa identidade que ESTE pedido criou,
  //    e quem o diz é o 201 do Keycloak (`criado`), não uma leitura prévia: o
  //    `procurarPorEmail`-antes-de-criar é TOCTOU, dois pedidos simultâneos
  //    lêem ambos `null`, partilham o `sub` deduplicado e julgam-se ambos
  //    criadores (ADR-0031 §2-bis). Numa identidade preexistente não se toca
  //    na credencial: sobrescrevê-la seria tomada de conta — bastava
  //    registar-se com o e-mail de um cliente para lha trocar, e o
  //    `EMAIL_JA_REGISTADO` só chega depois do estrago.
  let sub = '';
  let identidadeCriadaAqui = false;
  try {
    const identidade = await garantirUtilizador({
      email: dados.admin.email,
      nome: dados.admin.nome,
      accoes: [],
      emailVerificado: false,
    });
    sub = identidade.sub;
    identidadeCriadaAqui = identidade.criado;
    if (identidadeCriadaAqui) {
      await definirPalavraPasse(sub, dados.senha, { temporaria: false });
    }
  } catch (e) {
    // Falhou antes de tocar em Postgres: não há nada para desfazer do lado da
    // base de dados. Do lado do Keycloak pode ter ficado uma identidade sem
    // credencial — apaga-se, para o pedido ser repetível sem lixo meio-criado
    // (tarefa 2.3).
    await apagarIdentidadeSeForNossa(sub, identidadeCriadaAqui);
    await falharChave(chave);
    logger.error(
      { err: (e as Error)?.message, identidadeCriadaAqui },
      '[registo] falha ao preparar a identidade no Keycloak',
    );
    return falha(500, 'ERRO_INTERNO', 'Não foi possível concluir o registo.');
  }

  // 8. Postgres: Tenant → ConfiguracaoFiscal → Assinatura(TRIAL) → RBAC →
  //    User(keycloakSub) → PGC-NIRF → séries → Notificacao, numa transacção.
  //    `provisionarTenant` volta a chamar `garantirUtilizador` e reencontra a
  //    identidade acima (idempotente por e-mail): não reescreve acções nem
  //    credencial. Recebe o admin SEM `senha` — o ERP não a passa adiante.
  let resultado;
  try {
    resultado = await provisionarTenant({
      empresa: dados.empresa,
      admin: { nome: dados.admin.nome, email: dados.admin.email },
      planoId: dados.planoId as PlanoId,
      provincia: dados.provincia,
    });
  } catch (e) {
    await falharChave(chave);
    if (e instanceof AppError) {
      // Recusa determinística (NUIT/e-mail já registados, RBAC, slug): a
      // transacção não deixou nada e a identidade que este pedido criou fica
      // sem dono. Apagá-la fecha o caminho de quem semeia identidades com
      // palavra-passe própria para e-mails alheios, forçando de propósito uma
      // destas recusas e esperando que a vítima se registe a seguir.
      await apagarIdentidadeSeForNossa(sub, identidadeCriadaAqui);
      return falha(e.status, e.code, e.message);
    }
    // Falha inesperada: não se sabe se a transacção chegou a comprometer-se.
    // Aqui NÃO se apaga a identidade — vale a regra do ADR-0013 §3 (órfã
    // detectável e reparável é melhor do que um tenant sem forma de entrar).
    logger.error(
      { err: { message: (e as Error)?.message, stack: (e as Error)?.stack } },
      '[registo] falha inesperada no provisionamento',
    );
    return falha(500, 'ERRO_INTERNO', 'Não foi possível concluir o registo.');
  }

  // 9. Depois do commit, e só depois: garantir que a identidade que o tenant
  //    acabou de referenciar tem a credencial de quem se registou.
  //
  //    Dois casos chegam aqui, e o commit é a prova de posse em ambos — se a
  //    identidade pertencesse a outra conta, o `provisionarTenant` teria
  //    recusado com `EMAIL_JA_REGISTADO`:
  //
  //    a) **Órfã**: a identidade já existia (`criado: false`), sobrou de uma
  //       tentativa anterior e guardava a credencial de quem a semeou. Sem
  //       isto, o tenant nascia preso a essa credencial — benigno quando é a
  //       própria pessoa a repetir, tomada de conta quando não é.
  //    b) **Substituída a meio**: a identidade que este pedido criou foi
  //       apagada entre a escrita da credencial e a transacção, e o
  //       `provisionarTenant` criou outra ao reencontrá-la em falta. O `sub`
  //       cometido não é o nosso, e essa identidade ainda não tem credencial.
  //
  //    A escrita ANTES da transacção continua a ser a do caso normal (ADR-0031
  //    §2); aqui não podia ser, porque «sem `User` local» lido antes do commit
  //    não distingue uma órfã de um registo concorrente ainda a meio.
  const subCometido = resultado.keycloakSub;
  if (!identidadeCriadaAqui || subCometido !== sub) {
    sub = await credencialDepoisDoCommit(subCometido, dados, {
      tenantId: resultado.tenantId,
      userId: resultado.userId,
    });
  } else {
    sub = subCometido;
  }

  const resposta = {
    tenantSlug: resultado.tenantSlug,
    mensagem: MENSAGEM_SUCESSO,
    // O `sub` que ficou a valer — que não é o cometido se a identidade teve de
    // ser recriada. É este que a verificação de e-mail vai usar.
    sub,
    email: resultado.adminEmail,
  };
  await concluirChave(chave, resposta, resultado.tenantId);

  // 9. Efeitos externos — FORA da transacção (persistir-depois-enviar).
  //    O e-mail de verificação NÃO é disparado aqui: quem chama é que o envia
  //    depois de dar a sessão, porque a entrada no produto deixou de depender
  //    dele (ADR-0031). `sub` e `email` vão no resultado para isso mesmo.
  //
  //    Subscrição de trial no Stripe: best-effort, não bloqueia a resposta nem
  //    o acesso ao trial local. O cron de fallback cobre a falha.
  void criarSubscricaoTrial(resultado.tenantId, dados.planoId as PlanoId).catch(() => {});

  return {
    ok: true,
    repetido: false,
    tenantSlug: resultado.tenantSlug,
    sub,
    email: resultado.adminEmail,
    mensagem: MENSAGEM_SUCESSO,
  };
}
