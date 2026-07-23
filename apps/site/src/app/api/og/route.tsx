import { ImageResponse } from "next/og";
import cores from "@gespro/brand/cores.json";

/**
 * Imagem OpenGraph gerada em runtime (Requisito 7.1).
 *
 * Parametrizada por `?titulo=&seccao=`, o que evita manter um ficheiro PNG por
 * página (e mantê-los sincronizados com o texto).
 *
 * `ImageResponse` renderiza fora do browser e não avalia CSS custom properties
 * — daí as cores virem de `packages/brand/cores.json` (a fonte única dos
 * literais de marca) em vez dos tokens de `tokens.css`.
 */
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };

const FUNDO = cores.fundoEscuro;
const TEXTO = cores.textoClaro;
const SECUNDARIO = cores.textoSecundario;
const MARCA = cores.marca;
const DESTAQUE = cores.destaque;

export async function GET(pedido: Request) {
  const { searchParams } = new URL(pedido.url);
  const titulo = (searchParams.get("titulo") ?? "GestPro").slice(0, 120);
  const seccao = searchParams.get("seccao")?.slice(0, 40);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: FUNDO,
          backgroundImage: `radial-gradient(900px 500px at 8% -8%, ${MARCA}38 0%, transparent 62%), radial-gradient(700px 420px at 105% 10%, ${DESTAQUE}2e 0%, transparent 60%)`,
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              border: `4px solid ${MARCA}`,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              gap: 5,
              paddingBottom: 11,
            }}
          >
            <div style={{ width: 7, height: 12, background: MARCA, opacity: 0.55, borderRadius: 2 }} />
            <div style={{ width: 7, height: 19, background: MARCA, opacity: 0.78, borderRadius: 2 }} />
            <div style={{ width: 7, height: 27, background: MARCA, borderRadius: 2 }} />
          </div>
          {/* Satori exige `display` explícito em qualquer nó com mais de um
              filho — sem isto o render falha em runtime, não em build. */}
          <div
            style={{
              display: "flex",
              fontSize: 34,
              fontWeight: 600,
              color: TEXTO,
              letterSpacing: -0.5,
            }}
          >
            Gest<span style={{ color: MARCA }}>Pro</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {seccao ? (
            <div
              style={{
                display: "flex",
                fontSize: 24,
                color: DESTAQUE,
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              {seccao}
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              fontSize: titulo.length > 60 ? 62 : 78,
              lineHeight: 1.05,
              fontWeight: 700,
              color: TEXTO,
              letterSpacing: -2,
            }}
          >
            {titulo}
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 26, color: SECUNDARIO }}>
          ERP para empresas moçambicanas · Maputo
        </div>
      </div>
    ),
    size
  );
}
