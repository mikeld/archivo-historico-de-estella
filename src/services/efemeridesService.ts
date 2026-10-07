import { getArchiveArticles, getArchivePhotos } from "../lib/dataService";
import { ArchiveArticle, Photo } from "../types";

export const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export interface EfemerideHighlight {
  year?: number | string;
  headline: string;
  detail: string;
  source?: string;
  url?: string;
  articleId?: string;
}

export interface Efemeride {
  id: string; // "09-24"
  day: string; // "09-24"
  dayNumber: number;
  monthNumber: number;
  dateLabel: string; // "24 de septiembre"
  title: string;
  narrative: string;
  highlights: EfemerideHighlight[];
  articleIds: string[];
  photoIds: string[];
  sourceCount: number;
  createdAt: number;
  isAiGenerated: boolean;
}

/**
 * Busca artículos en la hemeroteca para un día y mes específicos
 */
export function findArticlesForDay(
  articles: ArchiveArticle[],
  month: number,
  day: number
): { exactMatches: ArchiveArticle[]; nearbyMatches: ArchiveArticle[] } {
  const monthPad = String(month).padStart(2, "0");
  const dayPad = String(day).padStart(2, "0");
  const pattern = `-${monthPad}-${dayPad}`;
  const monthName = MONTH_NAMES[month - 1];
  const textualPattern = `${day} de ${monthName}`;
  const slashPattern = `${dayPad}/${monthPad}`;

  const exactMatches: ArchiveArticle[] = [];
  const nearbyMatches: ArchiveArticle[] = [];

  for (const art of articles) {
    const f = (art.fecha || "").toLowerCase();
    const t = (art.titulo || "").toLowerCase();
    const r = (art.resumen || "").toLowerCase();

    const isExact =
      f.includes(pattern) ||
      f.includes(textualPattern) ||
      f.includes(slashPattern) ||
      t.includes(textualPattern) ||
      r.includes(textualPattern);

    if (isExact) {
      exactMatches.push(art);
    } else if (f.includes(`-${monthPad}-`)) {
      // Coincidencia dentro del mismo mes
      nearbyMatches.push(art);
    }
  }

  return { exactMatches, nearbyMatches };
}

/**
 * Genera una efeméride de respaldo local sin IA en caso de fallo de red
 */
function createLocalFallbackEfemeride(
  dayId: string,
  dayNumber: number,
  monthNumber: number,
  dateLabel: string,
  exactArticles: ArchiveArticle[],
  photos: Photo[]
): Efemeride {
  const highlights: EfemerideHighlight[] = exactArticles.slice(0, 5).map((a) => ({
    year: a.year || (a.fecha ? a.fecha.slice(0, 4) : "Archivo"),
    headline: a.titulo,
    detail: a.resumen || `Crónica documentada en ${a.fuente}.`,
    source: a.fuente,
    url: a.url,
    articleId: a.id,
  }));

  const narrative =
    exactArticles.length > 0
      ? `En esta fecha señalada (${dateLabel}), el Archivo Histórico de Estella-Lizarra conserva el testimonio vivo de ${exactArticles.length} crónicas documentadas en Radio Estella, Calle Mayor y la prensa navarra, reflejando el pulso social, cultural y deportivo de nuestra ciudad.`
      : `El ${dateLabel} es una jornada viva en la memoria colectiva de Estella-Lizarra, encrucijada del Camino de Santiago y ciudad del Ega con siglos de patrimonio, comercio e historias humanas.`;

  return {
    id: dayId,
    day: dayId,
    dayNumber,
    monthNumber,
    dateLabel,
    title:
      exactArticles.length > 0
        ? `Tal día como hoy en Estella: ${exactArticles[0].titulo.slice(0, 80)}`
        : `Tal día como hoy en Estella-Lizarra (${dateLabel})`,
    narrative,
    highlights,
    articleIds: exactArticles.map((a) => a.id),
    photoIds: photos.slice(0, 3).map((p) => p.id),
    sourceCount: exactArticles.length,
    createdAt: Date.now(),
    isAiGenerated: false,
  };
}

// Efemérides del Brain de Estella Escape City (búsqueda en toda la hemeroteca: Calle Mayor, Radio Estella,
// Diario de Noticias, Ayuntamiento, Estella Digital, Príncipe de Viana). La función solo devuelve titular,
// una frase y el enlace a la fuente original; se genera una vez al año por día y se cachea en su Firestore.
const EFEMERIDES_URL = "https://us-central1-estellaescape.cloudfunctions.net/efemeridesDia";

/**
 * Obtiene la efeméride para un día concreto (1-31) y mes (1-12).
 * Nivel 1: localStorage (por año: cada año la efeméride suma un año más de noticias)
 * Nivel 2: función efemeridesDia del Brain
 * Nivel 3: respaldo local sin IA con la hemeroteca del Archivo
 */
export async function getEfemerideForDate(
  day: number,
  month: number,
  forceRefresh = false
): Promise<Efemeride> {
  const dayPad = String(day).padStart(2, "0");
  const monthPad = String(month).padStart(2, "0");
  const dayId = `${monthPad}-${dayPad}`;
  const dateLabel = `${day} de ${MONTH_NAMES[month - 1]}`;
  const cacheKey = `estella_efemeride_${dayId}_v3_${new Date().getFullYear()}`;

  // 1. Comprobar en caché local (instantáneo, 0ms)
  if (!forceRefresh) {
    try {
      const localData = localStorage.getItem(cacheKey);
      if (localData) {
        const parsed = JSON.parse(localData) as Efemeride;
        if (parsed && parsed.title && parsed.narrative) {
          return parsed;
        }
      }
    } catch (e) {
      // Ignorar errores de localStorage
    }
  }

  // Fotos y crónicas del propio Archivo para ese día
  const [allArticles, allPhotos] = await Promise.all([
    getArchiveArticles(),
    getArchivePhotos(),
  ]);

  const { exactMatches } = findArticlesForDay(allArticles, month, day);

  // Escoger fotos vinculadas o de la época
  const matchingPhotos = allPhotos.filter((p) => {
    if (exactMatches.some((e) => e.photoId === p.id)) return true;
    const desc = (p.description || "").toLowerCase();
    const tit = (p.title || "").toLowerCase();
    return desc.includes(MONTH_NAMES[month - 1]) || tit.includes(MONTH_NAMES[month - 1]);
  });

  // 2. Efeméride del Brain
  try {
    const resp = await fetch(`${EFEMERIDES_URL}?dia=${dayId}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as {
      title: string;
      narrative: string;
      highlights: EfemerideHighlight[];
      sourceCount: number;
      createdAt: number;
    };
    if (!data.title || !data.narrative || !data.highlights?.length) throw new Error("Sin hitos para este día");

    const efemeride: Efemeride = {
      id: dayId,
      day: dayId,
      dayNumber: day,
      monthNumber: month,
      dateLabel,
      title: data.title,
      narrative: data.narrative,
      highlights: data.highlights,
      articleIds: exactMatches.map((a) => a.id),
      photoIds: matchingPhotos.slice(0, 4).map((p) => p.id),
      sourceCount: data.sourceCount,
      createdAt: data.createdAt,
      isAiGenerated: true,
    };
    try {
      localStorage.setItem(cacheKey, JSON.stringify(efemeride));
    } catch {
      // Ignorar límite de almacenamiento local
    }
    return efemeride;
  } catch (err) {
    console.warn("No se pudo obtener la efeméride del Brain, usando respaldo local:", err);
    return createLocalFallbackEfemeride(dayId, day, month, dateLabel, exactMatches, matchingPhotos);
  }
}
