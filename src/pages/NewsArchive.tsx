import React, { useEffect, useState, useMemo } from "react";
import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { News, ArchiveArticle, Photo } from "../types";
import { User } from "firebase/auth";
import { getArchiveArticles, getArchivePhotoById } from "../lib/dataService";
import { PhotoDetailModal } from "../components/PhotoDetailModal";
import {
  Newspaper,
  Plus,
  ExternalLink,
  Calendar,
  Trash2,
  Edit,
  Loader2,
  Search,
  Radio,
  BookOpen,
  FileText,
  Bookmark,
  Share2,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { useForm } from "react-hook-form";

interface NewsArchiveProps {
  user: User | null;
}

// Unified item type for display
interface UnifiedNewsItem {
  id: string;
  title: string;
  source: string;
  date: string;
  year?: number | null;
  url?: string;
  content?: string;
  summary?: string;
  section?: string;
  score?: number;
  photoId?: string;
  photoTitle?: string;
  photoThumbnail?: string;
  photoYear?: number | null;
  isFirestoreDoc?: boolean;
}

const SOURCE_TABS = [
  { id: "all", label: "Todas las fuentes", icon: Newspaper, color: "text-gray-700" },
  { id: "Radio Estella COPE", label: "Radio Estella COPE", icon: Radio, color: "text-emerald-700" },
  { id: "noticias", label: "Diario de Noticias", icon: Newspaper, color: "text-blue-700" },
  { id: "callemayor", label: "Calle Mayor", icon: BookOpen, color: "text-amber-800" },
  { id: "documentos", label: "Documentos", icon: FileText, color: "text-orange-700" },
  { id: "notebooklm", label: "NotebookLM", icon: Bookmark, color: "text-purple-700" },
];

const DECADE_FILTERS = [
  { id: "all", label: "Todos los años" },
  { id: "2020s", label: "2020-2026" },
  { id: "2010s", label: "2010-2019" },
  { id: "2000s", label: "2000-2009" },
  { id: "1990s", label: "1990-1999" },
  { id: "historic", label: "Siglo XX / Histórico" },
];

const ITEMS_PER_PAGE = 24;

export function NewsArchive({ user }: NewsArchiveProps) {
  const [articles, setArticles] = useState<UnifiedNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSource, setSelectedSource] = useState("all");
  const [selectedDecade, setSelectedDecade] = useState("all");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "relevance">("date_desc");
  const [currentPage, setCurrentPage] = useState(1);

  // Modal for viewing photos directly from articles
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);

  // Admin news editing modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNews, setEditingNews] = useState<News | null>(null);

  const isAdmin =
    user?.email === "mikeldiaz0@gmail.com" ||
    user?.email === "estellaescapecity@gmail.com";

  useEffect(() => {
    loadAllNews();
  }, []);

  async function loadAllNews() {
    setLoading(true);
    try {
      // 1. Cargar catálogo estático de artículos (1.725 artículos instantáneos, 0 lecturas Firestore)
      const staticArticles = await getArchiveArticles();
      const mappedStatic: UnifiedNewsItem[] = staticArticles.map((a) => ({
        id: a.id,
        title: a.titulo,
        source: a.fuente,
        date: a.fecha,
        year: a.year,
        url: a.url,
        summary: a.resumen,
        section: a.seccion,
        score: a.score,
        photoId: a.photoId,
        photoTitle: a.photoTitle,
        photoThumbnail: a.photoThumbnail,
        photoYear: a.photoYear,
        isFirestoreDoc: false,
      }));

      // 2. Intentar cargar noticias creadas manualmente en Firestore
      let mappedFirestore: UnifiedNewsItem[] = [];
      try {
        const q = query(collection(db, "news"), orderBy("date", "desc"));
        const snapshot = await getDocs(q);
        snapshot.forEach((docSnap) => {
          const d = docSnap.data() as News;
          mappedFirestore.push({
            id: docSnap.id,
            title: d.title,
            source: d.source || "Archivo",
            date: d.date,
            year: d.year,
            url: d.url,
            content: d.content,
            isFirestoreDoc: true,
          });
        });
      } catch (e) {
        // Fallback silencioso si Firestore está inactivo o sin colección
      }

      setArticles([...mappedFirestore, ...mappedStatic]);
    } catch (err) {
      console.error("Error al cargar artículos de la hemeroteca:", err);
    } finally {
      setLoading(false);
    }
  }

  // Filtrado reactivo de artículos
  const filteredArticles = useMemo(() => {
    return articles.filter((item) => {
      // Filtro por fuente
      if (selectedSource !== "all") {
        if (selectedSource === "noticias" && !item.source.toLowerCase().includes("noticias")) {
          return false;
        } else if (selectedSource === "callemayor" && !item.source.toLowerCase().includes("calle")) {
          return false;
        } else if (selectedSource === "documentos" && !item.source.toLowerCase().includes("documento")) {
          return false;
        } else if (selectedSource === "notebooklm" && !item.source.toLowerCase().includes("notebook")) {
          return false;
        } else if (selectedSource === "Radio Estella COPE" && !item.source.toLowerCase().includes("radio")) {
          return false;
        }
      }

      // Filtro por década / época
      if (selectedDecade !== "all") {
        const y = item.year || (item.date ? parseInt(item.date.slice(0, 4), 10) : null);
        if (selectedDecade === "2020s" && (!y || y < 2020 || y > 2029)) return false;
        if (selectedDecade === "2010s" && (!y || y < 2010 || y > 2019)) return false;
        if (selectedDecade === "2000s" && (!y || y < 2000 || y > 2009)) return false;
        if (selectedDecade === "1990s" && (!y || y < 1990 || y > 1999)) return false;
        if (selectedDecade === "historic" && (!y || y >= 1990)) return false;
      }

      // Búsqueda por texto libre
      if (searchTerm.trim()) {
        const queryNorm = searchTerm.toLowerCase().trim();
        const inTitle = item.title.toLowerCase().includes(queryNorm);
        const inSummary = item.summary ? item.summary.toLowerCase().includes(queryNorm) : false;
        const inContent = item.content ? item.content.toLowerCase().includes(queryNorm) : false;
        const inSection = item.section ? item.section.toLowerCase().includes(queryNorm) : false;
        const inPhotoTitle = item.photoTitle ? item.photoTitle.toLowerCase().includes(queryNorm) : false;
        if (!inTitle && !inSummary && !inContent && !inSection && !inPhotoTitle) {
          return false;
        }
      }

      return true;
    });
  }, [articles, selectedSource, selectedDecade, searchTerm]);

  // Ordenación
  const sortedArticles = useMemo(() => {
    return [...filteredArticles].sort((a, b) => {
      if (sortBy === "date_desc") {
        return (b.date || "").localeCompare(a.date || "");
      }
      if (sortBy === "date_asc") {
        return (a.date || "").localeCompare(b.date || "");
      }
      if (sortBy === "relevance") {
        return (b.score || 0) - (a.score || 0);
      }
      return 0;
    });
  }, [filteredArticles, sortBy]);

  // Reset a página 1 cuando cambian los filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedSource, selectedDecade, sortBy]);

  // Paginación
  const totalPages = Math.ceil(sortedArticles.length / ITEMS_PER_PAGE);
  const paginatedArticles = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedArticles.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedArticles, currentPage]);

  const handleOpenPhoto = async (photoId: string) => {
    setLoadingPhoto(true);
    try {
      const p = await getArchivePhotoById(photoId);
      if (p) {
        setSelectedPhoto(p);
      } else {
        alert("Fotografía no encontrada en el catálogo.");
      }
    } catch (e) {
      console.error("Error abriendo foto:", e);
    } finally {
      setLoadingPhoto(false);
    }
  };

  const handleShareWhatsApp = (item: UnifiedNewsItem) => {
    const text = `📰 *${item.title}*\nFuente: ${formatSourceName(item.source)} (${item.date || "Archivo"})\n${item.url || window.location.href}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("¿Seguro que deseas eliminar esta noticia?")) return;
    try {
      await deleteDoc(doc(db, "news", id));
      setArticles((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error(err);
      alert("Error eliminando noticia");
    }
  };

  const formatSourceName = (source: string) => {
    if (source.includes("Radio Estella")) return "Radio Estella COPE";
    if (source.toLowerCase().includes("noticias")) return "Diario de Noticias";
    if (source.toLowerCase().includes("callemayor") || source.toLowerCase().includes("calle")) return "Revista Calle Mayor";
    if (source.toLowerCase().includes("notebooklm")) return "NotebookLM Histórico";
    if (source.toLowerCase().includes("documentos")) return "Documentos y Archivo";
    return source;
  };

  const getSourceBadgeStyle = (source: string) => {
    const s = source.toLowerCase();
    if (s.includes("radio")) return "bg-emerald-50 text-emerald-800 border-emerald-200";
    if (s.includes("noticias")) return "bg-blue-50 text-blue-800 border-blue-200";
    if (s.includes("calle")) return "bg-amber-50 text-amber-800 border-amber-200";
    if (s.includes("notebook")) return "bg-purple-50 text-purple-800 border-purple-200";
    return "bg-orange-50 text-orange-800 border-orange-200";
  };

  return (
    <div className="max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#5A5A40]/10 text-[#5A5A40] rounded-full text-xs font-semibold uppercase tracking-wider mb-3">
            <Newspaper className="w-3.5 h-3.5" />
            Hemeroteca Histórica
          </div>
          <h1 className="text-4xl sm:text-5xl font-serif tracking-tight text-[#3A3A28]">
            Prensa y Crónicas de Estella
          </h1>
          <p className="text-[#5A5A40] mt-3 font-serif text-base sm:text-lg max-w-3xl leading-relaxed">
            Explora más de <strong>1.700 crónicas y artículos</strong> de <em>Radio Estella COPE</em>, <em>Diario de Noticias</em>, la <em>Revista Calle Mayor</em> y cuadernos históricos, vinculados directamente con las fotografías del archivo.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              onClick={() => {
                setEditingNews(null);
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 bg-[#5A5A40] text-white px-5 py-2.5 rounded-full hover:bg-[#4a4a30] transition-all shadow-sm text-sm font-medium"
            >
              <Plus className="w-4 h-4" /> Nueva Noticia
            </button>
          )}
        </div>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="bg-white rounded-2xl p-4 border border-[#e8e8e6] shadow-xs">
          <div className="text-2xl font-bold font-serif text-[#3A3A28]">{articles.length}</div>
          <div className="text-xs text-[#5A5A40] mt-0.5">Artículos catalogados</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-[#e8e8e6] shadow-xs">
          <div className="text-2xl font-bold font-serif text-emerald-700">748</div>
          <div className="text-xs text-[#5A5A40] mt-0.5">Crónicas Radio Estella</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-[#e8e8e6] shadow-xs">
          <div className="text-2xl font-bold font-serif text-blue-700">466</div>
          <div className="text-xs text-[#5A5A40] mt-0.5">Diario de Noticias</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-[#e8e8e6] shadow-xs">
          <div className="text-2xl font-bold font-serif text-amber-800">370</div>
          <div className="text-xs text-[#5A5A40] mt-0.5">Calle Mayor (desde 1992)</div>
        </div>
      </div>

      {/* Filter and Search Box */}
      <div className="bg-white p-5 sm:p-6 rounded-[28px] border border-[#e8e8e6] shadow-sm mb-8 space-y-5">
        {/* Search Bar + Sort */}
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A5A40] opacity-60" />
            <input
              type="text"
              placeholder="Buscar por protagonista, lugar, evento (ej: Olentzero, trenico, encierro, Virgen del Puy)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#EAE8E3]/50 border-none rounded-2xl py-3 px-5 pl-11 focus:ring-2 focus:ring-[#5A5A40] text-sm text-[#3A3A28] placeholder-[#5A5A40]/60 outline-none"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full w-5 h-5 flex items-center justify-center"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            <span className="text-xs text-[#5A5A40] font-medium hidden md:inline">Ordenar:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full sm:w-auto bg-[#EAE8E3]/50 border-none rounded-2xl py-3 px-4 text-xs font-medium text-[#3A3A28] focus:ring-2 focus:ring-[#5A5A40] outline-none"
            >
              <option value="date_desc">Más recientes primero</option>
              <option value="date_asc">Más antiguas primero</option>
              <option value="relevance">Mayor relevancia histórica</option>
            </select>
          </div>
        </div>

        {/* Source Filter Tabs */}
        <div>
          <div className="text-xs font-bold text-[#5A5A40] uppercase tracking-wider mb-2.5">
            Filtrar por Fuente:
          </div>
          <div className="flex flex-wrap gap-2">
            {SOURCE_TABS.map((tab) => {
              const Icon = tab.icon;
              const isSelected = selectedSource === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSelectedSource(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isSelected
                      ? "bg-[#5A5A40] text-white shadow-xs"
                      : "bg-[#EAE8E3]/60 text-gray-700 hover:bg-[#EAE8E3]"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 opacity-80" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Decade Filter Tabs */}
        <div>
          <div className="text-xs font-bold text-[#5A5A40] uppercase tracking-wider mb-2.5">
            Filtrar por Época:
          </div>
          <div className="flex flex-wrap gap-2">
            {DECADE_FILTERS.map((decade) => {
              const isSelected = selectedDecade === decade.id;
              return (
                <button
                  key={decade.id}
                  onClick={() => setSelectedDecade(decade.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    isSelected
                      ? "bg-[#3A3A28] text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {decade.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between mb-6 px-1">
        <p className="text-sm text-[#5A5A40] font-serif">
          Mostrando <strong>{sortedArticles.length}</strong> {sortedArticles.length === 1 ? "artículo" : "artículos"}
          {selectedSource !== "all" && ` en ${formatSourceName(selectedSource)}`}
          {selectedDecade !== "all" && ` (${selectedDecade})`}
        </p>
        {totalPages > 1 && (
          <p className="text-xs text-gray-500">
            Página {currentPage} de {totalPages}
          </p>
        )}
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-[#e8e8e6]">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#5A5A40] mb-3" />
          <p className="text-sm font-serif text-[#5A5A40]">Cargando hemeroteca de Estella-Lizarra...</p>
        </div>
      ) : paginatedArticles.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-[#e8e8e6] p-8">
          <Newspaper className="w-12 h-12 text-[#5A5A40]/40 mx-auto mb-4" />
          <h3 className="text-lg font-serif text-gray-800 font-semibold mb-1">
            No se han encontrado crónicas
          </h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-4">
            Prueba a cambiar los términos de búsqueda o a seleccionar otra fuente o década.
          </p>
          <button
            onClick={() => {
              setSearchTerm("");
              setSelectedSource("all");
              setSelectedDecade("all");
            }}
            className="px-4 py-2 bg-[#5A5A40] text-white text-xs rounded-full font-medium"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        /* Articles Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paginatedArticles.map((article) => {
            const hasPhoto = Boolean(article.photoThumbnail || article.photoId);

            return (
              <article
                key={article.id}
                className="bg-white rounded-3xl border border-[#e8e8e6] shadow-xs hover:shadow-md transition-all flex flex-col overflow-hidden group"
              >
                {/* Linked Photo Preview (if present) */}
                {hasPhoto && (
                  <div
                    onClick={() => article.photoId && handleOpenPhoto(article.photoId)}
                    className="relative h-44 bg-[#EAE8E3] overflow-hidden cursor-pointer group/img"
                  >
                    <img
                      src={article.photoThumbnail || ""}
                      alt={article.photoTitle || article.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20 opacity-80 group-hover/img:opacity-90 transition-opacity" />

                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white text-xs">
                      <span className="font-medium line-clamp-1 drop-shadow-xs flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 shrink-0 opacity-80" />
                        {article.photoTitle || "Foto histórica"}
                      </span>
                      {article.photoYear && (
                        <span className="bg-black/50 backdrop-blur-xs px-2 py-0.5 rounded-full text-[10px] shrink-0 ml-2">
                          {article.photoYear}
                        </span>
                      )}
                    </div>

                    <div className="absolute top-3 right-3 bg-white/90 hover:bg-white text-gray-900 rounded-full px-2.5 py-1 text-[11px] font-semibold opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center gap-1 shadow-sm">
                      Ver foto
                    </div>
                  </div>
                )}

                {/* Article Content */}
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    {/* Source and Date Header */}
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${getSourceBadgeStyle(
                          article.source
                        )}`}
                      >
                        {formatSourceName(article.source)}
                      </span>

                      {article.date && (
                        <span className="text-[11px] text-gray-400 font-mono flex items-center gap-1">
                          <Calendar className="w-3 h-3 opacity-60" />
                          {article.date}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h2 className="font-serif font-bold text-base sm:text-lg text-[#3A3A28] group-hover:text-[#5A5A40] transition-colors leading-snug line-clamp-3 mb-2.5">
                      {article.url ? (
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline flex items-start gap-1"
                        >
                          <span>{article.title}</span>
                        </a>
                      ) : (
                        article.title
                      )}
                    </h2>

                    {/* Section badge or brief summary */}
                    {article.section && (
                      <span className="inline-block text-[10px] uppercase font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded mb-3">
                        {article.section}
                      </span>
                    )}

                    {(article.summary || article.content) && (
                      <p className="text-gray-600 text-xs leading-relaxed line-clamp-3 mb-3 font-serif">
                        {article.summary || article.content}
                      </p>
                    )}
                  </div>


                  {/* Card Actions Footer */}
                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-xs mt-3">
                    <div className="flex items-center gap-2">
                      {article.photoId && (
                        <button
                          onClick={() => handleOpenPhoto(article.photoId!)}
                          className="text-[#5A5A40] hover:text-[#3A3A28] font-medium flex items-center gap-1 hover:underline"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          Foto vinculada
                        </button>
                      )}

                      {article.url && (
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 hover:underline"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Fuente original
                        </a>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleShareWhatsApp(article)}
                        title="Compartir en WhatsApp"
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-full transition-colors"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>

                      {isAdmin && article.isFirestoreDoc && (
                        <>
                          <button
                            onClick={() => {
                              setEditingNews({
                                id: article.id,
                                title: article.title,
                                date: article.date,
                                year: article.year || 0,
                                content: article.content || "",
                                source: article.source,
                                url: article.url,
                                createdAt: null,
                              });
                              setIsModalOpen(true);
                            }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 rounded-full"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(article.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded-full"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-12">
          <button
            onClick={() => {
              setCurrentPage((p) => Math.max(p - 1, 1));
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            disabled={currentPage === 1}
            className="p-2.5 rounded-full border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-1 text-sm font-medium">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum = i + 1;
              if (totalPages > 7) {
                if (currentPage > 4) {
                  pageNum = currentPage - 3 + i;
                  if (pageNum > totalPages) pageNum = totalPages - (6 - i);
                }
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => {
                    setCurrentPage(pageNum);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className={`w-9 h-9 rounded-full transition-colors ${
                    currentPage === pageNum
                      ? "bg-[#5A5A40] text-white font-bold"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => {
              setCurrentPage((p) => Math.min(p + 1, totalPages));
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            disabled={currentPage === totalPages}
            className="p-2.5 rounded-full border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Direct Photo Modal */}
      {selectedPhoto && (
        <PhotoDetailModal
          photo={selectedPhoto}
          user={user}
          onClose={() => setSelectedPhoto(null)}
        />
      )}

      {/* Admin New/Edit Modal */}
      {isModalOpen && (
        <NewsModal
          news={editingNews}
          onClose={() => setIsModalOpen(false)}
          onSaved={() => {
            setIsModalOpen(false);
            loadAllNews();
          }}
        />
      )}
    </div>
  );
}

interface NewsModalProps {
  news: News | null;
  onClose: () => void;
  onSaved: () => void;
}

function NewsModal({ news, onClose, onSaved }: NewsModalProps) {
  const { register, handleSubmit } = useForm<Partial<News>>({
    defaultValues: news || { source: "Diario de Navarra" },
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      const id = news?.id || crypto.randomUUID();
      const newsItem: News = {
        id,
        title: data.title,
        date: data.date,
        year: parseInt(data.date.split("-")[0], 10),
        content: data.content,
        source: data.source,
        url: data.url || undefined,
        createdAt: news?.createdAt || serverTimestamp(),
      };

      if (data.protagonists) {
        newsItem.protagonists = data.protagonists
          .split(",")
          .map((p: string) => p.trim())
          .filter(Boolean);
      }

      await setDoc(doc(db, "news", id), newsItem);
      onSaved();
    } catch (err) {
      console.error(err);
      alert("Error guardando la noticia");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-6">
          <h2 className="text-2xl font-serif text-gray-900 mb-6">
            {news ? "Editar Noticia" : "Nueva Noticia"}
          </h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Título
              </label>
              <input
                {...register("title", { required: true })}
                className="w-full px-4 py-2 border rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha (YYYY-MM-DD)
                </label>
                <input
                  {...register("date", {
                    required: true,
                    pattern: /^\d{4}-\d{2}-\d{2}$/,
                  })}
                  type="date"
                  className="w-full px-4 py-2 border rounded-xl"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fuente
                </label>
                <input
                  {...register("source", { required: true })}
                  className="w-full px-4 py-2 border rounded-xl"
                  placeholder="Ej: Radio Estella, Calle Mayor..."
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contenido / Transcripción
              </label>
              <textarea
                {...register("content", { required: true })}
                rows={5}
                className="w-full px-4 py-2 border rounded-xl"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL Enlace (Opcional)
              </label>
              <input
                {...register("url")}
                type="url"
                placeholder="https://"
                className="w-full px-4 py-2 border rounded-xl"
              />
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-gray-600 hover:text-gray-900 font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-[#5A5A40] text-white rounded-full font-medium hover:bg-[#4a4a30] disabled:opacity-50"
              >
                {isSubmitting ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
