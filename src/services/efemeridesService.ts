import { GoogleGenAI } from "@google/genai";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
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

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

/**
 * Obtiene o genera la efeméride para un día concreto (1-31) y mes (1-12).
 * Nivel 1: localStorage
 * Nivel 2: Firebase Firestore (colección "efemerides")
 * Nivel 3: Hemeroteca + Gemini Flash AI (guarda en Firestore y localStorage)
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
  const cacheKey = `estella_efemeride_${dayId}_v2`;

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

  // 2. Comprobar en Firestore (si ya lo generó otro usuario hoy o anteriormente)
  if (!forceRefresh) {
    try {
      const docRef = doc(db, "efemerides", dayId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as Efemeride;
        if (data && data.title && data.narrative) {
          try {
            localStorage.setItem(cacheKey, JSON.stringify(data));
          } catch {
            // Ignorar quota storage
          }
          return data;
        }
      }
    } catch (err) {
      console.warn("No se pudo consultar Firestore para efeméride (se generará nueva):", err);
    }
  }

  // 3. No existe en BBDD: Recopilar artículos de la hemeroteca para este día
  const [allArticles, allPhotos] = await Promise.all([
    getArchiveArticles(),
    getArchivePhotos(),
  ]);

  const { exactMatches, nearbyMatches } = findArticlesForDay(allArticles, month, day);

  // Escoger fotos vinculadas o de la época
  const matchingPhotos = allPhotos.filter((p) => {
    if (exactMatches.some((e) => e.photoId === p.id)) return true;
    const desc = (p.description || "").toLowerCase();
    const tit = (p.title || "").toLowerCase();
    return desc.includes(MONTH_NAMES[month - 1]) || tit.includes(MONTH_NAMES[month - 1]);
  });

  // Si no tenemos API key o la llamada falla, usar fallback local
  if (!process.env.GEMINI_API_KEY) {
    return createLocalFallbackEfemeride(dayId, day, month, dateLabel, exactMatches, matchingPhotos);
  }

  // Preparar el contexto de la Hemeroteca para Gemini Flash
  const articlesContext = exactMatches.length > 0
    ? exactMatches
        .slice(0, 8)
        .map(
          (a, i) =>
            `[Noticia ${i + 1}]
- Título: ${a.titulo}
- Fecha: ${a.fecha} (${a.year || "año no esp."})
- Fuente: ${a.fuente}
- Resumen: ${a.resumen || a.titulo}`
        )
        .join("\n\n")
    : nearbyMatches.length > 0
    ? nearbyMatches
        .slice(0, 4)
        .map(
          (a, i) =>
            `[Noticia del mes ${i + 1}]
- Título: ${a.titulo}
- Fecha: ${a.fecha}
- Fuente: ${a.fuente}
- Resumen: ${a.resumen || a.titulo}`
        )
        .join("\n\n")
    : "No hay noticias archivadas con esta fecha exacta en el catálogo contemporáneo.";

  const prompt = `Eres El Cronista Histórico de Estella-Lizarra (Navarra).
Tu misión es redactar la efeméride del día: **${dateLabel}** para la ciudadanía y visitantes de la web del Archivo Histórico.

NOTICIAS Y FONDOS DISPONIBLES DE LA HEMEROTECA (Calle Mayor, Radio Estella, Diario de Noticias):
${articlesContext}

INSTRUCCIONES:
1. Redacta en español un titular cautivador (máximo 120 caracteres) en "title".
2. Redacta un texto narrativo de estilo cronista (2 párrafos elocuentes, emotivos y rigurosos) en "narrative", que explique qué ocurría en Estella-Lizarra en esta fecha.
3. Extrae entre 2 y 4 hitos destacados en "highlights" (cada uno con "year" numérico o texto, "headline" breve y "detail" descriptivo).
4. Si las noticias aportadas son contemporáneas (años 90, 2000 o 2020), intégralas con naturalidad. Si faltan datos para completar, añade hitos reales del patrimonio o historia de Estella-Lizarra propios de esta época del año (como ferias, estaciones, costumbres carlistas o jacobeas).
5. DEVUELVE EXCLUSIVAMENTE UN OBJETO JSON VÁLIDO con la siguiente estructura:
{
  "title": "Titular de la efeméride",
  "narrative": "Texto ameno y enriquecedor del cronista...",
  "highlights": [
    { "year": "1996", "headline": "...", "detail": "..." }
  ]
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction:
          "Eres El Cronista de Estella-Lizarra, apasionado de la historia local, las tradiciones de la merindad y la memoria colectiva. Responde siempre con JSON puro sin explicaciones fuera del bloque.",
        temperature: 0.6,
      },
    });

    const rawText = response.text || "";
    // Limpiar posibles bloques ```json ```
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let parsedAi: { title: string; narrative: string; highlights: EfemerideHighlight[] };
    try {
      parsedAi = JSON.parse(cleaned);
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        parsedAi = JSON.parse(match[0]);
      } else {
        throw new Error("No valid JSON in Gemini response");
      }
    }

    // Asociar enlaces de artículos a los highlights si coinciden
    const enrichedHighlights = (parsedAi.highlights || []).map((h) => {
      const matchArt = exactMatches.find(
        (a) =>
          (h.year && String(a.year) === String(h.year)) ||
          h.headline.toLowerCase().includes(a.titulo.slice(0, 20).toLowerCase())
      );
      return {
        ...h,
        source: matchArt ? matchArt.fuente : "Hemeroteca de Estella",
        url: matchArt ? matchArt.url : undefined,
        articleId: matchArt ? matchArt.id : undefined,
      };
    });

    const newEfemeride: Efemeride = {
      id: dayId,
      day: dayId,
      dayNumber: day,
      monthNumber: month,
      dateLabel,
      title: parsedAi.title || `Tal día como hoy en Estella-Lizarra (${dateLabel})`,
      narrative: parsedAi.narrative,
      highlights: enrichedHighlights,
      articleIds: exactMatches.map((a) => a.id),
      photoIds: matchingPhotos.slice(0, 4).map((p) => p.id),
      sourceCount: exactMatches.length,
      createdAt: Date.now(),
      isAiGenerated: true,
    };

    // Guardar en Firestore para que NUNCA MÁS se vuelva a gastar llamada en este día
    try {
      const docRef = doc(db, "efemerides", dayId);
      await setDoc(docRef, {
        ...newEfemeride,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (saveErr) {
      console.warn("No se pudo guardar la efeméride en Firestore (se guarda en local):", saveErr);
    }

    // Guardar en localStorage
    try {
      localStorage.setItem(cacheKey, JSON.stringify(newEfemeride));
    } catch {
      // Ignorar límite de almacenamiento local
    }

    return newEfemeride;
  } catch (aiErr) {
    console.warn("Fallo en Gemini Flash al generar efeméride, usando fallback local:", aiErr);
    return createLocalFallbackEfemeride(dayId, day, month, dateLabel, exactMatches, matchingPhotos);
  }
}
