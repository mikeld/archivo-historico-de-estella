import { GoogleGenAI } from "@google/genai";
import { getArchiveArticles, getArchivePhotos } from "../lib/dataService";
import { ArchiveArticle, Photo } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

  const topPhotos = scoredPhotos
    .filter((s) => s.score > 2.0)
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

  let { topArticles, topPhotos } = searchLocalContext(question, allArticles, allPhotos);

  // Si no hay API key o hay fallo de red, devolvemos respuesta basada en el corpus local
  if (!process.env.GEMINI_API_KEY) {
    let answer = `He consultado el Archivo Histórico de Estella-Lizarra para tu búsqueda sobre **"${question}"**.\n\n`;
    if (topArticles.length > 0) {
      answer += `He localizado **${topArticles.length} crónicas documentadas** en nuestra hemeroteca (Calle Mayor, Radio Estella y Diario de Noticias):\n\n`;
      topArticles.slice(0, 5).forEach((a) => {
        answer += `* **${a.titulo}** (${a.fuente}, ${a.fecha || a.year || "s/f"}): ${a.resumen || ""}\n`;
      });
      answer += `\nA continuación tienes las fotografías históricas vinculadas que puedes ver en detalle o descargar.`;
    } else {
      answer += `No he encontrado registros exactos para esos términos específicos, pero puedes explorar nuestro catálogo con más de 1.200 fotografías históricas.`;
    }
    return {
      answer,
      citedArticles: topArticles,
      relevantPhotos: topPhotos,
    };
  }

  // Preparar el contexto estructurado de crónicas reales (con resúmenes auténticos)
  const articlesContextText = topArticles
    .map((a, i) => {
      const year = a.year || (a.fecha ? a.fecha.slice(0, 4) : "S.F.");
      return `[Crónica ${i + 1}]
- Título: "${a.titulo}"
- Fuente: ${a.fuente} (${year})
- Sección: ${a.seccion || "General"}
- Contenido y Resumen: "${a.resumen || "Información histórica local vinculada al archivo gráfico."}"
- Foto vinculada: "${a.photoTitle}" (ID: ${a.photoId})`;
    })
    .join("\n\n");

  // Preparar el contexto de fotografías
  const photosContextText = topPhotos
    .map((p, i) => {
      return `[Foto ${i + 1}] ID: ${p.id} | Título: "${p.title || p.description}" | Año: ${p.year || "S.F."} | Lugar: ${p.location || "Estella"} | Colección/Autor: ${p.owner || p.photographer || "Archivo"}`;
    })
    .join("\n");

  const systemInstruction = `Eres "El Cronista de Estella-Lizarra", el sabio y apasionado historiador del Archivo Histórico y la Hemeroteca de Estella-Lizarra (Navarra).
Tienes acceso a una hemeroteca de 1.725 crónicas históricas con resúmenes documentales de la revista Calle Mayor (desde 1992), Radio Estella COPE, el Diario de Noticias de Navarra y libros de historia local, además de 1.216 fotografías catalogadas.

Tu tono debe ser culto pero cercano, ameno, riguroso y elocuente, como un cronista que adora las historias, personajes, fiestas, gremios y rincones de Estella-Lizarra.

Instrucciones:
1. Responde en español con explicaciones DETALLADAS, COMPLETAS Y RICAS en datos verídicos (no seas telegráfico).
2. Aprovecha al máximo la información de las [Crónicas] aportadas en el contexto: cita los hechos, fechas, personas, declaraciones y anécdotas que aparezcan en ellas.
3. Menciona la procedencia de los datos (por ejemplo: "Tal como recogió la revista Calle Mayor...", o "Según las crónicas radiofónicas de Radio Estella COPE de aquel año...").
4. Si el contexto aportado no es suficiente para algún aspecto, complementa con conocimiento verídico y riguroso sobre la historia de Estella-Lizarra (patrimonio medieval, camino de santiago, fuero de 1090, el trenico vasco-navarro, las inundaciones del Ega, el Santo Sepulcro, la Virgen del Puy, las Guerras Carlistas, etc.).
5. Estructura la respuesta con formato Markdown claro: títulos con negrita, citas o listas para una lectura agradable.`;

  const conversationHistory = history
    .slice(-4)
    .map((m) => `${m.role === "user" ? "Ciudadano" : "Cronista"}: ${m.content}`)
    .join("\n\n");

  const prompt = `${conversationHistory ? `Conversación previa:\n${conversationHistory}\n\n` : ""}Pregunta del ciudadano: "${question}"

═══════════════════════════════════════════════════════════════════
DOCUMENTACIÓN Y CRÓNICAS RECUPERADAS DE LA HEMEROTECA DE ESTELLA:
═══════════════════════════════════════════════════════════════════
${articlesContextText || "No se han encontrado crónicas textuales exactas en la búsqueda preliminar; utiliza tu amplio bagaje sobre la historia y patrimonio de Estella-Lizarra."}

═══════════════════════════════════════════════════════════════════
FOTOGRAFÍAS HISTÓRICAS DEL ARCHIVO VINCULADAS:
═══════════════════════════════════════════════════════════════════
${photosContextText || "No hay fotos vinculadas específicas para esta pregunta."}

Por favor, como Cronista de Estella-Lizarra, ofrece tu crónica completa y amena respondiendo a la pregunta:`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.65,
      },
    });

    const answer = response.text || "No se ha podido generar la crónica en este momento.";
    return {
      answer,
      citedArticles: topArticles,
      relevantPhotos: topPhotos,
    };
  } catch (err: any) {
    console.warn("Fallo llamando a Gemini, usando síntesis local:", err);

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
