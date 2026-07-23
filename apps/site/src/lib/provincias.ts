/**
 * Províncias de Moçambique — valor submetido no registo (spec 19 exige
 * `provincia` no payload de `POST /api/publico/registo`).
 */
export const PROVINCIAS = [
  "Cabo Delgado",
  "Gaza",
  "Inhambane",
  "Manica",
  "Maputo",
  "Maputo Cidade",
  "Nampula",
  "Niassa",
  "Sofala",
  "Tete",
  "Zambézia",
] as const;

export type Provincia = (typeof PROVINCIAS)[number];

export function eProvinciaValida(valor: string): valor is Provincia {
  return (PROVINCIAS as readonly string[]).includes(valor);
}
