"use client";

import { useSyncExternalStore } from "react";
import Script from "next/script";
import { useReportWebVitals } from "next/web-vitals";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  CONSENTIMENTO_OBRIGATORIO,
  PLAUSIBLE_DOMINIO,
  PLAUSIBLE_HOST,
} from "@/lib/env";
import {
  guardarConsentimento,
  snapshotConsentimento,
  snapshotConsentimentoServidor,
  subscreverConsentimento,
} from "@/lib/analytics";
import { Botao } from "./primitivos";

/**
 * Analytics + Web Vitals + aviso de privacidade (Requisito 9, ADR-0008).
 *
 * Sem `NEXT_PUBLIC_PLAUSIBLE_DOMINIO` definido nada é carregado — é o estado
 * em desenvolvimento, em CI e nos testes de acessibilidade, o que mantém as
 * medições reprodutíveis e o site utilizável sem rede externa.
 */
export function Analytics() {
  // `useSyncExternalStore` em vez de `useEffect` + `setState`: o consentimento
  // vive fora do React (localStorage) e este é o mecanismo que o lê sem render
  // extra depois da hidratação e sem desencontro entre servidor e cliente.
  const consentimento = useSyncExternalStore(
    subscreverConsentimento,
    snapshotConsentimento,
    snapshotConsentimentoServidor
  );

  const decidido = !CONSENTIMENTO_OBRIGATORIO || consentimento !== null;

  const podeCarregar =
    Boolean(PLAUSIBLE_DOMINIO) &&
    (!CONSENTIMENTO_OBRIGATORIO || consentimento === "aceite");

  return (
    <>
      {podeCarregar ? (
        <Script
          defer
          data-domain={PLAUSIBLE_DOMINIO}
          src={`${PLAUSIBLE_HOST}/js/script.js`}
          strategy="afterInteractive"
        />
      ) : null}
      <WebVitals />
      {CONSENTIMENTO_OBRIGATORIO && !decidido ? (
        <AvisoPrivacidade onDecidir={guardarConsentimento} />
      ) : null}
    </>
  );
}

/**
 * Web Vitals de campo (Requisito 9.2) enviados para `/api/vitals`, que os
 * escreve no log estruturado do site — o mesmo destino de recolha do resto da
 * observabilidade. `sendBeacon` para não competir com o descarregamento da
 * página.
 */
function WebVitals() {
  useReportWebVitals((metrica) => {
    const corpo = JSON.stringify({
      nome: metrica.name,
      valor: Math.round(
        metrica.name === "CLS" ? metrica.value * 1000 : metrica.value
      ),
      classificacao: metrica.rating,
      caminho: window.location.pathname,
      navegacao: metrica.navigationType,
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/vitals", corpo);
    } else {
      void fetch("/api/vitals", {
        body: corpo,
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
      });
    }
  });

  return null;
}

function AvisoPrivacidade({
  onDecidir,
}: {
  onDecidir: (valor: "aceite" | "recusado") => void;
}) {
  const t = useTranslations("analytics");

  return (
    <div
      role="region"
      aria-label={t("regiao")}
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-2xl border border-contorno-suave bg-card p-5 shadow-md"
    >
      <h2 className="text-sm font-semibold text-foreground">{t("titulo")}</h2>
      <p className="mt-1.5 text-sm text-texto-suave">{t("descricao")}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Botao onClick={() => onDecidir("aceite")}>{t("aceitar")}</Botao>
        <Botao variante="secundario" onClick={() => onDecidir("recusado")}>
          {t("recusar")}
        </Botao>
        <Link
          href="/privacidade"
          className="sublinhado-animado text-sm text-texto-suave hover:text-foreground"
        >
          {t("saibaMais")}
        </Link>
      </div>
    </div>
  );
}
