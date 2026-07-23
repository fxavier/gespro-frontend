"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { ASSUNTOS_CONTACTO } from "@/lib/validations";
import { EVENTOS, registarEvento } from "@/lib/analytics";
import { Armadilha, Campo, CampoSelecao, CampoTexto } from "./campos";
import { Botao } from "./primitivos";
import { Gesto } from "./movimento";

type Estado =
  | { tipo: "inicial" }
  | { tipo: "a-enviar" }
  | { tipo: "sucesso" }
  | { tipo: "erro"; chave: "erroGenerico" | "erroLimite" };

/**
 * Formulário de contacto.
 *
 * Submete para `POST /api/contacto` (Route Handler do próprio site), e não para
 * uma Server Action, porque é uma operação de integração com um sistema externo
 * (SMTP) e não uma mutação de estado da aplicação — mesma regra que o ERP
 * aplica a webhooks e exportações.
 */
export function FormularioContacto() {
  const t = useTranslations("contacto");
  const tComum = useTranslations("comum");
  const [estado, setEstado] = useState<Estado>({ tipo: "inicial" });
  const [erros, setErros] = useState<Record<string, string>>({});

  async function aoSubmeter(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    setEstado({ tipo: "a-enviar" });
    setErros({});

    try {
      const resposta = await fetch("/api/contacto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          Object.fromEntries(new FormData(formulario).entries())
        ),
      });

      if (resposta.status === 429) {
        setEstado({ tipo: "erro", chave: "erroLimite" });
        return;
      }

      const corpo = (await resposta.json().catch(() => null)) as {
        ok?: boolean;
        camposComErro?: Record<string, string>;
      } | null;

      if (!resposta.ok || !corpo?.ok) {
        if (corpo?.camposComErro) setErros(corpo.camposComErro);
        setEstado({ tipo: "erro", chave: "erroGenerico" });
        return;
      }

      registarEvento(EVENTOS.contactoEnviado);
      formulario.reset();
      setEstado({ tipo: "sucesso" });
    } catch {
      setEstado({ tipo: "erro", chave: "erroGenerico" });
    }
  }

  function traduzirErro(campo: string): string | undefined {
    const chave = erros[campo];
    return chave ? t(`erros.${chave}`) : undefined;
  }

  return (
    <form onSubmit={aoSubmeter} noValidate className="flex flex-col gap-5">
      <Armadilha />

      {estado.tipo === "sucesso" ? (
        <p
          role="status"
          className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-foreground"
        >
          {t("sucesso")}
        </p>
      ) : null}

      {estado.tipo === "erro" ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground"
        >
          {estado.chave === "erroLimite"
            ? t("erroLimite")
            : t("erroGenerico", { email: tComum("email") })}
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Campo
          name="nome"
          rotulo={t("campos.nome")}
          autoComplete="name"
          required
          erro={traduzirErro("nome")}
        />
        <Campo
          name="email"
          type="email"
          rotulo={t("campos.email")}
          autoComplete="email"
          required
          erro={traduzirErro("email")}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Campo
          name="empresa"
          rotulo={t("campos.empresa")}
          autoComplete="organization"
          required
          erro={traduzirErro("empresa")}
        />
        <Campo
          name="telefone"
          type="tel"
          rotulo={t("campos.telefone")}
          autoComplete="tel"
          erro={traduzirErro("telefone")}
        />
      </div>

      <CampoSelecao
        name="assunto"
        rotulo={t("campos.assunto")}
        defaultValue="demonstracao"
        required
        erro={traduzirErro("assunto")}
      >
        {ASSUNTOS_CONTACTO.map((assunto) => (
          <option key={assunto} value={assunto}>
            {t(`assuntos.${assunto}`)}
          </option>
        ))}
      </CampoSelecao>

      <CampoTexto
        name="mensagem"
        rotulo={t("campos.mensagem")}
        required
        minLength={20}
        maxLength={4000}
        erro={traduzirErro("mensagem")}
      />

      <Gesto className="self-start">
        <Botao type="submit" tamanho="lg" disabled={estado.tipo === "a-enviar"}>
          {estado.tipo === "a-enviar" ? t("aSubmeter") : t("submeter")}
        </Botao>
      </Gesto>
    </form>
  );
}
