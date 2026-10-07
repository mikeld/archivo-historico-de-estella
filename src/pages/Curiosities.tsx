import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Photo } from "../types";
import { User } from "firebase/auth";
import {
  Sparkles,
  Newspaper,
  Calendar,
  MapPin,
  Search,
  ExternalLink,
  Loader2,
  Landmark,
  PartyPopper,
  Users,
  ChevronRight,
  BookOpen,
  X,
} from "lucide-react";
import { cn } from "../lib/utils";
import { PhotoDetailModal } from "../components/PhotoDetailModal";
import { getArchivePhotos } from "../lib/dataService";

function WhatsAppIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-5.705 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
    </svg>
  );
}

const FUENTE_LABELS: Record<string, string> = {
  callemayor: "Calle Mayor",
  noticias: "Diario de Noticias",
  diario_navarra: "Diario de Navarra",
  diario_noticias: "Diario de Noticias",
  radioestella: "Radio Estella COPE",
  radio_estella: "Radio Estella COPE",
  notebooklm: "Documentación histórica",
  documentos: "Documentos históricos",
};
const getFuenteLabel = (f: string) => FUENTE_LABELS[f] || f;

type StoryCategory = "todas" | "prensa" | "fiestas" | "rincones" | "personajes";

interface CuriositiesProps {
  user: User | null;
}

export function Curiosities({ user }: CuriositiesProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayLimit, setDisplayLimit] = useState(36);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<StoryCategory>("todas");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);

  // Fetch from static archive with 0 Firestore reads
  useEffect(() => {
    async function fetchStories() {
      try {
        setLoading(true);
        const list = await getArchivePhotos();
        setPhotos(list);
      } catch (err) {
        setError("Error al cargar historias del archivo");
      } finally {
        setLoading(false);
      }
    }
    fetchStories();
  }, []);

  const loadMoreStories = useCallback(() => {
    setDisplayLimit((prev) => prev + 24);
  }, []);

  // Filter photos based on category and search query
  const filteredStories = useMemo(() => {
    return photos.filter((photo) => {
      // Must have some narrative text or related articles to be an interesting story
      const hasContent =
        (photo.description && photo.description.trim().length > 30) ||
        (photo.relatedArticles && photo.relatedArticles.length > 0) ||
        (photo.tags && photo.tags.length > 0);
      if (!hasContent) return false;

      // Category filter
      if (category === "prensa") {
        if (!photo.relatedArticles || photo.relatedArticles.length === 0) return false;
      } else if (category === "fiestas") {
        const text = `${photo.title || ""} ${photo.description || ""} ${(photo.tags || []).join(" ")}`.toLowerCase();
        const matches = ["fiesta", "gigante", "danz", "musica", "cofradia", "encierro", "feria", "penas"].some((k) =>
          text.includes(k)
        );
        if (!matches) return false;
      } else if (category === "rincones") {
        const text = `${photo.title || ""} ${photo.description || ""} ${photo.location || ""} ${(photo.tags || []).join(" ")}`.toLowerCase();
        const matches = ["plaza", "calle", "puente", "castillo", "san pedro", "puy", "rua", "mercado", "rio ega", "estacion"].some((k) =>
          text.includes(k)
        );
        if (!matches) return false;
      } else if (category === "personajes") {
        const text = `${photo.title || ""} ${photo.description || ""} ${(photo.tags || []).join(" ")}`.toLowerCase();
        const matches = ["retrato", "personas", "cuadrilla", "vecino", "comercio", "oficio", "familia", "ninos", "colegio"].some((k) =>
          text.includes(k)
        );
        if (!matches) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const text = `${photo.title || ""} ${photo.description || ""} ${photo.year || ""} ${(photo.tags || []).join(" ")} ${(photo.relatedArticles || []).map((a) => a.titulo).join(" ")}`.toLowerCase();
        if (!text.includes(q)) return false;
      }

      return true;
    });
  }, [photos, category, searchQuery]);

  const visibleStories = useMemo(
    () => filteredStories.slice(0, displayLimit),
    [filteredStories, displayLimit]
  );
  const hasMore = displayLimit < filteredStories.length;

  const handleShareStory = (e: React.MouseEvent, photo: Photo) => {
    e.stopPropagation();
    const url = `${window.location.origin}/?photo=${photo.id}`;
    const title = photo.title || photo.description?.slice(0, 80) || "Historia de Estella";
    const yearText = photo.year ? ` (${photo.year})` : "";
    const text = `📜 Historia de Estella: "${title}"${yearText}\nDescúbrela en el Archivo Histórico:\n${url}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Hero Header */}
      <div className="bg-white/90 backdrop-blur-xl rounded-[32px] shadow-sm border border-[#e8e8e6] p-8 sm:p-12 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-purple-400 via-amber-400 to-[#5A5A40] opacity-80" />

        <div className="max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 border border-purple-100 text-xs font-bold uppercase tracking-wider text-purple-700">
            <Sparkles className="w-3.5 h-3.5" /> Historias y Memoria Viva
          </div>
          <h1 className="text-4xl sm:text-5xl font-serif text-[#3A3A28] tracking-tight leading-tight">
            Curiosidades y <span className="italic text-[#6A4C93]">Anécdotas</span> de Estella
          </h1>
          <p className="text-gray-600 text-base sm:text-lg leading-relaxed">
            Descubre las crónicas de prensa, los personajes inolvidables, los sucesos y las anécdotas populares
            que se esconden detrás de las fotografías históricas de Estella-Lizarra.
          </p>
        </div>

        {/* Category tabs */}
        <div className="mt-8 pt-6 border-t border-[#e8e8e6] flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-2">
            {[
              { id: "todas", label: "Todas las historias", icon: BookOpen },
              { id: "prensa", label: "Prensa y Hemeroteca", icon: Newspaper },
              { id: "fiestas", label: "Fiestas y Tradiciones", icon: PartyPopper },
              { id: "rincones", label: "Rincones y Calles", icon: Landmark },
              { id: "personajes", label: "Personajes y Vida", icon: Users },
            ].map((cat) => {
              const Icon = cat.icon;
              const isActive = category === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat.id as StoryCategory)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold transition-all border",
                    isActive
                      ? "bg-[#3A3A28] text-white border-[#3A3A28] shadow-sm"
                      : "bg-white text-gray-600 border-[#e8e8e6] hover:bg-gray-50"
                  )}
                >
                  <Icon className={cn("w-4 h-4", isActive ? "text-amber-300" : "text-gray-400")} />
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Search bar inside curiosities */}
          <div className="w-full sm:w-72 relative mt-3 sm:mt-0">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar en historias..."
              className="w-full pl-9 pr-8 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400/40 focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 text-red-700 p-6 rounded-2xl border border-red-100">
          <p className="font-semibold">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-[#5A5A40]" />
          <p className="text-sm text-gray-500 font-medium">Recuperando anécdotas y crónicas del archivo…</p>
        </div>
      ) : filteredStories.length === 0 ? (
        <div className="text-center py-20 bg-white/70 backdrop-blur-sm rounded-3xl border border-[#e8e8e6] p-8">
          <Sparkles className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-800">No se encontraron historias</h3>
          <p className="text-gray-500 text-sm mt-1">Prueba con otra categoría o limpia el término de búsqueda.</p>
          {(category !== "todas" || searchQuery) && (
            <button
              onClick={() => { setCategory("todas"); setSearchQuery(""); }}
              className="mt-4 px-4 py-2 bg-amber-500 text-white rounded-full text-xs font-bold hover:bg-amber-600 transition-colors"
            >
              Ver todas las historias
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Stories Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {visibleStories.map((photo) => {
              const hasPress = photo.relatedArticles && photo.relatedArticles.length > 0;
              const mainArticle = hasPress ? photo.relatedArticles![0] : null;

              return (
                <div
                  key={photo.id}
                  onClick={() => setSelectedPhoto(photo)}
                  className="bg-white rounded-3xl overflow-hidden shadow-sm border border-[#e8e8e6] hover:shadow-xl transition-all duration-300 flex flex-col group cursor-pointer hover:-translate-y-1"
                >
                  {/* Photo Thumbnail Header */}
                  <div className="h-56 overflow-hidden bg-[#EAE8E3] relative shrink-0">
                    <img
                      src={photo.thumbnailUrl || photo.imageUrl}
                      alt={photo.title || "Foto histórica de Estella"}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                    {/* Top Badges */}
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                      {photo.year ? (
                        <span className="bg-black/60 backdrop-blur-md text-white text-xs font-bold px-2.5 py-1 rounded-lg">
                          {photo.year}
                        </span>
                      ) : (
                        <span className="bg-black/40 backdrop-blur-md text-white/90 text-xs px-2.5 py-1 rounded-lg">
                          Histórica
                        </span>
                      )}

                      {hasPress && (
                        <span className="bg-amber-500/90 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shadow-sm flex items-center gap-1">
                          <Newspaper className="w-3 h-3" /> Hemeroteca
                        </span>
                      )}
                    </div>

                    {/* Overlay Title at bottom of photo */}
                    <div className="absolute bottom-3 left-4 right-4">
                      <h2 className="text-white font-serif font-bold text-base line-clamp-1 group-hover:text-amber-200 transition-colors">
                        {photo.title || "Fotografía de Estella"}
                      </h2>
                      {photo.location && (
                        <p className="text-white/80 text-xs flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-amber-300 shrink-0" />
                          <span className="truncate">{photo.location}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    {/* Story / Anecdote Text */}
                    <div className="space-y-3">
                      {photo.description ? (
                        <p className="text-gray-700 text-sm leading-relaxed line-clamp-4">
                          {photo.description}
                        </p>
                      ) : (
                        <p className="text-gray-400 text-sm italic">
                          Ficha del archivo histórico de Estella-Lizarra. Haz clic para ver detalles y documentación.
                        </p>
                      )}

                      {/* Related Press / Documentation Highlight */}
                      {mainArticle && (
                        <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 space-y-1 mt-2">
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                            <Newspaper className="w-3.5 h-3.5 text-amber-600" />
                            <span>{getFuenteLabel(mainArticle.fuente)}</span>
                            {mainArticle.fecha && <span className="text-amber-600/70">· {mainArticle.fecha}</span>}
                          </div>
                          <p className="text-xs font-bold text-gray-900 line-clamp-2 leading-snug">
                            {mainArticle.titulo}
                          </p>
                          {mainArticle.resumen && (
                            <p className="text-[11px] text-gray-600 line-clamp-2 mt-0.5">
                              {mainArticle.resumen}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Card Actions Footer */}
                    <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#5A5A40] group-hover:text-amber-700 flex items-center gap-1 transition-colors">
                        Ver historia completa <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </span>

                      {/* WhatsApp Quick Share Button */}
                      <button
                        onClick={(e) => handleShareStory(e, photo)}
                        className="bg-[#25D366]/10 hover:bg-[#25D366] text-[#128C7E] hover:text-white p-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shrink-0"
                        title="Compartir historia por WhatsApp"
                      >
                        <WhatsAppIcon className="w-4 h-4" />
                        <span className="hidden sm:inline text-[11px]">Compartir</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Load More Button */}
          {hasMore && (
            <div className="text-center py-6">
              <button
                onClick={loadMoreStories}
                className="bg-white hover:bg-gray-50 border border-gray-300 text-gray-800 px-6 py-3 rounded-full text-sm font-bold shadow-sm hover:shadow transition-all inline-flex items-center gap-2 cursor-pointer active:scale-95"
              >
                Cargar más historias y curiosidades
              </button>
            </div>
          )}
        </>
      )}

      {/* Modal for viewing the selected story's photo and full dossier */}
      {selectedPhoto && (
        <PhotoDetailModal
          photo={selectedPhoto}
          photos={filteredStories}
          currentIndex={filteredStories.findIndex((p) => p.id === selectedPhoto.id)}
          onNavigate={(newIdx) => setSelectedPhoto(filteredStories[newIdx] || null)}
          user={user}
          onClose={() => setSelectedPhoto(null)}
        />
      )}

    </div>
  );
}

