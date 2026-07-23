"use client";

import { useActionState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { registarEmpresa, type EstadoRegisto } from "@/actions/registo";
import { PROVINCIAS } from "@/lib/provincias";
import { IDS_PLANO, type Plano } from "@/lib/planos";
import { EVENTOS, registarEvento } from "@/lib/analytics";
import { Armadilha, Campo, CampoSelecao } from "./campos";
import { Botao } from "./primitivos";
import { Gesto } from "./movimento";

const INICIAL: EstadoRegisto = { estado: "inicial" };

/**
 * Formulário de arranque de trial.
 *
 * Submete via Server Action, que por sua vez chama `POST /api/publico/registo`
 * do spec 19 com `Idempotency-Key`. A chave é gerada UMA vez por instância do
 * formulário (`useRef`): se o utilizador voltar a carregar em "Criar conta"
 * após um timeout, o spec 19 reconhece o pedido repetido e não cria uma segunda
 * empresa.
 */
export function FormularioRegisto({ planos }: { planos: Plano[] }) {
  const t = useTranslations("comecar");
  const [estado, accao, pendente] = useActionState(registarEmpresa, INICIAL);
  const campoChave = useRef<HTMLInputElement>(null);
  const parametros = useSearchParams();

  /**
   * Gera a chave de idempotência no *evento* de submissão (não no render, que
   * tem de ser puro) e só se ainda não existir. Consequência desejada: uma
   * segunda tentativa após timeout envia a MESMA chave, e o spec 19 reconhece
   * o pedido repetido em vez de criar uma segunda empresa.
   */
  function garantirChaveIdempotencia() {
    const campo = campoChave.current;
    if (campo && !campo.value) {
      campo.value =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  }

  const planoInicial = useMemo(() => {
    const pedido = parametros.get("plano")?.toUpperCase();
    if (pedido && (IDS_PLANO as readonly string[]).includes(pedido)) {
      return pedido;
    }
    return planos.find((p) => p.destaque)?.id ?? planos[0]?.id ?? "BASICO";
  }, [parametros, planos]);

  useEffect(() => {
    if (estado.estado === "sucesso") {
      registarEvento(EVENTOS.registoConcluido);
      window.location.assign(estado.destino);
    } else if (estado.estado === "erro") {
      registarEvento(EVENTOS.registoFalhado);
    }
  }, [estado]);

  const erros =
    estado.estado === "erro" ? (estado.camposComErro ?? {}) : {};
  const mensagemErro =
    estado.estado === "erro" && !estado.camposComErro
      ? t(`erros.${estado.chaveMensagem}`)
      : undefined;

  function traduzirErro(campo: string): string | undefined {
    const chave = erros[campo];
    return chave ? t(`erros.${chave}`) : undefined;
  }

  return (
    <form
      action={accao}
      onSubmit={() => {
        garantirChaveIdempotencia();
        registarEvento(EVENTOS.registoIniciado);
      }}
      noValidate
      className="flex flex-col gap-8"
    >
      <input
        ref={campoChave}
        type="hidden"
        name="chaveIdempotencia"
        defaultValue=""
      />
      <Armadilha />

      {mensagemErro ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground"
        >
          {mensagemErro}
        </p>
      ) : null}

      {estado.estado === "sucesso" ? (
        <p
          role="status"
          className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-foreground"
        >
          {t("sucesso")}
        </p>
      ) : null}

      <fieldset className="flex flex-col gap-5 border-0 p-0">
        <legend className="mb-1 text-sm font-semibold tracking-wide text-texto-suave uppercase">
          {t("seccaoEmpresa")}
        </legend>
        <Campo
          name="empresaNome"
          rotulo={t("campos.empresaNome")}
          autoComplete="organization"
          required
          erro={traduzirErro("empresaNome")}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Campo
            name="empresaNuit"
            rotulo={t("campos.empresaNuit")}
            ajuda={t("campos.empresaNuitAjuda")}
            inputMode="numeric"
            pattern="\d{9}"
            maxLength={9}
            required
            erro={traduzirErro("empresaNuit")}
          />
          <CampoSelecao
            name="provincia"
            rotulo={t("campos.provincia")}
            defaultValue=""
            required
            erro={traduzirErro("provincia")}
          >
            <option value="" disabled>
              {t("campos.provinciaPlaceholder")}
            </option>
            {PROVINCIAS.map((provincia) => (
              <option key={provincia} value={provincia}>
                {provincia}
              </option>
            ))}
          </CampoSelecao>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-5 border-0 p-0">
        <legend className="mb-1 text-sm font-semibold tracking-wide text-texto-suave uppercase">
          {t("seccaoAdmin")}
        </legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Campo
            name="adminNome"
            rotulo={t("campos.adminNome")}
            autoComplete="name"
            required
            erro={traduzirErro("adminNome")}
          />
          <Campo
            name="adminEmail"
            type="email"
            rotulo={t("campos.adminEmail")}
            autoComplete="email"
            required
            erro={traduzirErro("adminEmail")}
          />
        </div>
        <Campo
          name="adminSenha"
          type="password"
          rotulo={t("campos.adminSenha")}
          ajuda={t("campos.adminSenhaAjuda")}
          autoComplete="new-password"
          minLength={10}
          required
          erro={traduzirErro("adminSenha")}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-5 border-0 p-0">
        <legend className="mb-1 text-sm font-semibold tracking-wide text-texto-suave uppercase">
          {t("seccaoPlano")}
        </legend>
        <CampoSelecao
          name="planoId"
          rotulo={t("campos.plano")}
          defaultValue={planoInicial}
          required
          erro={traduzirErro("planoId")}
        >
          {planos.map((plano) => (
            <option key={plano.id} value={plano.id}>
              {plano.nome}
            </option>
          ))}
        </CampoSelecao>
      </fieldset>

      <div className="flex flex-col gap-4">
        <Gesto>
          <Botao type="submit" tamanho="lg" disabled={pendente} className="w-full">
            {pendente ? t("aSubmeter") : t("submeter")}
          </Botao>
        </Gesto>
        <p className="text-xs leading-relaxed text-texto-suave">
          {t.rich("aceitacao", {
            termos: (partes) => (
              <Link href="/termos" className="sublinhado-animado text-foreground">
                {partes}
              </Link>
            ),
            privacidade: (partes) => (
              <Link
                href="/privacidade"
                className="sublinhado-animado text-foreground"
              >
                {partes}
              </Link>
            ),
          })}
        </p>
      </div>
    </form>
  );
}
