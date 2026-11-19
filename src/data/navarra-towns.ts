/**
 * src/data/navarra-towns.ts
 * 
 * Estructura de comarcas, merindades y municipios históricos de Navarra
 * para el archivo fotográfico global.
 */

export interface NavarraTown {
  id: string;
  name: string;
  altName?: string;
  merindad: "Estella" | "Olite" | "Tudela" | "Pamplona" | "Sangüesa";
  comarca: string;
  coords: [number, number];
  description?: string;
}

export const NAVARRA_MERINDADES = [
  "Estella",
  "Olite",
  "Tudela",
  "Pamplona",
  "Sangüesa",
] as const;

export const NAVARRA_TOWNS: NavarraTown[] = [
  // ─── TIERRA ESTELLA ───────────────────────────────────────────
  {
    id: "estella-lizarra",
    name: "Estella-Lizarra",
    altName: "Estella",
    merindad: "Estella",
    comarca: "Tierra Estella",
    coords: [42.6713, -2.0298],
    description: "Capital histórica del Ega, enclave románico y comercial del Camino de Santiago."
  },
  {
    id: "viana",
    name: "Viana",
    merindad: "Estella",
    comarca: "Tierra Estella",
    coords: [42.5153, -2.3719],
    description: "Ciudad fortaleza en la frontera, sepultura de César Borgia."
  },
  {
    id: "los-arcos",
    name: "Los Arcos",
    merindad: "Estella",
    comarca: "Tierra Estella",
    coords: [42.5694, -2.1914],
    description: "Parada jacobea emblemática con su monumental iglesia de Santa María."
  },
  {
    id: "san-adrian",
    name: "San Adrián",
    merindad: "Estella",
    comarca: "Ribera del Alto Ebro",
    coords: [42.3333, -1.9333],
    description: "Pueblo de fértiles huertas en la confluencia del Ega y el Ebro."
  },
  {
    id: "lodosa",
    name: "Lodosa",
    merindad: "Estella",
    comarca: "Ribera del Alto Ebro",
    coords: [42.4244, -2.0792],
    description: "Cuna del Pimiento del Piquillo a orillas del Ebro."
  },
  {
    id: "lerin",
    name: "Lerín",
    merindad: "Estella",
    comarca: "Ribera Estellesa",
    coords: [42.4842, -1.9711],
    description: "Villa encaramada en lo alto del espolón sobre el río Ega."
  },

  // ─── MERINDAD DE OLITE / ZONA MEDIA ───────────────────────────
  {
    id: "olite-erriberri",
    name: "Olite-Erriberri",
    altName: "Olite",
    merindad: "Olite",
    comarca: "Zona Media",
    coords: [42.4817, -1.6508],
    description: "Corte histórica de los Reyes de Navarra con su majestuoso Palacio Real gótico."
  },
  {
    id: "tafalla",
    name: "Tafalla",
    merindad: "Olite",
    comarca: "Zona Media",
    coords: [42.5217, -1.6750],
    description: "Corazón comercial e industrial de la Zona Media navarra."
  },
  {
    id: "artajona",
    name: "Artajona",
    merindad: "Olite",
    comarca: "Zona Media",
    coords: [42.5900, -1.7644],
    description: "Célebre por el Cerco medieval fortificado del siglo XI."
  },
  {
    id: "ujue",
    name: "Ujué-Uxue",
    altName: "Ujué",
    merindad: "Olite",
    comarca: "Zona Media",
    coords: [42.5056, -1.4989],
    description: "Villa medieval de piedra coronada por el Santuario-Fortaleza de Santa María."
  },
  {
    id: "san-martin-unx",
    name: "San Martín de Unx",
    merindad: "Olite",
    comarca: "Zona Media",
    coords: [42.5256, -1.5622],
    description: "Villa de tradición vinícola con su joya románica de San Martín de Tours."
  },

  // ─── MERINDAD DE TUDELA / RIBERA ──────────────────────────────
  {
    id: "tudela",
    name: "Tudela",
    merindad: "Tudela",
    comarca: "Ribera de Navarra",
    coords: [42.0644, -1.6067],
    description: "Segunda ciudad de Navarra, capital de la huerta y crisol histórico de las tres culturas."
  },
  {
    id: "cascante",
    name: "Cascante",
    merindad: "Tudela",
    comarca: "Ribera de Navarra",
    coords: [41.9983, -1.6792],
    description: "Ciudad romana con su célebre basílica de la Virgen del Romero y arquillos."
  },
  {
    id: "corella",
    name: "Corella",
    merindad: "Tudela",
    comarca: "Ribera de Navarra",
    coords: [42.1136, -1.7878],
    description: "Ciudad del barroco navarro con ricos palacios y conventos."
  },
  {
    id: "cintruenigo",
    name: "Cintruénigo",
    merindad: "Tudela",
    comarca: "Ribera de Navarra",
    coords: [42.0792, -1.8058],
    description: "Villa del valle del Alhama con rica tradición alfarera y conservera."
  },
  {
    id: "fitero",
    name: "Fitero",
    merindad: "Tudela",
    comarca: "Ribera de Navarra",
    coords: [42.0572, -1.8569],
    description: "Cuna del primer monasterio cisterciense de la península y aguas termales."
  },

  // ─── MERINDAD DE PAMPLONA / CUENCA Y VALLES ───────────────────
  {
    id: "pamplona-iruna",
    name: "Pamplona-Iruña",
    altName: "Pamplona",
    merindad: "Pamplona",
    comarca: "Cuenca de Pamplona",
    coords: [42.8169, -1.6432],
    description: "Capital histórica del Reino de Navarra, amurallada y universal por San Fermín."
  },
  {
    id: "puente-la-reina",
    name: "Puente la Reina-Gares",
    altName: "Puente la Reina",
    merindad: "Pamplona",
    comarca: "Valdizarbe",
    coords: [42.6739, -1.8153],
    description: "Cruce de caminos jacobeos célebre por su puente románico de 6 arcos sobre el Arga."
  },
  {
    id: "elizondo-baztan",
    name: "Elizondo (Valle de Baztan)",
    altName: "Elizondo",
    merindad: "Pamplona",
    comarca: "Baztan-Bidasoa",
    coords: [43.1467, -1.5200],
    description: "Capital del verde valle de Baztan con sus palacetes señoriales de sillería."
  },
  {
    id: "bera",
    name: "Bera",
    altName: "Vera de Bidasoa",
    merindad: "Pamplona",
    comarca: "Cinco Villas",
    coords: [43.2817, -1.6850],
    description: "Villa señorial del Bidasoa vinculada a la familia Baroja."
  },

  // ─── MERINDAD DE SANGÜESA / PIRINEO ───────────────────────────
  {
    id: "sanguesa-zangoza",
    name: "Sangüesa-Zangoza",
    altName: "Sangüesa",
    merindad: "Sangüesa",
    comarca: "Comarca de Sangüesa",
    coords: [42.5769, -1.2828],
    description: "Ciudad monumental a orillas del Aragón con la joya románica de Santa María la Real."
  },
  {
    id: "ochagavia-otsagabia",
    name: "Ochagavía-Otsagabia",
    altName: "Ochagavía",
    merindad: "Sangüesa",
    comarca: "Pirineo Navarro",
    coords: [42.9056, -1.0911],
    description: "Pueblo pirenaico de postal a las puertas de la Selva de Irati."
  },
  {
    id: "roncal-erronkari",
    name: "Roncal-Erronkari",
    altName: "Roncal",
    merindad: "Sangüesa",
    comarca: "Valle de Roncal",
    coords: [42.8139, -0.9572],
    description: "Cuna del tenor Julián Gayarre entre casonas de piedra y tejados empinados."
  }
];

export function getTownById(id?: string): NavarraTown | undefined {
  if (!id) return undefined;
  const cleanId = id.toLowerCase().trim();
  return NAVARRA_TOWNS.find((t) => t.id === cleanId || t.name.toLowerCase() === cleanId || t.altName?.toLowerCase() === cleanId);
}
