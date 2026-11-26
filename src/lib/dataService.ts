import { Photo, ArchiveArticle } from "../types";
import { collection, getDocs, query, orderBy, limit, getDoc, doc } from "firebase/firestore";
import { db } from "./firebase";

let cachedPhotos: Photo[] | null = null;
let fetchPromise: Promise<Photo[]> | null = null;

let cachedArticles: ArchiveArticle[] | null = null;
let articlesPromise: Promise<ArchiveArticle[]> | null = null;

/**
 * Obtiene el catálogo completo de fotos.
 * Prioridad 1: Archivo local estático /data/photos.json (0 lecturas Firestore, instantáneo, ilimitado).
 * Prioridad 2: Fallback a Firestore si el archivo JSON no estuviera accesible.
 */
export async function getArchivePhotos(): Promise<Photo[]> {
  if (cachedPhotos && cachedPhotos.length > 0) {
    return cachedPhotos;
  }

  if (fetchPromise) {
    return fetchPromise;
  }

  fetchPromise = (async () => {
    try {
      // 1. Cargar catálogo estático sin caché antigua del navegador
      const res = await fetch(`/data/photos.json?v=${Date.now()}`, { cache: "no-cache" });
      if (res.ok) {
        const data = (await res.json()) as Photo[];
        if (Array.isArray(data) && data.length > 0) {
          cachedPhotos = data;
          return data;
        }
      }
    } catch (e) {
      console.warn("No se pudo cargar /data/photos.json, usando fallback Firestore:", e);
    }

    // 2. Fallback a Firestore si no existe el JSON estático
    try {
      const q = query(collection(db, "photos"), orderBy("createdAt", "desc"), limit(1500));
      const snap = await getDocs(q);
      const list: Photo[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Photo));
      cachedPhotos = list;
      return list;
    } catch (err) {
      console.error("Error al cargar fotos desde Firestore fallback:", err);
      return [];
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

/**
 * Obtiene una foto por su ID (para enlaces directos o compartidos por WhatsApp).
 */
export async function getArchivePhotoById(id: string): Promise<Photo | null> {
  const all = await getArchivePhotos();
  const found = all.find((p) => p.id === id);
  if (found) return found;

  // Fallback si no está en el catálogo estático
  try {
    const snap = await getDoc(doc(db, "photos", id));
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as Photo;
    }
  } catch (e) {
    console.error(`Error buscando foto ${id}:`, e);
  }
  return null;
}

/**
  * Obtiene el catálogo completo de artículos históricos de prensa (1.725 registros).
  * Prioridad 1: /data/articles.json estático (0 lecturas Firestore, instantáneo).
  */
export async function getArchiveArticles(): Promise<ArchiveArticle[]> {
  if (cachedArticles && cachedArticles.length > 0) {
    return cachedArticles;
  }

  if (articlesPromise) {
    return articlesPromise;
  }

  articlesPromise = (async () => {
    try {
      const res = await fetch("/data/articles.json", { cache: "default" });
      if (res.ok) {
        const data = (await res.json()) as ArchiveArticle[];
        if (Array.isArray(data) && data.length > 0) {
          cachedArticles = data;
          return data;
        }
      }
    } catch (e) {
      console.warn("No se pudo cargar /data/articles.json:", e);
    } finally {
      articlesPromise = null;
    }
    return [];
  })();

  return articlesPromise;
}

