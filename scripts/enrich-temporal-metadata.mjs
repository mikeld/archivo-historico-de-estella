import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PHOTOS_PATH = path.join(ROOT, "public/data/photos.json");
const DIST_PHOTOS_PATH = path.join(ROOT, "dist/data/photos.json");
const RAW_POSTS_PATH = path.join(ROOT, "facebook-import/raw-posts.json");

const photos = JSON.parse(fs.readFileSync(PHOTOS_PATH, "utf8"));
let raw = [];
if (fs.existsSync(RAW_POSTS_PATH)) {
  raw = JSON.parse(fs.readFileSync(RAW_POSTS_PATH, "utf8"));
}

const rawMap = new Map();
raw.forEach((r) => {
  if (r.id) {
    rawMap.set(String(r.id), r);
    const num = String(r.id).replace(/\D+/g, "");
    if (num) rawMap.set(num, r);
  }
});

const DECADE_CONFIG = [
  { regex: /\b(?:años?\s+)?10\b|\b191\d\b|\baños\s+diez\b/i, tag: "anos_10", decade: 1910 },
  { regex: /\baños?\s+20\b|\b192\d\b|\baños\s+veinte\b/i, tag: "anos_20", decade: 1920 },
  { regex: /\baños?\s+30\b|\b193\d\b|\baños\s+treinta\b/i, tag: "anos_30", decade: 1930 },
  { regex: /\baños?\s+40\b|\b194\d\b|\baños\s+cuarenta\b/i, tag: "anos_40", decade: 1940 },
  { regex: /\baños?\s+50\b|\b195\d\b|\baños\s+cincuenta\b/i, tag: "anos_50", decade: 1950 },
  { regex: /\baños?\s+60\b|\b196\d\b|\baños\s+sesenta\b/i, tag: "anos_60", decade: 1960 },
  { regex: /\baños?\s+70\b|\b197\d\b|\baños\s+setenta\b/i, tag: "anos_70", decade: 1970 },
  { regex: /\baños?\s+80\b|\b198\d\b|\baños\s+ochenta\b/i, tag: "anos_80", decade: 1980 },
  { regex: /\baños?\s+90\b|\b199\d\b|\baños\s+noventa\b/i, tag: "anos_90", decade: 1990 },
];

let yearsAdded = 0;
let tagsAdded = 0;

for (const photo of photos) {
  const cleanId = photo.id.replace(/^fb_/, "").replace(/_\d+$/, "");
  const numId = cleanId.replace(/\D+/g, "");
  const r = rawMap.get(cleanId) || rawMap.get(numId);

  const combined = [
    photo.title || "",
    photo.description || "",
    (r && r.postText) || "",
    photo.aiAnalysis || "",
  ].join(" ");

  photo.tags = photo.tags || [];

  // 1. Extraer año exacto si falta
  if (!photo.year) {
    // Buscar años explícitos entre 1850 y 2015
    const match = combined.match(/\b(18[6-9]\d|19\d\d|200\d|201[0-5])\b/);
    if (match) {
      const parsedYear = parseInt(match[1], 10);
      photo.year = parsedYear;
      yearsAdded++;
    } else {
      // Expresiones tipo "año 75", "en el 68", "fiestas del 78"
      const shortMatch = combined.match(/\b(?:año|verano|fiestas|nevada|inundaci[oó]n|curso)\s+(?:del?\s+)?([2-9]\d)\b/i);
      if (shortMatch) {
        const val = parseInt(shortMatch[1], 10);
        photo.year = val > 26 ? 1900 + val : 2000 + val;
        yearsAdded++;
      }
    }
  }

  // 2. Si tiene año exacto, asegurar que tiene la etiqueta de década
  if (photo.year && typeof photo.year === "number") {
    const decadeNum = Math.floor(photo.year / 10) * 10;
    const decadeTag = `anos_${String(decadeNum).slice(-2)}`;
    if (!photo.tags.includes(decadeTag)) {
      photo.tags.push(decadeTag);
      tagsAdded++;
    }
  }

  // 3. Si no tiene año pero el texto menciona décadas
  for (const cfg of DECADE_CONFIG) {
    if (cfg.regex.test(combined)) {
      if (!photo.tags.includes(cfg.tag)) {
        photo.tags.push(cfg.tag);
        tagsAdded++;
      }
    }
  }

  // 4. Actualizar searchTerms
  if (photo.year) {
    photo.searchTerms = photo.searchTerms || [];
    const yearStr = String(photo.year);
    if (!photo.searchTerms.includes(yearStr)) photo.searchTerms.push(yearStr);
  }
}

console.log("Enriquecimiento temporal completado:");
console.log(`- Nuevos años asignados: ${yearsAdded}`);
console.log(`- Nuevas etiquetas de época asignadas: ${tagsAdded}`);

fs.writeFileSync(PHOTOS_PATH, JSON.stringify(photos, null, 2), "utf8");
console.log(`Guardado en: ${PHOTOS_PATH}`);

if (fs.existsSync(DIST_PHOTOS_PATH)) {
  fs.writeFileSync(DIST_PHOTOS_PATH, JSON.stringify(photos, null, 2), "utf8");
  console.log(`Sincronizado en: ${DIST_PHOTOS_PATH}`);
}
