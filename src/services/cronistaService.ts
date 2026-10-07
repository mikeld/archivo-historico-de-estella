import { getArchiveArticles, getArchivePhotos } from "../lib/dataService";
import { ArchiveArticle, Photo } from "../types";

// La IA vive en el servidor (función archivoIA de Estella Escape City): la clave no viaja a la web
export const ARCHIVO_IA_URL = "https://us-central1-estellaescape.cloudfunctions.net/archivoIA";

export interface CronistaResponse {
  answer: string;
  citedArticles: ArchiveArticle[];
  relevantPhotos: Photo[];
}

// Stopwords en español que no aportan discriminación semántica
const SPANISH_STOPWORDS = new Set([
  "el", "la", "de", "que", "en", "y", "a", "los", "del", "se", "las", "por", "un", "para", "con", "no", "una",
  "su", "al", "lo", "como", "mas", "más", "pero", "sus", "le", "ya", "o", "fue", "este", "ha", "si", "porque",
  "esta", "son", "entre", "cuando", "muy", "sin", "sobre", "ser", "tiene", "tambien", "también", "me", "hasta",
  "hay", "donde", "dónde", "quien", "quién", "desde", "todo", "nos", "durante", "todos", "uno", "les", "ni",
  "contra", "otros", "ese", "eso", "ante", "ellos", "e", "esto", "mi", "antes", "algunos", "unos", "yo", "otro",
  "otras", "otra", "tanto", "esa", "estos", "mucho", "quienes", "nada", "muchos", "cual", "cuál", "poco", "ella",
  "estar", "estas", "algunas", "algo", "nosotros", "cuentame", "cuéntame", "dime", "sabes", "sabrias", "sabrías",
  "fotos", "fotografias", "fotografías", "informacion", "información", "noticias", "archivo", "paso", "pasó", "ocurrio",
  "ocurrió", "habia", "había", "hizo", "hace", "anos", "años", "historia", "historias", "historico", "histórico", "historica", "histórica"
]);


// Palabras omnipresentes en el archivo de Estella que deben tener peso atenuado
const LOCAL_UBIQUITOUS_WORDS = new Set(["estella", "lizarra", "navarra", "merindad", "ciudad"]);

interface QueryTerm {
  word: string;
  weight: number;
}

/**
 * Normaliza y extrae términos con pesos semánticos calculados (TF-IDF heurístico)
 */
function extractWeightedTerms(query: string): QueryTerm[] {
  const clean = query
    .toLowerCase()
    .replace(/[^\w\sáéíóúüñ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);

  const terms: QueryTerm[] = [];
  const seen = new Set<string>();

  for (const word of clean) {
    if (seen.has(word) || SPANISH_STOPWORDS.has(word)) continue;
    seen.add(word);

    // Detección de año o número histórico (1090, 1427, 1950, etc.)
    if (/^\d{3,4}$/.test(word)) {
      terms.push({ word, weight: 10.0 });
      continue;
    }

    // Término omnipresente local (peso reducido para no sesgar hacia cualquier título con "Estella")
    if (LOCAL_UBIQUITOUS_WORDS.has(word)) {
      terms.push({ word, weight: 0.3 });
      continue;
    }

    // Términos largos o especializados
    if (word.length >= 6) {
      terms.push({ word, weight: 4.5 });
    } else if (word.length >= 4) {
      terms.push({ word, weight: 3.0 });
    } else {
      terms.push({ word, weight: 2.0 });
    }
  }

  return terms;
}

/**
 * Motor RAG híbrido: Búsqueda ponderada BM25-like sobre títulos, resúmenes y fotos
 */
function searchLocalContext(query: string, allArticles: ArchiveArticle[], allPhotos: Photo[]) {
  const queryTerms = extractWeightedTerms(query);
  const rawQueryLower = query.toLowerCase();

  // 1. Puntuación de artículos
  const scoredArticles = allArticles.map((art) => {
    let score = 0;
    let matchCount = 0;

    const title = (art.titulo || "").toLowerCase();
    const summary = (art.resumen || "").toLowerCase();
    const section = (art.seccion || "").toLowerCase();
    const photoTitle = (art.photoTitle || "").toLowerCase();

    // Bonus por coincidencia de frase exacta
    if (query.length > 5 && (title.includes(rawQueryLower) || summary.includes(rawQueryLower))) {
      score += 25;
    }

    for (const { word, weight } of queryTerms) {
      let termMatched = false;

      // Coincidencia en título (peso alto)
      if (title.includes(word)) {
        score += weight * 6.0;
        termMatched = true;
      }

      // Coincidencia en resumen enriquecido del Brain
      if (summary.includes(word)) {
        score += weight * 4.0;
        termMatched = true;
      }

      // Coincidencia en foto vinculada
      if (photoTitle.includes(word)) {
        score += weight * 3.0;
        termMatched = true;
      }

      // Coincidencia en sección
      if (section.includes(word)) {
        score += weight * 2.0;
        termMatched = true;
      }

      if (termMatched) {
        matchCount++;
      }
    }

    // Multiplicador por cobertura de términos: un artículo que contenga 3 palabras distintas
    // de la pregunta es exponencialmente más relevante que uno con 1 sola palabra repetida
    if (matchCount > 1) {
      score = score * (1 + (matchCount - 1) * 0.4);
    }

    return { art, score, matchCount };
  });

  const topArticles = scoredArticles
    .filter((s) => s.score > 2.0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((s) => s.art);

  // 2. Puntuación de fotografías históricas
  const scoredPhotos = allPhotos.map((photo) => {
    let score = 0;
    let matchCount = 0;

    const title = (photo.title || "").toLowerCase();
    const desc = (photo.description || "").toLowerCase();
    const loc = (photo.location || "").toLowerCase();
    const tags = (photo.tags || []).join(" ").toLowerCase();
    const owner = (photo.owner || "").toLowerCase();
    const yearStr = photo.year ? String(photo.year) : "";

    for (const { word, weight } of queryTerms) {
      let termMatched = false;

      if (title.includes(word)) {
        score += weight * 5.0;
        termMatched = true;
      }
      if (desc.includes(word)) {
        score += weight * 3.5;
        termMatched = true;
      }
      if (loc.includes(word)) {
        score += weight * 4.0;
        termMatched = true;
      }
      if (tags.includes(word)) {
        score += weight * 3.0;
        termMatched = true;
      }
      if (yearStr && yearStr === word) {
        score += weight * 8.0;
        termMatched = true;
      }
      if (owner.includes(word)) {
        score += weight * 2.0;
        termMatched = true;
      }

      if (termMatched) {
        matchCount++;
      }
    }

    // Bonus si la foto está asociada a alguno de los mejores artículos encontrados
    if (topArticles.some((a) => a.photoId === photo.id)) {
      score += 15;
      matchCount++;
    }

    if (matchCount > 1) {
      score = score * (1 + (matchCount - 1) * 0.35);
    }

    return { photo, score, matchCount };
  });

  // Con preguntas de varias palabras, al menos 2 coincidencias: si no, «Vasco-Navarro» traía fotos de
  // cualquier cosa con «Navarro»
  const minMatches = Math.min(2, queryTerms.filter((t) => t.weight > 1).length);
  const topPhotos = scoredPhotos
    .filter((s) => s.score > 2.0 && s.matchCount >= minMatches)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((s) => s.photo);

  return { topArticles, topPhotos, termsCount: queryTerms.length };
}

/**
 * Consulta al Cronista de Estella con el contexto local enriquecido del archivo y la hemeroteca.
 */
export async function askCronista(
  question: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<CronistaResponse> {
  const [allArticles, allPhotos] = await Promise.all([
    getArchiveArticles(),
    getArchivePhotos(),
  ]);

  const { topArticles, topPhotos } = searchLocalContext(question, allArticles, allPhotos);

  // El Cronista responde con el Brain v3 (Calle Mayor, Radio Estella, Diario de Noticias, Ayuntamiento,
  // Estella Digital, Príncipe de Viana) y las fotos del archivo que encajan con la pregunta
  try {
    const resp = await fetch(ARCHIVO_IA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accion: "cronista",
        question,
        history: history.slice(-4),
        photos: topPhotos.map((p) => ({ title: p.title || p.description || "", year: p.year ?? "", location: p.location || "" })),
      }),
    });
    const data = await resp.json();
    if (resp.status === 429) {
      return { answer: data.error, citedArticles: topArticles, relevantPhotos: topPhotos };
    }
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    const sources = (data.sources || []) as Array<{ n: number; titulo: string; fuente: string; fecha: string; url: string }>;
    return {
      answer: data.answer,
      citedArticles: sources.map((src) => ({
        id: `brain-${src.n}`,
        titulo: `[${src.n}] ${src.titulo}`,
        fuente: src.fuente,
        fecha: src.fecha,
        url: src.url,
        score: 0,
        photoId: "",
        photoTitle: "",
        photoThumbnail: "",
      })),
      relevantPhotos: topPhotos,
    };
  } catch (err: any) {
    console.warn("El Cronista no responde, usando síntesis local:", err);

    let fallbackAnswer = `Como Cronista de Estella-Lizarra, he consultado los fondos del archivo para tu consulta sobre **"${question}"**.\n\n`;
    if (topArticles.length > 0) {
      fallbackAnswer += `He localizado crónicas documentadas en nuestra hemeroteca:\n\n`;
      topArticles.slice(0, 4).forEach((a) => {
        fallbackAnswer += `* **${a.titulo}** (${a.fuente}, ${a.fecha || a.year || "s/f"}): ${a.resumen || ""}\n`;
      });
      fallbackAnswer += `\nA continuación puedes contemplar las fotografías y crónicas completas del archivo asociadas a este episodio de nuestra ciudad.`;
    } else {
      fallbackAnswer += `No hemos encontrado coincidencias textuales directas en las crónicas indexadas, pero puedes explorar nuestro archivo fotográfico con más de 1.200 imágenes de Estella-Lizarra.`;
    }

    return {
      answer: fallbackAnswer,
      citedArticles: topArticles,
      relevantPhotos: topPhotos,
    };
  }
}
