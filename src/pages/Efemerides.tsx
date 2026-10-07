import React, { useEffect, useState, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { User } from "firebase/auth";
import {
  Calendar,
  Sparkles,
  History,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Share2,
  ExternalLink,
  BookOpen,
  Image as ImageIcon,
  Check,
  Search,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  Efemeride,
  getEfemerideForDate,
  MONTH_NAMES,
  findArticlesForDay,
} from "../services/efemeridesService";
import { getArchiveArticles, getArchivePhotos } from "../lib/dataService";
import { ArchiveArticle, Photo } from "../types";
import { PhotoDetailModal } from "../components/PhotoDetailModal";

export function Efemerides({ user }: { user: User | null }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const today = new Date();

  const paramDay = searchParams.get("d") ? Number(searchParams.get("d")) : today.getDate();
  const paramMonth = searchParams.get("m") ? Number(searchParams.get("m")) : today.getMonth() + 1;

  const [day, setDay] = useState<number>(paramDay);
  const [month, setMonth] = useState<number>(paramMonth);
  const [efemeride, setEfemeride] = useState<Efemeride | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Artículos y fotos completas del día
  const [dayArticles, setDayArticles] = useState<ArchiveArticle[]>([]);
  const [dayPhotos, setDayPhotos] = useState<Photo[]>([]);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);

  // Sincronizar parámetros de URL
  useEffect(() => {
    setSearchParams({ d: String(day), m: String(month) }, { replace: true });
  }, [day, month, setSearchParams]);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      try {
        const [efem, allArticles, allPhotos] = await Promise.all([
          getEfemerideForDate(day, month),
          getArchiveArticles(),
          getArchivePhotos(),
        ]);

        if (!isMounted) return;

        setEfemeride(efem);

        const { exactMatches } = findArticlesForDay(allArticles, month, day);
        setDayArticles(exactMatches);

        // Buscar fotos vinculadas a las noticias o coincidentes
        const relevantPhotos = allPhotos.filter((p) => {
          if (exactMatches.some((e) => e.photoId === p.id)) return true;
          const desc = (p.description || "").toLowerCase();
          const tit = (p.title || "").toLowerCase();
          return desc.includes(MONTH_NAMES[month - 1]) || tit.includes(MONTH_NAMES[month - 1]);
        });
        setDayPhotos(relevantPhotos.slice(0, 12));
      } catch (err) {
        console.error("Error al cargar efemérides:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [day, month]);

  const handlePrevDay = () => {
    if (day > 1) {
      setDay((d) => d - 1);
    } else {
      const prevMonth = month === 1 ? 12 : month - 1;
      const daysInPrev = new Date(2024, prevMonth, 0).getDate();
      setMonth(prevMonth);
      setDay(daysInPrev);
    }
  };

  const handleNextDay = () => {
    const daysInCurrentMonth = new Date(2024, month, 0).getDate();
    if (day < daysInCurrentMonth) {
      setDay((d) => d + 1);
    } else {
      const nextMonth = month === 12 ? 1 : month + 1;
      setMonth(nextMonth);
      setDay(1);
    }
  };

  const handleShare = () => {
    const text = `🏛️ Tal día como hoy en Estella-Lizarra (${day} de ${MONTH_NAMES[month - 1]}):\n"${efemeride?.title}"\n${window.location.href}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const isToday = day === today.getDate() && month === today.getMonth() + 1;

  return (
    <div className="max-w-5xl mx-auto py-4 sm:py-8 px-2 sm:px-4">
      {/* Botón Volver */}
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-[#5A5A40] hover:text-[#3A3A28] font-semibold mb-6 transition-colors"
      >
        <ArrowLeft size={16} /> Volver al Archivo Fotográfico
      </Link>

      {/* Cabecera y Navegación de Fecha */}
      <div className="bg-white rounded-[32px] border border-[#e5e4de] p-6 sm:p-8 shadow-xs mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#5A5A40] text-white flex items-center justify-center shrink-0 shadow-sm">
              <History className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#5A5A40]">
                  Efemérides Históricas
                </span>
                {isToday && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                    HOY
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-4xl font-serif font-bold text-[#3A3A28]">
                Tal día como hoy · {day} de {MONTH_NAMES[month - 1]}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Crónicas, sucesos y fotografías de la historia viva de Estella-Lizarra.
              </p>
            </div>
          </div>

          {/* Selector interactivo de día y mes */}
          <div className="flex flex-wrap items-center gap-2 bg-[#f6f5f0] p-2 rounded-2xl border border-gray-200/80">
            <button
              onClick={handlePrevDay}
              className="p-2.5 rounded-xl bg-white hover:bg-gray-100 text-gray-700 shadow-xs transition-colors"
              title="Día anterior"
            >
              <ChevronLeft size={18} />
            </button>

            <select
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
              aria-label="Seleccionar día"
              className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-800 shadow-xs focus:ring-2 focus:ring-[#5A5A40]"
            >
              {Array.from(
                { length: new Date(2024, month, 0).getDate() },
                (_, i) => i + 1
              ).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              aria-label="Seleccionar mes"
              className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-800 shadow-xs focus:ring-2 focus:ring-[#5A5A40]"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name.charAt(0).toUpperCase() + name.slice(1)}
                </option>
              ))}
            </select>

            <button
              onClick={handleNextDay}
              className="p-2.5 rounded-xl bg-white hover:bg-gray-100 text-gray-700 shadow-xs transition-colors"
              title="Día siguiente"
            >
              <ChevronRight size={18} />
            </button>

            <button
              onClick={handleShare}
              className="p-2.5 rounded-xl bg-[#5A5A40] text-white hover:bg-[#4a4a30] transition-colors ml-1 shadow-xs"
              title="Compartir enlace de esta fecha"
            >
              {copied ? <Check size={18} className="text-emerald-300" /> : <Share2 size={18} />}
            </button>
          </div>
        </div>
      </div>

      {/* Relato central de la efeméride */}
      {loading ? (
        <div className="bg-white rounded-[32px] border border-[#e5e4de] p-12 text-center shadow-xs">
          <div className="w-10 h-10 border-3 border-[#5A5A40] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="font-serif italic text-base text-[#5A5A40]">
            Rescatando las crónicas del {day} de {MONTH_NAMES[month - 1]} en el Archivo...
          </p>
        </div>
      ) : efemeride ? (
        <div className="space-y-8">
          <div className="bg-white rounded-[32px] border border-[#e5e4de] p-6 sm:p-10 shadow-xs">
            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#2a2a1d] mb-6 leading-tight">
              {efemeride.title}
            </h2>

            <div className="text-gray-700 font-serif text-lg leading-relaxed space-y-4 mb-8 border-l-4 border-[#5A5A40]/40 pl-6 py-2 bg-[#f9f8f5]/80 rounded-r-2xl">
              {efemeride.narrative}
            </div>

            {/* Hitos Destacados */}
            {efemeride.highlights && efemeride.highlights.length > 0 && (
              <div className="mt-8">
                <div className="flex items-center gap-2 mb-4 text-xs font-bold uppercase tracking-wider text-[#5A5A40]">
                  <Sparkles size={16} className="text-amber-700" />
                  <span>Acontecimientos documentados</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {efemeride.highlights.map((h, i) => (
                    <div
                      key={i}
                      className="p-5 rounded-2xl bg-[#fafaf8] border border-gray-200/80 flex flex-col justify-between hover:border-[#5A5A40]/40 transition-all shadow-2xs"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#5A5A40] text-white">
                            {h.year || "Crónica"}
                          </span>
                          {h.source && (
                            <span className="text-xs text-gray-500 font-medium">
                              {h.source}
                            </span>
                          )}
                        </div>
                        <h4 className="font-bold text-gray-900 text-base mb-2">
                          {h.headline}
                        </h4>
                        <p className="text-sm text-gray-600 leading-relaxed">
                          {h.detail}
                        </p>
                      </div>

                      {h.url && (
                        <a
                          href={h.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#5A5A40] hover:text-[#2a2a1d]"
                        >
                          <span>Ver documento original</span>
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Noticiero y crónicas completas del día */}
          {dayArticles.length > 0 && (
            <div className="bg-white rounded-[32px] border border-[#e5e4de] p-6 sm:p-8 shadow-xs">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2.5">
                  <BookOpen className="w-5 h-5 text-[#5A5A40]" />
                  <h3 className="font-serif text-xl font-bold text-[#3A3A28]">
                    Hemeroteca del {day} de {MONTH_NAMES[month - 1]} ({dayArticles.length})
                  </h3>
                </div>
                <Link
                  to="/news"
                  className="text-xs font-bold text-[#5A5A40] hover:underline"
                >
                  Ver toda la hemeroteca &rarr;
                </Link>
              </div>

              <div className="divide-y divide-gray-100">
                {dayArticles.map((art) => (
                  <div key={art.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-bold text-[#5A5A40] px-2 py-0.5 rounded-full bg-gray-100">
                        {art.fuente}
                      </span>
                      <span className="text-xs text-gray-600 font-medium">{art.fecha}</span>
                    </div>
                    <h4 className="font-serif font-bold text-base text-gray-900 mb-1.5">
                      {art.titulo}
                    </h4>
                    <p className="text-sm text-gray-600 leading-relaxed line-clamp-3 mb-2">
                      {art.resumen || "Crónica documentada de este día."}
                    </p>
                    {art.url && (
                      <a
                        href={art.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#5A5A40] hover:underline"
                      >
                        <span>Leer crónica íntegra</span>
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fotografías del archivo vinculadas a esta fecha/época */}
          {dayPhotos.length > 0 && (
            <div className="bg-white rounded-[32px] border border-[#e5e4de] p-6 sm:p-8 shadow-xs">
              <div className="flex items-center gap-2.5 mb-6">
                <ImageIcon className="w-5 h-5 text-[#5A5A40]" />
                <h3 className="font-serif text-xl font-bold text-[#3A3A28]">
                  Fotografías del Archivo vinculadas a esta fecha
                </h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {dayPhotos.map((photo, idx) => (
                  <div
                    key={photo.id}
                    onClick={() => setSelectedPhotoIndex(idx)}
                    className="group relative cursor-pointer aspect-square rounded-2xl overflow-hidden bg-gray-100 border border-gray-200"
                  >
                    <img
                      src={photo.thumbnailUrl || photo.imageUrl}
                      alt={photo.title || "Foto histórica de Estella"}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end text-white">
                      <span className="text-xs font-bold line-clamp-1">{photo.title || photo.location}</span>
                      <span className="text-[10px] text-gray-300">{photo.year || "S.F."}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Modal para ver fotos del día */}
      {selectedPhotoIndex !== null && (
        <PhotoDetailModal
          photo={dayPhotos[selectedPhotoIndex]}
          photos={dayPhotos}
          currentIndex={selectedPhotoIndex}
          onNavigate={(newIndex) => setSelectedPhotoIndex(newIndex)}
          onClose={() => setSelectedPhotoIndex(null)}
          user={user}
        />
      )}
    </div>
  );
}
