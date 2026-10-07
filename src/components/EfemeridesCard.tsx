import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  BookOpen,
  Share2,
  Check,
  RefreshCw,
  Clock,
  History,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  Efemeride,
  getEfemerideForDate,
  MONTH_NAMES,
} from "../services/efemeridesService";

interface EfemeridesCardProps {
  initialDay?: number;
  initialMonth?: number;
  compact?: boolean;
}

export function EfemeridesCard({
  initialDay,
  initialMonth,
  compact = false,
}: EfemeridesCardProps) {
  const today = new Date();
  const [day, setDay] = useState<number>(initialDay || today.getDate());
  const [month, setMonth] = useState<number>(initialMonth || today.getMonth() + 1);
  const [efemeride, setEfemeride] = useState<Efemeride | null>(null);
  const [loading, setLoading] = useState(true);
  const [isChangingDate, setIsChangingDate] = useState(false);
  const [copied, setCopied] = useState(false);

  // Cargar efeméride al cambiar la fecha seleccionada
  useEffect(() => {
    let isMounted = true;
    async function load() {
      setLoading(true);
      try {
        const data = await getEfemerideForDate(day, month);
        if (isMounted) {
          setEfemeride(data);
        }
      } catch (err) {
        console.error("Error cargando efeméride:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
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
    const text = `🏛️ Tal día como hoy en Estella-Lizarra (${day} de ${MONTH_NAMES[month - 1]}):\n"${efemeride?.title}"\nDescúbrelo en el Archivo Histórico: ${window.location.origin}/efemerides?d=${day}&m=${month}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const isToday = day === today.getDate() && month === today.getMonth() + 1;

  return (
    <div className="bg-gradient-to-br from-[#ffffff] via-[#fafaf8] to-[#f4f3ef] rounded-[32px] border border-[#e5e4de] shadow-sm overflow-hidden mb-10 transition-all">
      {/* Barra superior con navegación de fechas */}
      <div className="px-6 sm:px-8 py-5 border-b border-[#ecebe6] flex flex-wrap items-center justify-between gap-4 bg-white/70 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#5A5A40]/10 text-[#5A5A40] flex items-center justify-center font-serif font-bold">
            <History className="w-5 h-5 text-[#5A5A40]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#5A5A40]">
                Efemérides del Archivo
              </span>
              {isToday && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                  HOY
                </span>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-[#3A3A28] leading-tight">
              Tal día como hoy · {day} de {MONTH_NAMES[month - 1]}
            </h2>
          </div>
        </div>

        {/* Controles de fecha */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevDay}
            title="Día anterior"
            className="p-2 rounded-full border border-gray-200 hover:bg-gray-100 text-gray-700 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>

          <button
            onClick={() => setIsChangingDate(!isChangingDate)}
            className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-800 transition-colors flex items-center gap-1.5"
          >
            <Calendar size={14} />
            <span>Cambiar fecha</span>
          </button>

          <button
            onClick={handleNextDay}
            title="Día siguiente"
            className="p-2 rounded-full border border-gray-200 hover:bg-gray-100 text-gray-700 transition-colors"
          >
            <ChevronRight size={18} />
          </button>

          <button
            onClick={handleShare}
            title="Compartir efeméride"
            className="ml-2 p-2 rounded-full text-[#5A5A40] hover:bg-[#5A5A40]/10 transition-colors"
          >
            {copied ? <Check size={18} className="text-emerald-600" /> : <Share2 size={18} />}
          </button>
        </div>
      </div>

      {/* Selector de fecha desplegable */}
      <AnimatePresence>
        {isChangingDate && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-6 sm:px-8 py-4 bg-amber-50/50 border-b border-amber-100/60 flex flex-wrap items-center gap-4 text-sm"
          >
            <span className="font-medium text-[#5A5A40]">Elige un día:</span>
            <select
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
              className="bg-white border border-gray-300 rounded-xl px-3 py-1.5 text-gray-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#5A5A40]"
            >
              {Array.from({ length: new Date(2024, month, 0).getDate() }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="bg-white border border-gray-300 rounded-xl px-3 py-1.5 text-gray-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#5A5A40]"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name.charAt(0).toUpperCase() + name.slice(1)}
                </option>
              ))}
            </select>
            {!isToday && (
              <button
                onClick={() => {
                  setDay(today.getDate());
                  setMonth(today.getMonth() + 1);
                  setIsChangingDate(false);
                }}
                className="text-xs text-amber-800 underline font-semibold ml-auto"
              >
                Volver a la fecha de hoy
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contenido principal */}
      <div className="p-6 sm:p-8">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-[#5A5A40] gap-3">
            <div className="w-8 h-8 border-3 border-[#5A5A40] border-t-transparent rounded-full animate-spin" />
            <p className="font-serif italic text-sm text-gray-600">
              Consultando crónicas de la hemeroteca y redactando efemérides...
            </p>
          </div>
        ) : efemeride ? (
          <div>
            {/* Titular */}
            <h3 className="font-serif text-2xl sm:text-3xl text-[#2a2a1d] font-bold mb-4 tracking-tight leading-snug">
              {efemeride.title}
            </h3>

            {/* Narración histórica de estilo cronista */}
            <div className="text-gray-700 font-serif text-base sm:text-lg leading-relaxed mb-6 space-y-3 whitespace-pre-line border-l-4 border-[#5A5A40]/40 pl-4 py-1 italic bg-[#f9f8f5]/60 rounded-r-2xl">
              {efemeride.narrative}
            </div>

            {/* Hitos destacados del día */}
            {efemeride.highlights && efemeride.highlights.length > 0 && (
              <div className="mt-6 mb-4">
                <div className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider text-[#5A5A40]">
                  <Sparkles size={14} className="text-amber-700" />
                  <span>Crónicas y momentos rescatados de la hemeroteca</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {efemeride.highlights.map((h, idx) => (
                    <div
                      key={idx}
                      className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs flex flex-col justify-between hover:border-[#5A5A40]/30 transition-all"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#5A5A40]/10 text-[#5A5A40]">
                            {h.year || "Crónica"}
                          </span>
                          {h.source && (
                            <span className="text-[10px] text-gray-600 font-medium truncate max-w-[150px]">
                              {h.source}
                            </span>
                          )}
                        </div>
                        <h4 className="font-bold text-gray-900 text-sm mb-1 leading-snug">
                          {h.headline}
                        </h4>
                        <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">
                          {h.detail}
                        </p>
                      </div>

                      {h.url && (
                        <a
                          href={h.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-[#5A5A40] hover:text-[#3A3A28] transition-colors"
                        >
                          <span>Leer crónica original</span>
                          <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pie de tarjeta con enlaces */}
            <div className="pt-4 mt-6 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-700" />
                <span>
                  {efemeride.sourceCount > 0
                    ? `${efemeride.sourceCount} crónicas locales documentadas en esta fecha`
                    : "Crónica basada en la memoria y patrimonio de Estella"}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <Link
                  to="/cronista"
                  className="font-semibold text-[#5A5A40] hover:text-[#3A3A28] inline-flex items-center gap-1"
                >
                  <Sparkles size={13} />
                  <span>Preguntar más al Cronista</span>
                </Link>
                <Link
                  to="/news"
                  className="font-semibold text-[#5A5A40] hover:text-[#3A3A28] inline-flex items-center gap-1"
                >
                  <BookOpen size={13} />
                  <span>Ver Hemeroteca</span>
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-600 text-sm">
            No se han podido cargar las efemérides en este momento.
          </div>
        )}
      </div>
    </div>
  );
}
