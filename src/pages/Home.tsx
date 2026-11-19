import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Photo } from "../types";
import { User } from "firebase/auth";
import {
  Search as SearchIcon,
  X,
  AlertCircle,
  Sparkles,
  Loader2,
  Landmark,
  Heart,
  Tag,
  ChevronDown,
  ChevronUp,
  Users,
  Camera,
  MapPin,
  Building2,
  Check,
  Filter,
} from "lucide-react";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { PhotoDetailModal } from "../components/PhotoDetailModal";
import { FeaturedContent } from "../components/FeaturedContent";
import { EfemeridesCard } from "../components/EfemeridesCard";
import { Link } from "react-router-dom";
import { Newspaper, History, ArrowLeftRight } from "lucide-react";
import { doc, getDoc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { getArchivePhotos, getArchivePhotoById } from "../lib/dataService";
import { ARCHIVO_IA_URL } from "../services/cronistaService";
import { NAVARRA_TOWNS, NAVARRA_MERINDADES } from "../data/navarra-towns";

export function formatTag(tag: string): string {
  if (!tag) return "";
  const lower = tag.toLowerCase().trim();
  if (lower.startsWith("anos_") || lower.startsWith("ano_")) {
    const num = lower.replace(/^(anos_|ano_)/, "");
    return `Años ${num}`;
  }
  if (lower === "blanco_y_negro" || lower === "byn" || lower === "b_y_n") return "Blanco y negro";
  if (lower === "color_antiguo") return "Color antiguo";
  if (lower === "estella_lizarra" || lower === "estella-lizarra") return "Estella-Lizarra";
  const clean = tag.replace(/[_-]+/g, " ");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function Home({ user, userRole }: { user: User | null; userRole?: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayLimit, setDisplayLimit] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTown, setSelectedTown] = useState<string | null>(null);
  const [decadeFilter, setDecadeFilter] = useState<number | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showAllTags, setShowAllTags] = useState(false);
  const [filterWithPeople, setFilterWithPeople] = useState(false);
  const [filterWithPhotographer, setFilterWithPhotographer] = useState(false);
  const [filterWithLandmark, setFilterWithLandmark] = useState(false);

  const [isAiMode, setIsAiMode] = useState(false);
  const [isAiSearching, setIsAiSearching] = useState(false);
  const [aiResultIds, setAiResultIds] = useState<string[] | null>(null);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Initial load — 0 Firestore reads (loads from static Hostinger catalog)
  useEffect(() => {
    async function loadPhotos() {
      try {
        setLoading(true);
        const data = await getArchivePhotos();
        setPhotos(data);
        setTotalCount(data.length);
      } catch (err) {
        setError("Error al cargar fotos del archivo");
      } finally {
        setLoading(false);
      }
    }
    loadPhotos();
  }, []);

  // Display more photos as user scrolls (instant, in-memory)
  const loadMore = useCallback(() => {
    setDisplayLimit((prev) => prev + 60);
  }, []);

  // Robust callback ref for infinite scroll sentinel
  const sentinelCallback = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      if (!node) return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            loadMore();
          }
        },
        { rootMargin: "600px" }
      );
      observerRef.current.observe(node);
    },
    [loadMore]
  );

  // Load favorites from Firestore
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setFavorites(new Set(data.favorites || []));
      }
    }).catch(() => {});
  }, [user]);

  // Deep-link check: open photo if URL has ?photo=ID or #photo-ID
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let photoId = params.get("photo");
    if (!photoId && window.location.hash.startsWith("#photo-")) {
      photoId = window.location.hash.replace("#photo-", "");
    }
    if (!photoId) return;

    const idx = photos.findIndex((p) => p.id === photoId);
    if (idx !== -1) {
      setSelectedIndex(idx);
    } else {
      getArchivePhotoById(photoId).then((p) => {
        if (p) {
          setPhotos((prev) => (prev.some((x) => x.id === photoId) ? prev : [p, ...prev]));
          setSelectedIndex(0);
        }
      });
    }
  }, [photos]);

  const handleCloseModal = useCallback(() => {
    setSelectedIndex(null);
    const params = new URLSearchParams(window.location.search);
    if (params.has("photo")) {
      params.delete("photo");
      const newQuery = params.toString() ? `?${params.toString()}` : window.location.pathname;
      window.history.replaceState({}, "", newQuery);
    }
    if (window.location.hash.startsWith("#photo-")) {
      window.history.replaceState({}, "", window.location.pathname + window.location.search);
    }
  }, []);

  const toggleFavorite = useCallback(async (e: React.MouseEvent, photoId: string) => {
    e.stopPropagation();
    if (!user) { alert("Inicia sesión para guardar favoritos"); return; }
    const newFavs = new Set(favorites);
    if (newFavs.has(photoId)) newFavs.delete(photoId);
    else newFavs.add(photoId);
    setFavorites(newFavs);
    try {
      const uRef = doc(db, "users", user.uid);
      const uSnap = await getDoc(uRef);
      if (uSnap.exists()) {
        await updateDoc(uRef, { favorites: [...newFavs] });
      } else {
        await setDoc(uRef, { favorites: [...newFavs], email: user.email, createdAt: new Date() });
      }
    } catch (e) { console.error(e); }
  }, [user, favorites]);

  const handleAiSearch = async () => {
    if (!searchTerm.trim()) { setAiResultIds(null); return; }
    setIsAiSearching(true);
    setAiResultIds(null);
    try {
      // La IA (en el servidor) traduce la búsqueda a términos; el filtrado se hace aquí con el catálogo
      const resp = await fetch(ARCHIVO_IA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "buscarFotos", query: searchTerm }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      const terms = ((data.terms || []) as string[]).map(normalizeText);
      const scored = photos
        .map((p) => {
          const text = normalizeText(
            [p.title, p.description, p.location, p.owner, p.year, ...(p.tags || [])].filter(Boolean).join(" ")
          );
          return { id: p.id, hits: terms.filter((t) => text.includes(t)).length };
        })
        .filter((x) => x.hits > 0)
        .sort((a, b) => b.hits - a.hits);
      // Solo las que coinciden en bastantes términos comparadas con la mejor (si no, salía medio catálogo)
      const minHits = Math.max(1, Math.ceil((scored[0]?.hits ?? 0) / 3));
      setAiResultIds(scored.filter((x) => x.hits >= minHits).map((x) => x.id));
    } catch (err) {
      console.error("AI Search Error:", err);
      alert(err instanceof Error && err.message.includes("límite") ? err.message : "Error en la búsqueda inteligente. Inténtalo de nuevo.");
    } finally {
      setIsAiSearching(false);
    }
  };

  // All unique tags sorted by frequency
  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    photos.forEach((p) => (p.tags || []).forEach((t) => { counts[t] = (counts[t] || 0) + 1; }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [photos]);

  const topTags = showAllTags ? tagCounts : tagCounts.slice(0, 20);

  // Available decades - includes full range of historical Estella photos
  const decades = useMemo(() => {
    const ds = new Set<number>([1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980]);
    photos.forEach((p) => {
      if (p.year) ds.add(Math.floor(p.year / 10) * 10);
      (p.tags || []).forEach((t) => {
        const m = t.match(/anos?_(\d{2})/);
        if (m) {
          const y = parseInt(m[1], 10);
          ds.add(1900 + y);
        }
      });
    });
    return Array.from(ds).filter((d) => d >= 1880 && d <= 1990).sort();
  }, [photos]);

  const filteredPhotos = useMemo(() => {
    let base = photos;
    if (isAiMode && aiResultIds !== null) {
      // En el orden de la IA (de más a menos coincidencias), no en el del catálogo
      const byId = new Map(photos.map((p) => [p.id, p]));
      base = aiResultIds.map((id) => byId.get(id)).filter((p): p is Photo => !!p);
    }
    return base.filter((photo) => {
      if (searchTerm && !isAiMode) {
        const queryTerms = normalizeText(searchTerm).split(/\s+/).filter(Boolean);
        const searchableText = normalizeText(
          `${photo.title || ""} ${photo.description || ""} ${photo.town || ""} ${(photo.people || []).join(" ")} ${photo.owner || ""} ${photo.photographer || ""} ${photo.location || ""} ${photo.collection || ""} ${photo.archiveReference || ""} ${photo.year || ""} ${(photo.tags || []).join(" ")} ${(photo.relatedArticles || []).map((a) => a.titulo).join(" ")}`
        );
        const allTermsMatch = queryTerms.every((term) => {
          if (term === "50s" || term === "50") return searchableText.includes("1950") || searchableText.includes("anos 50");
          if (term === "60s" || term === "60") return searchableText.includes("1960") || searchableText.includes("anos 60");
          if (term === "70s" || term === "70") return searchableText.includes("1970") || searchableText.includes("anos 70");
          if (term === "40s" || term === "40") return searchableText.includes("1940") || searchableText.includes("anos 40");
          if (term === "30s" || term === "30") return searchableText.includes("1930") || searchableText.includes("anos 30");
          if (term === "20s" || term === "20") return searchableText.includes("1920") || searchableText.includes("anos 20");
          return searchableText.includes(term);
        });
        if (!allTermsMatch) return false;
      }
      if (selectedTown) {
        const pTown = (photo.townSlug || photo.town || "Estella-Lizarra").toLowerCase();
        if (!pTown.includes(selectedTown.toLowerCase()) && !(selectedTown === "estella-lizarra" && !photo.town)) {
          return false;
        }
      }
      if (filterWithPeople && (!photo.people || photo.people.length === 0)) {
        return false;
      }
      if (filterWithPhotographer && (!photo.photographer || photo.photographer.trim() === "")) {
        return false;
      }
      if (filterWithLandmark && !photo.landmarkId) {
        return false;
      }
      if (decadeFilter !== null) {
        const decShort = String(decadeFilter).slice(2);
        const tagMatch = (photo.tags || []).some((t) => t === `anos_${decShort}` || t === `ano_${decShort}`);
        const yearMatch = photo.year && Math.floor(photo.year / 10) * 10 === decadeFilter;
        if (!yearMatch && !tagMatch) return false;
      }
      if (activeTag) {
        if (!(photo.tags || []).includes(activeTag)) return false;
      }
      return true;
    });
  }, [photos, searchTerm, selectedTown, filterWithPeople, filterWithPhotographer, filterWithLandmark, decadeFilter, activeTag, isAiMode, aiResultIds]);

  // Contadores dinámicos para los filtros inteligentes
  const countWithPeople = useMemo(() => photos.filter((p) => p.people && p.people.length > 0).length, [photos]);
  const countWithLandmark = useMemo(() => photos.filter((p) => !!p.landmarkId).length, [photos]);
  const countWithPhotographer = useMemo(() => photos.filter((p) => p.photographer && p.photographer.trim() !== "").length, [photos]);

  // filteredPhotos is the gallery — all loaded photos after client-side filters
  const visiblePhotos = useMemo(() => filteredPhotos.slice(0, displayLimit), [filteredPhotos, displayLimit]);
  const hasMore = displayLimit < filteredPhotos.length;

  const selectedPhoto = selectedIndex !== null ? filteredPhotos[selectedIndex] ?? null : null;

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedTown(null);
    setFilterWithPeople(false);
    setFilterWithPhotographer(false);
    setFilterWithLandmark(false);
    setDecadeFilter(null);
    setActiveTag(null);
    setAiResultIds(null);
  };

  const hasFilters =
    searchTerm ||
    selectedTown !== null ||
    filterWithPeople ||
    filterWithPhotographer ||
    filterWithLandmark ||
    decadeFilter !== null ||
    activeTag !== null ||
    aiResultIds !== null;

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 p-6 rounded-xl flex items-start gap-3 mt-8">
        <AlertCircle className="w-6 h-6 shrink-0" />
        <div><h3 className="font-semibold text-lg">Error al cargar la galería</h3><p>{error}</p></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Search */}
      <div className="bg-white/90 backdrop-blur-xl rounded-[32px] shadow-sm border border-[#e8e8e6] p-6 sm:p-10 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-200 via-[#5A5A40] to-amber-200 opacity-30" />

        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-8 gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-100 text-[10px] font-bold uppercase tracking-wider text-amber-700">
              <Landmark className="w-3 h-3" /> Archivo Fotográfico Histórico de Navarra
            </div>
            <h2 className="text-4xl md:text-5xl font-serif text-[#3A3A28] leading-tight">
              Explorar el <span className="italic text-[#5A5A40]">Archivo Histórico</span>
            </h2>
            <p className="text-gray-500 max-w-xl">
              {totalCount !== null
                ? `${totalCount.toLocaleString()} fotografías históricas catalogadas`
                : photos.length > 0
                ? `${photos.length.toLocaleString()}+ fotografías históricas`
                : "Cargando archivo..."} · Estella-Lizarra y pueblos de Navarra. Busca por vecino, calle, año o fotógrafo.
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={() => { setIsAiMode(!isAiMode); setAiResultIds(null); }}
            className={cn(
              "flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold transition-all shadow-md",
              isAiMode
                ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white"
                : "bg-white text-[#5A5A40] border border-[#e8e8e6] hover:bg-gray-50"
            )}
          >
            <Sparkles className={cn("w-4 h-4", isAiMode && "animate-pulse")} />
            {isAiMode ? "Desactivar IA" : "Búsqueda con IA"}
          </motion.button>
        </div>

        {/* Selector de Pueblos de Navarra */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wider font-bold text-gray-500 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-700" /> Pueblo / Localidad:
            </span>
            {selectedTown && (
              <button
                onClick={() => setSelectedTown(null)}
                className="text-xs text-amber-800 hover:underline font-semibold cursor-pointer"
              >
                Ver toda Navarra
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
            <button
              onClick={() => setSelectedTown(null)}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer",
                selectedTown === null
                  ? "bg-[#3A3A28] text-white border-[#3A3A28] shadow-sm"
                  : "bg-white text-gray-600 border-[#e8e8e6] hover:border-gray-400"
              )}
            >
              <span>🏰 Toda Navarra</span>
              <span className="text-[10px] opacity-70">({photos.length})</span>
            </button>
            {NAVARRA_TOWNS.map((town) => {
              const count = photos.filter(
                (p) =>
                  p.townSlug === town.id ||
                  (p.town && p.town.toLowerCase().includes(town.name.toLowerCase())) ||
                  (town.id === "estella-lizarra" && !p.town)
              ).length;
              if (count === 0 && town.id !== "estella-lizarra" && town.id !== "olite-erriberri" && town.id !== "tafalla" && town.id !== "tudela" && town.id !== "pamplona-iruna") {
                return null;
              }
              const isSelected = selectedTown === town.id;
              return (
                <button
                  key={town.id}
                  onClick={() => setSelectedTown(isSelected ? null : town.id)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer",
                    isSelected
                      ? "bg-[#5A5A40] text-white border-[#5A5A40] shadow-sm"
                      : "bg-white text-gray-600 border-[#e8e8e6] hover:border-[#5A5A40]"
                  )}
                >
                  <span>{town.name}</span>
                  {count > 0 && <span className="text-[10px] opacity-75">({count})</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search bar */}
        <div className="flex gap-3 mb-4">
          <div className="flex-1 relative group">
            <SearchIcon className={cn("absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 transition-colors", isAiMode ? "text-purple-400" : "text-gray-400 group-focus-within:text-[#5A5A40]")} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && isAiMode) handleAiSearch(); }}
              className={cn(
                "block w-full pl-12 pr-10 py-3.5 border rounded-2xl bg-[#eae8e3]/30 sm:text-base transition-all focus:outline-none",
                isAiMode
                  ? "border-purple-200 focus:ring-2 focus:ring-purple-400/30 focus:border-purple-400 placeholder-purple-300"
                  : "border-transparent focus:bg-white focus:ring-2 focus:ring-[#5A5A40]/20 focus:border-[#5A5A40] placeholder-gray-400 shadow-inner"
              )}
              placeholder={isAiMode ? "Pregúntame algo (ej: fotos de la plaza en los años 50)..." : "Buscar por vecino, calle, comercio, plaza, fotógrafo o año..."}
            />
            {searchTerm && (
              <button onClick={() => { setSearchTerm(""); setAiResultIds(null); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {isAiMode && (
            <motion.button
              initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
              onClick={handleAiSearch}
              disabled={isAiSearching || !searchTerm.trim()}
              className="bg-[#6A4C93] hover:bg-[#583980] disabled:opacity-50 text-white px-6 py-3.5 rounded-2xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap shadow-lg cursor-pointer"
            >
              {isAiSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Sparkles className="w-4 h-4" /> Buscar</>}
            </motion.button>
          )}
        </div>

        {/* Filtros Inteligentes de Calidad */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <button
            onClick={() => setFilterWithPeople(!filterWithPeople)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer",
              filterWithPeople
                ? "bg-purple-100 text-purple-900 border-purple-300 shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:border-purple-300"
            )}
          >
            <Users className="w-3.5 h-3.5 text-purple-600" />
            <span>Vecinos identificados</span>
            <span className="bg-purple-200/60 text-purple-900 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
              {countWithPeople}
            </span>
          </button>

          <button
            onClick={() => setFilterWithLandmark(!filterWithLandmark)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer",
              filterWithLandmark
                ? "bg-amber-100 text-amber-900 border-amber-300 shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:border-amber-300"
            )}
          >
            <MapPin className="w-3.5 h-3.5 text-amber-700" />
            <span>Ubicadas en el mapa</span>
            <span className="bg-amber-200/60 text-amber-900 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
              {countWithLandmark}
            </span>
          </button>

          <button
            onClick={() => setFilterWithPhotographer(!filterWithPhotographer)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer",
              filterWithPhotographer
                ? "bg-blue-100 text-blue-900 border-blue-300 shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
            )}
          >
            <Camera className="w-3.5 h-3.5 text-blue-600" />
            <span>Con fotógrafo acreditado</span>
            <span className="bg-blue-200/60 text-blue-900 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
              {countWithPhotographer}
            </span>
          </button>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-red-600 hover:text-red-800 font-semibold flex items-center gap-1 ml-auto cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Limpiar filtros
            </button>
          )}
        </div>

        {/* Quick search chips */}
        {!searchTerm && (
          <div className="flex flex-wrap items-center gap-1.5 mb-5 text-xs text-gray-500">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 mr-1">Populares:</span>
            {[
              "Plaza de los Fueros",
              "Puente de la Cárcel",
              "San Pedro",
              "Gigantes",
              "Fiestas",
              "Tren Vasco-Navarro",
              "El Puy",
              "Plaza de Santiago",
              "Rúa",
            ].map((sug) => (
              <button
                key={sug}
                onClick={() => setSearchTerm(sug)}
                className="px-2.5 py-1 bg-[#eae8e3]/50 hover:bg-amber-100 text-gray-700 hover:text-amber-900 rounded-full transition-colors text-xs font-medium cursor-pointer"
              >
                {sug}
              </button>
            ))}
          </div>
        )}

        {/* Decade quick-filter */}
        {decades.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            <button
              onClick={() => setDecadeFilter(null)}
              className={cn("px-3 py-1.5 rounded-full text-xs font-bold border transition-all",
                decadeFilter === null ? "bg-[#5A5A40] text-white border-[#5A5A40]" : "bg-white text-gray-500 border-[#e8e8e6] hover:border-[#5A5A40]"
              )}
            >Todas las épocas</button>
            {decades.map((d) => (
              <button
                key={d}
                onClick={() => setDecadeFilter(decadeFilter === d ? null : d)}
                className={cn("px-3 py-1.5 rounded-full text-xs font-bold border transition-all",
                  decadeFilter === d ? "bg-[#5A5A40] text-white border-[#5A5A40]" : "bg-white text-gray-500 border-[#e8e8e6] hover:border-[#5A5A40]"
                )}
              >{d}s</button>
            ))}
          </div>
        )}

        {/* Tag cloud */}
        {tagCounts.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Etiquetas populares</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {topTags.map(([tag, count]) => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs transition-all border",
                    activeTag === tag
                      ? "bg-amber-500 text-white border-amber-500 font-bold"
                      : "bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100"
                  )}
                >
                  {formatTag(tag)}
                  <span className={cn("ml-1 text-[10px]", activeTag === tag ? "text-amber-100" : "text-amber-400")}>
                    {count}
                  </span>
                </button>
              ))}
              {tagCounts.length > 20 && (
                <button
                  onClick={() => setShowAllTags(!showAllTags)}
                  className="px-2.5 py-1 rounded-full text-xs text-gray-400 border border-dashed border-gray-300 hover:border-gray-400 flex items-center gap-1"
                >
                  {showAllTags ? <><ChevronUp className="w-3 h-3" /> Ver menos</> : <><ChevronDown className="w-3 h-3" /> +{tagCounts.length - 20} más</>}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Discovery Links: El Cronista AI, Mapa, Antes y Después, Efemérides & Hemeroteca */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6 pt-2">
          <Link
            to="/mapa"
            className="flex items-center gap-3.5 p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 hover:from-amber-100/80 hover:to-orange-100/70 border border-amber-200/60 rounded-2xl transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#5A5A40] text-amber-300 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#3A3A28] flex items-center gap-1.5">
                Mapa Histórico
                <span className="text-[10px] bg-amber-200/60 text-amber-900 px-1.5 py-0.2 rounded font-semibold">449 fotos</span>
              </div>
              <p className="text-[11px] text-[#5A5A40] font-serif line-clamp-1 mt-0.5">
                Explora rincones y calles de Estella sobre el plano
              </p>
            </div>
          </Link>

          <Link
            to="/antes-despues"
            className="flex items-center gap-3.5 p-3.5 bg-gradient-to-r from-teal-50 to-emerald-50 hover:from-teal-100/80 hover:to-emerald-100/70 border border-teal-200/60 rounded-2xl transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-teal-800 text-teal-200 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                Antes y Después
                <span className="text-[10px] bg-teal-100 text-teal-800 px-1.5 py-0.2 rounded font-semibold">Viaje</span>
              </div>
              <p className="text-[11px] text-gray-600 font-serif line-clamp-1 mt-0.5">
                Desliza para ver la evolución del siglo XX
              </p>
            </div>
          </Link>

          <Link
            to="/efemerides"
            className="flex items-center gap-3.5 p-3.5 bg-gradient-to-r from-purple-50 to-indigo-50 hover:from-purple-100/70 hover:to-indigo-100/70 border border-purple-200/60 rounded-2xl transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-900 text-purple-200 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                Tal Día Como Hoy
                <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded font-semibold">Efemérides</span>
              </div>
              <p className="text-[11px] text-gray-600 font-serif line-clamp-1 mt-0.5">
                Qué ocurrió en Estella en esta fecha
              </p>
            </div>
          </Link>

          <Link
            to="/cronista"
            className="flex items-center gap-3.5 p-3.5 bg-gradient-to-r from-amber-50 to-amber-100/50 hover:from-amber-100/80 hover:to-amber-200/50 border border-amber-200/60 rounded-2xl transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#5A5A40] text-amber-300 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#3A3A28] flex items-center gap-1.5">
                El Cronista IA
                <span className="text-[10px] bg-amber-200/60 text-amber-900 px-1.5 py-0.2 rounded font-semibold">Preguntar</span>
              </div>
              <p className="text-[11px] text-[#5A5A40] font-serif line-clamp-1 mt-0.5">
                Historiador inteligente conectado al archivo
              </p>
            </div>
          </Link>
        </div>

        {/* Results count + active filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-sm text-gray-500 pt-1 gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2">
              <span className={cn("font-bold text-base", isAiMode ? "text-purple-700" : "text-gray-900")}>
                {hasFilters
                  ? `${filteredPhotos.length.toLocaleString()} fotografías encontradas`
                  : totalCount !== null
                  ? `Mostrando ${filteredPhotos.length.toLocaleString()} de ${totalCount.toLocaleString()} fotografías`
                  : `${filteredPhotos.length.toLocaleString()} fotografías`}
              </span>
              {!hasFilters && hasMore && (
                <span className="text-xs text-gray-400 font-normal hidden sm:inline">
                  (desliza hacia abajo para ver más)
                </span>
              )}
            </span>
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 border border-red-200 bg-red-50/50 px-2.5 py-1 rounded-full hover:bg-red-50 transition-all font-medium">
                <X className="w-3 h-3" /> Limpiar filtros
              </button>
            )}
          </div>
          {activeTag && (
            <div className="flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full text-xs font-semibold">
              <Tag className="w-3 h-3" /> {formatTag(activeTag)}
            </div>
          )}
        </div>
      </div>

      {/* Efemérides: Tal día como hoy (visible en la portada principal) */}
      {!hasFilters && <EfemeridesCard />}

      <FeaturedContent />

      {/* Gallery */}
      {loading || isAiSearching ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6 animate-pulse">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-white rounded-3xl border border-[#e8e8e6] overflow-hidden shadow-sm">
              <div className="w-full aspect-[4/3] bg-gray-200" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredPhotos.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl shadow-sm border border-gray-200">
          {isAiMode ? <Sparkles className="w-12 h-12 text-purple-200 mx-auto mb-4" /> : <SearchIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />}
          <h3 className="text-lg font-medium text-gray-900 mb-1">No se encontraron fotografías</h3>
          <p className="text-gray-500 mb-4">Intenta con otros términos o elimina los filtros.</p>
          {hasFilters && (
            <button onClick={clearFilters} className="text-amber-600 hover:text-amber-800 font-medium border border-amber-200 px-4 py-2 rounded-full hover:bg-amber-50 transition-all">
              Limpiar todos los filtros
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
          {visiblePhotos.map((photo, idx) => (
            <div
              key={photo.id}
              onClick={() => setSelectedIndex(idx)}
              className="flex flex-col relative group bg-white rounded-3xl shadow-sm border border-[#e8e8e6] overflow-hidden hover:shadow-xl transition-all cursor-pointer hover:-translate-y-1"
            >
              <div className="w-full bg-[#EAE8E3] relative overflow-hidden aspect-[4/3] flex items-center justify-center">
                <img
                  src={photo.thumbnailUrl || photo.imageUrl}
                  alt={photo.title || photo.description || "Fotografía de Estella"}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading={idx < 4 ? "eager" : "lazy"}
                  decoding="async"
                  // @ts-ignore fetchPriority is standard in modern browsers
                  fetchPriority={idx < 4 ? "high" : "auto"}
                />
                {/* Overlay on hover */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all duration-300 pointer-events-none" />

                {/* Year badge */}
                {photo.year && (
                  <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white px-2.5 py-1 rounded-lg text-xs font-bold tracking-wider">
                    {photo.year}
                  </div>
                )}
                {photo.quality === "alta" && (
                  <div className="absolute top-3 left-3 bg-amber-500/90 text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                    HD
                  </div>
                )}

                {/* Favorite button */}
                <button
                  onClick={(e) => toggleFavorite(e, photo.id)}
                  className={cn(
                    "absolute bottom-3 right-3 p-2 rounded-full backdrop-blur-sm transition-all",
                    favorites.has(photo.id)
                      ? "bg-red-500 text-white shadow-lg"
                      : "bg-black/30 text-white/70 opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white"
                  )}
                  title={favorites.has(photo.id) ? "Quitar de favoritos" : "Guardar en favoritos"}
                >
                  <Heart className={cn("w-4 h-4", favorites.has(photo.id) && "fill-current")} />
                </button>
              </div>

              <div className="p-4 flex flex-col flex-1 justify-between">
                <div>
                  {/* Title or description */}
                  <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug mb-2">
                    {photo.title || photo.description || "Sin descripción"}
                  </p>

                  {/* Tags row */}
                  {photo.tags && photo.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {photo.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          onClick={(e) => { e.stopPropagation(); setActiveTag(tag); }}
                          className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-medium rounded-full border border-amber-100 hover:bg-amber-100 cursor-pointer transition-colors"
                        >
                          {formatTag(tag)}
                        </span>
                      ))}
                      {photo.tags.length > 3 && (
                        <span className="px-2 py-0.5 text-[10px] text-gray-400">+{photo.tags.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Owner */}
                <p className="text-xs text-gray-400 truncate mt-1">
                  {photo.owner || photo.facebookAuthor || ""}
                  {photo.priority === "alta" && (
                    <span className="ml-1 text-amber-500 font-bold">★</span>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sentinel & Load more button */}
      {hasMore && (
        <div ref={sentinelCallback} className="flex flex-col items-center justify-center py-10 gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-500 font-medium">
            <Loader2 className="w-4 h-4 animate-spin text-[#5A5A40]" />
            <span>Mostrando {visiblePhotos.length} de {filteredPhotos.length} fotografías</span>
          </div>
          <button
            onClick={loadMore}
            className="px-6 py-2.5 bg-white border border-[#e8e8e6] hover:bg-gray-50 hover:border-[#5A5A40] rounded-full text-xs font-bold text-gray-700 shadow-sm transition-all active:scale-95 cursor-pointer flex items-center gap-2"
          >
            Cargar más fotografías ({filteredPhotos.length - visiblePhotos.length} restantes)
          </button>
        </div>
      )}

      {!hasMore && filteredPhotos.length > 0 && (
        <div className="text-center py-12 text-sm text-gray-400 border-t border-gray-100 mt-8">
          <p className="font-serif italic text-base text-[#5A5A40] mb-1">Has llegado al final del archivo</p>
          <p className="text-xs">Mostrando las {filteredPhotos.length.toLocaleString()} fotografías históricas disponibles.</p>
        </div>
      )}

      {selectedPhoto && (
        <PhotoDetailModal
          photo={selectedPhoto}
          photos={filteredPhotos}
          currentIndex={selectedIndex!}
          onNavigate={(newIndex) => setSelectedIndex(newIndex)}
          user={user}
          userRole={userRole}
          onClose={handleCloseModal}
          isFavorite={favorites.has(selectedPhoto.id)}
          onToggleFavorite={(id) => toggleFavorite({ stopPropagation: () => {} } as any, id)}
        />
      )}
    </div>
  );
}
