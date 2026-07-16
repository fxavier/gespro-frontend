/**
 * Províncias e Distritos de Moçambique.
 * Fonte: Decreto 33/2009 (divisão administrativa).
 *
 * Exporta:
 *  - PROVINCIAS_MOCAMBIQUE: array completo com distritos
 *  - NOMES_PROVINCIAS: tuple de strings (para Zod enum)
 *  - ProvinciaEnum: z.enum() pronto a usar em schemas
 */
import { z } from 'zod';

export interface Provincia {
  nome: string;
  distritos: string[];
}

export const PROVINCIAS_MOCAMBIQUE: Provincia[] = [
  {
    nome: 'Maputo Cidade',
    distritos: ['KaMpfumo', 'Nlhamankulu', 'KaMaxakeni', 'KaMubukwana', 'KaNyaka', 'KaMavota', 'KaTembe'],
  },
  {
    nome: 'Maputo',
    distritos: ['Boane', 'Magude', 'Manhica', 'Marracuene', 'Matola', 'Matutui­ne', 'Moamba', 'Namaacha'],
  },
  {
    nome: 'Gaza',
    distritos: ['Bilene', 'Chibuto', 'Chicualacuala', 'Chigubo', 'Chokwe', 'Guija', 'Limpopo', 'Mabalane', 'Manjacaze', 'Massangena', 'Massingir', 'Xai-Xai'],
  },
  {
    nome: 'Inhambane',
    distritos: ['Funhalouro', 'Govuro', 'Homoine', 'Inhambane', 'Inharrime', 'Inhassoro', 'Jangamo', 'Mabote', 'Massinga', 'Morrumbene', 'Panda', 'Vilankulo', 'Zavala'],
  },
  {
    nome: 'Sofala',
    distritos: ['Beira', 'Buzi', 'Caia', 'Chemba', 'Cheringoma', 'Chibabava', 'Dondo', 'Gorongosa', 'Machanga', 'Maringe', 'Muanza', 'Nhamatanda'],
  },
  {
    nome: 'Manica',
    distritos: ['Barue', 'Chimoio', 'Gondola', 'Guro', 'Macate', 'Machaze', 'Macossa', 'Manica', 'Mossurize', 'Sussundenga', 'Tambara', 'Vanduzi'],
  },
  {
    nome: 'Tete',
    distritos: ['Angonia', 'Cahora-Bassa', 'Changara', 'Chifunde', 'Chiuta', 'Doa', 'Macanga', 'Magoe', 'Marara', 'Maravia', 'Moatize', 'Mutarara', 'Tete', 'Tsangano', 'Zumbo'],
  },
  {
    nome: 'Zambezia',
    distritos: ['Alto Molocue', 'Chinde', 'Derre', 'Gile', 'Gurue', 'Ile', 'Inhassunge', 'Lugela', 'Maganja da Costa', 'Milange', 'Mocuba', 'Mocubela', 'Molumbo', 'Mopeia', 'Morrumbala', 'Namacurra', 'Namarroi', 'Nicoadala', 'Pebane', 'Quelimane'],
  },
  {
    nome: 'Nampula',
    distritos: ['Angoche', 'Erati', 'Ilha de Mocambique', 'Lalaua', 'Larde', 'Liupo', 'Malema', 'Meconta', 'Mecuburi', 'Memba', 'Mogincual', 'Mogovolas', 'Moma', 'Monapo', 'Mossuril', 'Muecate', 'Murrupula', 'Nacala-a-Velha', 'Nacala Porto', 'Nacaroa', 'Nampula', 'Rapale', 'Ribaue'],
  },
  {
    nome: 'Cabo Delgado',
    distritos: ['Ancuabe', 'Balama', 'Chiure', 'Ibo', 'Macomia', 'Mecufi', 'Meluco', 'Metuge', 'Mocimboa da Praia', 'Montepuez', 'Mueda', 'Muidumbe', 'Namuno', 'Nangade', 'Palma', 'Pemba', 'Quissanga'],
  },
  {
    nome: 'Niassa',
    distritos: ['Chimbonila', 'Cuamba', 'Lago', 'Lichinga', 'Majune', 'Mandimba', 'Marrupa', 'Maua', 'Mavago', 'Mecanhelas', 'Mecula', 'Metarica', 'Muembe', "N'gauma", 'Nipepe', 'Sanga'],
  },
];

/** Array de nomes para uso em Zod enum (deve ter pelo menos 1 elemento). */
export const NOMES_PROVINCIAS = PROVINCIAS_MOCAMBIQUE.map((p) => p.nome) as [string, ...string[]];

/**
 * Enum Zod das províncias — reutilize em schemas de endereço.
 * @example
 *   const schema = z.object({ provincia: ProvinciaEnum })
 */
export const ProvinciaEnum = z.enum(NOMES_PROVINCIAS);
export type Provincia_t = z.infer<typeof ProvinciaEnum>;

/** Devolve a lista de nomes de províncias. */
export function getProvincias(): string[] {
  return PROVINCIAS_MOCAMBIQUE.map((p) => p.nome);
}

/** Devolve os distritos de uma província pelo nome. */
export function getDistritosByProvincia(provincia: string): string[] {
  const prov = PROVINCIAS_MOCAMBIQUE.find((p) => p.nome === provincia);
  return prov ? prov.distritos : [];
}
