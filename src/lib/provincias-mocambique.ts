
/**
 * Províncias e Distritos de Moçambique
 */

export interface Distrito {
  nome: string;
}

export interface Provincia {
  nome: string;
  distritos: string[];
}

export const PROVINCIAS_MOCAMBIQUE: Provincia[] = [
  {
    nome: 'Maputo Cidade',
    distritos: ['KaMpfumo', 'Nlhamankulu', 'KaMaxakeni', 'KaMubukwana', 'KaNyaka', 'KaMavota', 'KaTembe']
  },
  {
    nome: 'Maputo',
    distritos: ['Boane', 'Magude', 'Manhiça', 'Marracuene', 'Matola', 'Matutuíne', 'Moamba', 'Namaacha']
  },
  {
    nome: 'Gaza',
    distritos: ['Bilene', 'Chibuto', 'Chicualacuala', 'Chigubo', 'Chókwè', 'Guijá', 'Limpopo', 'Mabalane', 'Manjacaze', 'Massangena', 'Massingir', 'Xai-Xai']
  },
  {
    nome: 'Inhambane',
    distritos: ['Funhalouro', 'Govuro', 'Homoíne', 'Inhambane', 'Inharrime', 'Inhassoro', 'Jangamo', 'Mabote', 'Massinga', 'Morrumbene', 'Panda', 'Vilankulo', 'Zavala']
  },
  {
    nome: 'Sofala',
    distritos: ['Beira', 'Búzi', 'Caia', 'Chemba', 'Cheringoma', 'Chibabava', 'Dondo', 'Gorongosa', 'Machanga', 'Maríngue', 'Muanza', 'Nhamatanda']
  },
  {
    nome: 'Manica',
    distritos: ['Báruè', 'Chimoio', 'Gondola', 'Guro', 'Macate', 'Machaze', 'Macossa', 'Manica', 'Mossurize', 'Sussundenga', 'Tambara', 'Vanduzi']
  },
  {
    nome: 'Tete',
    distritos: ['Angónia', 'Cahora-Bassa', 'Changara', 'Chifunde', 'Chiuta', 'Dôa', 'Macanga', 'Magoé', 'Marara', 'Marávia', 'Moatize', 'Mutarara', 'Tete', 'Tsangano', 'Zumbo']
  },
  {
    nome: 'Zambézia',
    distritos: ['Alto Molócuè', 'Chinde', 'Derre', 'Gilé', 'Gurué', 'Ile', 'Inhassunge', 'Lugela', 'Maganja da Costa', 'Milange', 'Mocuba', 'Mocubela', 'Molumbo', 'Mopeia', 'Morrumbala', 'Namacurra', 'Namarroi', 'Nicoadala', 'Pebane', 'Quelimane']
  },
  {
    nome: 'Nampula',
    distritos: ['Angoche', 'Eráti', 'Ilha de Moçambique', 'Lalaua', 'Larde', 'Liúpo', 'Malema', 'Meconta', 'Mecubúri', 'Memba', 'Mogincual', 'Mogovolas', 'Moma', 'Monapo', 'Mossuril', 'Muecate', 'Murrupula', 'Nacala-a-Velha', 'Nacala Porto', 'Nacarôa', 'Nampula', 'Rapale', 'Ribaué']
  },
  {
    nome: 'Cabo Delgado',
    distritos: ['Ancuabe', 'Balama', 'Chiúre', 'Ibo', 'Macomia', 'Mecúfi', 'Meluco', 'Metuge', 'Mocímboa da Praia', 'Montepuez', 'Mueda', 'Muidumbe', 'Namuno', 'Nangade', 'Palma', 'Pemba', 'Quissanga']
  },
  {
    nome: 'Niassa',
    distritos: ['Chimbonila', 'Cuamba', 'Lago', 'Lichinga', 'Majune', 'Mandimba', 'Marrupa', 'Maúa', 'Mavago', 'Mecanhelas', 'Mecula', 'Metarica', 'Muembe', 'N\'gauma', 'Nipepe', 'Sanga']
  }
];

export function getProvincias(): string[] {
  return PROVINCIAS_MOCAMBIQUE.map(p => p.nome);
}

export function getDistritosByProvincia(provincia: string): string[] {
  const prov = PROVINCIAS_MOCAMBIQUE.find(p => p.nome === provincia);
  return prov ? prov.distritos : [];
}
