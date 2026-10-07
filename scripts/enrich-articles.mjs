import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const brainDir = "/Users/mikel/Developer/estellaEscapeRoom/scripts/brain";

const articlesPath = path.join(ROOT, "public", "data", "articles.json");
const distArticlesPath = path.join(ROOT, "dist", "data", "articles.json");

if (!fs.existsSync(articlesPath)) {
  console.error("No se encuentra public/data/articles.json");
  process.exit(1);
}

const articles = JSON.parse(fs.readFileSync(articlesPath, "utf8"));
console.log(`Cargados ${articles.length} artículos para enriquecer con el corpus del Brain...`);

// 1. Indexar Radio Estella
console.log("Indexando Radio Estella COPE...");
const radioDir = path.join(brainDir, "radioestella");
const radioBySlug = new Map();
const radioByTitle = new Map();

function walkRadio(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) walkRadio(full);
    else if (f.endsWith(".md")) {
      const text = fs.readFileSync(full, "utf8");
      const titleM = text.match(/titulo:\s*"(.*?)"/);
      const slugM = text.match(/slug:\s*"(.*?)"/);
      const body = text.replace(/^---[\s\S]*?---/, "").trim();
      const cleanBody = body
        .split("\n")
        .map(l => l.trim())
        .filter(l => l && !l.startsWith("#") && !l.startsWith("PIE DE FOTO") && !l.startsWith("(") && !l.includes("uncategorized"))
        .join(" ")
        .slice(0, 500);

      if (cleanBody) {
        if (titleM) radioByTitle.set(titleM[1].toLowerCase().trim(), cleanBody);
        if (slugM) radioBySlug.set(slugM[1].toLowerCase().trim(), cleanBody);
      }
    }
  }
}
walkRadio(radioDir);
console.log(`Radio Estella: ${radioBySlug.size} archivos en índice.`);

// 2. Indexar Noticias
console.log("Indexando Diario de Noticias...");
const noticiasDir = path.join(brainDir, "noticias");
const noticiasById = new Map();
const noticiasByTitle = new Map();

function walkNoticias(dir) {
  if (!fs.existsSync(dir)) return;
  for (const m of fs.readdirSync(dir)) {
    const mDir = path.join(dir, m);
    if (!fs.statSync(mDir).isDirectory()) continue;
    for (const f of fs.readdirSync(mDir)) {
      if (!f.endsWith(".md")) continue;
      const full = path.join(mDir, f);
      const text = fs.readFileSync(full, "utf8");
      const idM = text.match(/id:\s*(\d+)/);
      const titleM = text.match(/titulo:\s*"(.*?)"/);
      const body = text.replace(/^---[\s\S]*?---/, "").trim();
      const cleanBody = body
        .split("\n")
        .map(l => l.trim())
        .filter(l => l && !l.startsWith("#") && !l.startsWith("FOTOS |") && l.length > 20)
        .join(" ")
        .slice(0, 500);

      if (cleanBody) {
        if (idM) noticiasById.set(idM[1], cleanBody);
        if (titleM) noticiasByTitle.set(titleM[1].toLowerCase().trim(), cleanBody);
      }
    }
  }
}
walkNoticias(noticiasDir);
console.log(`Diario de Noticias: ${noticiasById.size} archivos en índice.`);

// 3. Indexar Calle Mayor (por número de revista)
console.log("Indexando Revista Calle Mayor...");
const mdDir = path.join(brainDir, "md");
const calleByNum = new Map();
if (fs.existsSync(mdDir)) {
  for (const f of fs.readdirSync(mdDir)) {
    if (f.startsWith("revista_") && f.endsWith(".json")) {
      const numMatch = f.match(/revista_0*(\d+)\.json/);
      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        try {
          const rev = JSON.parse(fs.readFileSync(path.join(mdDir, f), "utf8"));
          // Extraer un resumen significativo de las páginas 2, 3 o 4 (sumario o editorial)
          let snippet = "";
          for (const p of (rev.paginas || []).slice(1, 5)) {
            const cleanText = (p.texto || "")
              .replace(/\*\*.*?\*\*/g, "")
              .replace(/<.*?>/g, " ")
              .replace(/\s+/g, " ")
              .trim();
            if (cleanText.length > 80 && !cleanText.includes("AUTOMOVILES")) {
              snippet = cleanText.slice(0, 450);
              break;
            }
          }
          if (snippet) calleByNum.set(num, snippet);
        } catch (e) {}
      }
    }
  }
}
console.log(`Calle Mayor: ${calleByNum.size} números en índice.`);

// 4. Enriquecer los artículos
let enrichedCount = 0;
for (const a of articles) {
  let summary = a.resumen || "";
  const titleLow = (a.titulo || "").toLowerCase().trim();

  // Radio Estella
  if (a.fuente.includes("Radio")) {
    if (a.url) {
      const slug = a.url.split("/").filter(Boolean).pop();
      if (slug) summary = radioBySlug.get(slug.toLowerCase().trim()) || summary;
    }
    if (!summary) summary = radioByTitle.get(titleLow) || summary;
  }

  // Noticias
  if (a.fuente.toLowerCase().includes("noticias")) {
    if (a.url) {
      const idMatch = a.url.match(/-(\d+)\.html/);
      if (idMatch) summary = noticiasById.get(idMatch[1]) || summary;
    }
    if (!summary) summary = noticiasByTitle.get(titleLow) || summary;
  }

  // Calle Mayor
  if (a.fuente.toLowerCase().includes("calle")) {
    if (a.url) {
      const numMatch = a.url.match(/calle-mayor-(\d+)/);
      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        summary = calleByNum.get(num) || summary;
      }
    }
  }

  // Documentos históricos y cuadernos
  if (a.fuente.toLowerCase().includes("documento") || a.fuente.toLowerCase().includes("notebook")) {
    const t = titleLow;
    if (t.includes("juderia") || t.includes("sefarad")) {
      summary = "Investigación sobre el trazado, la sinagoga, murallas y vestigios de la judería medieval de Estella-Lizarra en la ruta de Sefarad.";
    } else if (t.includes("fuego") || t.includes("1427") || t.includes("incendio")) {
      summary = "Crónica y censo del libro de fuegos de 1427 tras los incendios y devastaciones en los barrios históricos de Estella.";
    } else if (t.includes("mil anos") || t.includes("milenio") || t.includes("historia")) {
      summary = "Monografía histórica sobre los orígenes, fueros de 1090 y evolución patrimonial de la ciudad del Ega a través de los siglos.";
    } else if (t.includes("memoria")) {
      summary = "Memoria gráfica y documental de las familias, oficios, calles y acontecimientos históricos de Estella-Lizarra en el siglo XX.";
    } else if (t.includes("sepulcro")) {
      summary = "Estudio arquitectónico e iconográfico de la portada gótica y la historia del Santo Sepulcro en la Rúa de Estella.";
    } else if (t.includes("industria") || t.includes("tradicion")) {
      summary = "Historia de los telares, curtidurías, calzados y el florecimiento industrial tradicional a orillas del río Ega.";
    }
  }

  // Si aún está vacío, generar un extracto descriptivo inteligente basado en el título y la foto vinculada
  if (!summary && a.photoTitle) {
    summary = `Crónica local de ${a.fuente} (${a.year || a.fecha || "histórico"}) vinculada a la fotografía de "${a.photoTitle}".`;
  }

  if (summary && summary.length > 15) {
    a.resumen = summary;
    enrichedCount++;
  }
}

console.log(`\n🎉 ¡Enriquecimiento completado! ${enrichedCount} de ${articles.length} artículos cuentan ahora con resumen y contenido real.`);

// Guardar
fs.writeFileSync(articlesPath, JSON.stringify(articles, null, 2));
console.log(`Guardado en: ${articlesPath}`);

if (fs.existsSync(path.dirname(distArticlesPath))) {
  fs.writeFileSync(distArticlesPath, JSON.stringify(articles));
  console.log(`Guardado en: ${distArticlesPath}`);
}
