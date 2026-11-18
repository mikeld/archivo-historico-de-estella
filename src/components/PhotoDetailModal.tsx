import React, { useState, useEffect, useCallback } from "react";
import { Photo, Suggestion, Role, User as AppUser, Curiosity } from "../types";
import {
  X, AlertCircle, Edit3, UserPlus, CheckCircle2, Loader2, Calendar,
  User as UserIcon, Wand2, Link as LinkIcon, ZoomIn, ZoomOut, Heart,
  Save, MapPin, Camera, FolderOpen, Scale, FileBox, ChevronLeft, ChevronRight, Newspaper,
  Copy, Check, Share2, Download,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { doc, setDoc, updateDoc, getDoc, collection, query, where, onSnapshot } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { User } from "firebase/auth";
import { useForm } from "react-hook-form";
import { cn } from "../lib/utils";

function WhatsAppIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-5.705 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
    </svg>
  );
}

// Nombres legibles de las fuentes del corpus RAG (Brain).
const FUENTE_LABELS: Record<string, string> = {
  callemayor: "Calle Mayor",
  noticias: "Diario de Noticias",
  diario_navarra: "Diario de Navarra",
  diario_noticias: "Diario de Noticias",
  radioestella: "Radio Estella COPE", // valor normalizado en Brain v2
  radio_estella: "Radio Estella COPE",
  notebooklm: "Documentación histórica",
  documentos: "Documentos históricos",
};
const fuenteLabel = (f: string) => FUENTE_LABELS[f] || f;

interface PhotoDetailModalProps {
  photo: Photo;
  photos?: Photo[];          // full list for prev/next navigation
  currentIndex?: number;
  onNavigate?: (index: number) => void;
  user: User | null;
  userRole?: string;
  onClose: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
}

export function PhotoDetailModal({
  photo,
  photos = [],
  currentIndex = 0,
  onNavigate,
  user,
  userRole,
  onClose,
  isFavorite: isFavoriteProp,
  onToggleFavorite,
}: PhotoDetailModalProps) {
  const [activeTab, setActiveTab] = useState<"info" | "curiosities" | "suggest" | "claim" | "quick_edit">("info");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isFavoriteLocal, setIsFavoriteLocal] = useState(false);
  const [curiosities, setCuriosities] = useState<Curiosity[]>([]);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showAiAnalysis, setShowAiAnalysis] = useState(false);

  const isAdmin = userRole === "admin" || user?.email === "mikeldiaz0@gmail.com" || user?.email === "estellaescapecity@gmail.com";
  const isFavorite = isFavoriteProp ?? isFavoriteLocal;
  const canNavigate = photos.length > 1 && !!onNavigate;
  const hasPrev = canNavigate && currentIndex > 0;
  const hasNext = canNavigate && currentIndex < photos.length - 1;

  // Load favorite state if not managed by parent
  useEffect(() => {
    if (isFavoriteProp !== undefined || !user) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data() as AppUser;
        setIsFavoriteLocal(!!data.favorites?.includes(photo.id));
      }
    }).catch(() => {});
  }, [user, photo.id, isFavoriteProp]);

  useEffect(() => {
    const q = query(collection(db, "curiosities"), where("photoId", "==", photo.id));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const cur: Curiosity[] = [];
        snap.forEach((d) => cur.push({ id: d.id, ...d.data() } as Curiosity));
        setCuriosities(cur);
      },
      (err) => {
        console.debug("Curiosities listener skipped:", err);
      }
    );
    return unsub;
  }, [photo.id]);

  // Reset tab when photo changes
  useEffect(() => {
    setActiveTab("info");
    setSuccess(null);
    setError(null);
    setShowAiAnalysis(false);
  }, [photo.id]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (isZoomed) return;
      if (e.key === "ArrowLeft" && hasPrev) onNavigate!(currentIndex - 1);
      if (e.key === "ArrowRight" && hasNext) onNavigate!(currentIndex + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, isZoomed, hasPrev, hasNext, currentIndex, onNavigate]);

  const handleToggleFavorite = useCallback(async () => {
    if (!user) { alert("Inicia sesión para guardar favoritos"); return; }
    if (onToggleFavorite) { onToggleFavorite(photo.id); return; }
    // fallback: manage locally
    try {
      const uRef = doc(db, "users", user.uid);
      const uSnap = await getDoc(uRef);
      if (uSnap.exists()) {
        const uData = uSnap.data() as AppUser;
        let favs = uData.favorites || [];
        favs = isFavoriteLocal ? favs.filter((id) => id !== photo.id) : [...favs, photo.id];
        await updateDoc(uRef, { favorites: favs });
        setIsFavoriteLocal(!isFavoriteLocal);
      }
    } catch (e) { console.error(e); }
  }, [user, photo.id, isFavoriteLocal, onToggleFavorite]);

  const { register, handleSubmit, formState: { errors }, reset } = useForm({
    defaultValues: {
      description: photo.description || "",
      year: photo.year || "",
      owner: photo.owner || "",
      curiosityText: "",
      curiosityType: "curiosity",
    },
  });

  const handleSuggestionSubmit = async (data: any, type: "edit_details" | "claim_authorship" | "add_curiosity") => {
    if (!user) return;
    setIsSubmitting(true); setError(null); setSuccess(null);
    try {
      const suggestionId = crypto.randomUUID();
      let proposedChanges: any = {};
      if (type === "edit_details") proposedChanges = { description: data.description, year: data.year ? Number(data.year) : undefined };
      else if (type === "claim_authorship") proposedChanges = { owner: data.owner };
      else if (type === "add_curiosity") proposedChanges = { curiosityText: data.curiosityText, curiosityType: data.curiosityType };
      const newSuggestion: Suggestion = { id: suggestionId, photoId: photo.id, suggestedBy: user.uid, type, status: "pending", proposedChanges, createdAt: Date.now() };
      await setDoc(doc(db, "suggestions", suggestionId), newSuggestion);
      setSuccess(type === "claim_authorship" ? "Reclamación enviada a revisión." : type === "add_curiosity" ? "Curiosidad enviada a revisión." : "Sugerencia enviada a revisión.");
      reset();
      setTimeout(() => { setActiveTab("info"); setSuccess(null); }, 3000);
    } catch (err) {
      try { handleFirestoreError(err, OperationType.CREATE, "suggestions"); }
      catch (handledErr) { setError(handledErr instanceof Error ? handledErr.message : "Error al enviar"); }
    } finally { setIsSubmitting(false); }
  };

  const handleQuickEdit = async (data: any) => {
    if (!isAdmin) return;
    setIsSubmitting(true); setError(null); setSuccess(null);
    try {
      await updateDoc(doc(db, "photos", photo.id), {
        description: data.description,
        year: data.year ? Number(data.year) : null,
        owner: data.owner,
      });
      setSuccess("Cambios guardados.");
      setTimeout(() => setSuccess(null), 3000);
    } catch { setError("Error al guardar."); }
    finally { setIsSubmitting(false); }
  };

  const handleCopyLink = useCallback(() => {
    const url = `${window.location.origin}/?photo=${photo.id}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {
        prompt("Copia este enlace:", url);
      });
    } else {
      prompt("Copia este enlace:", url);
    }
  }, [photo.id]);

  const handleShareWhatsApp = useCallback(() => {
    const url = `${window.location.origin}/?photo=${photo.id}`;
    const title = photo.title || photo.description?.slice(0, 80) || "Fotografía histórica de Estella";
    const yearText = photo.year ? ` (${photo.year})` : "";
    const text = `📸 ${title}${yearText} - Archivo Histórico de Estella-Lizarra:\n${url}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  }, [photo.id, photo.title, photo.description, photo.year]);

  const handleDownloadPhoto = useCallback(async () => {
    try {
      setDownloading(true);
      const res = await fetch(photo.imageUrl);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      const cleanTitle = (photo.title || "foto-historica-estella")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40);
      a.download = `${cleanTitle || "archivo-estella"}-${photo.year || "historica"}.jpg`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);
    } catch {
      window.open(photo.imageUrl, "_blank");
    } finally {
      setDownloading(false);
    }
  }, [photo.imageUrl, photo.title, photo.year]);

  if (isZoomed) {
    return (
      <div className="fixed inset-0 z-[110] bg-black flex flex-col">
        <div className="flex justify-between items-center p-4 bg-black/80 text-white sticky top-0">
          <button onClick={() => setIsZoomed(false)} className="bg-white/10 hover:bg-white/20 p-2 rounded-full flex items-center gap-2">
            <ZoomOut className="w-5 h-5" /> <span className="text-sm font-medium">Cerrar Zoom</span>
          </button>
          <span className="text-sm text-white/60">{photo.title || photo.year || ""}</span>
          <button onClick={onClose} className="bg-white/10 hover:bg-white/20 p-2 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto flex items-center justify-center p-4">
          <img src={photo.imageUrl} alt="Zoom" className="max-w-none w-auto h-auto min-w-full lg:min-w-[150vw] xl:min-w-[200vw]" draggable="false" />
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-md" onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white rounded-[32px] w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row shadow-2xl relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Left: Image */}
          <div className="w-full md:w-3/5 bg-[#EAE8E3] flex items-center justify-center relative min-h-[300px] md:min-h-[500px] overflow-hidden group">
            <motion.img
              key={photo.id}
              layoutId={`img-${photo.id}`}
              src={photo.imageUrl}
              alt={photo.description || "Fotografía de Estella"}
              className="w-full h-full object-contain"
            />

            {/* Zoom button */}
            <button
              onClick={() => setIsZoomed(true)}
              className="absolute inset-0 m-auto w-14 h-14 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
            >
              <ZoomIn className="w-7 h-7" />
            </button>

            {/* Favorite */}
            <button
              onClick={handleToggleFavorite}
              className="absolute top-5 left-5 bg-white/70 hover:bg-white/90 p-3 rounded-full transition-all z-10 backdrop-blur-sm shadow-sm active:scale-90"
            >
              <Heart className={cn("w-5 h-5 transition-colors", isFavorite ? "fill-red-500 text-red-500" : "text-gray-600")} />
            </button>

            {/* Close (mobile) */}
            <button onClick={onClose} className="absolute top-5 right-5 bg-black/50 hover:bg-black/80 text-white p-2.5 rounded-full md:hidden z-10">
              <X className="w-5 h-5" />
            </button>

            {/* Prev / Next arrows */}
            {hasPrev && (
              <button
                onClick={() => onNavigate!(currentIndex - 1)}
                className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white p-2.5 rounded-full transition-all backdrop-blur-sm z-10 opacity-0 group-hover:opacity-100"
                title="Anterior (←)"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            {hasNext && (
              <button
                onClick={() => onNavigate!(currentIndex + 1)}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white p-2.5 rounded-full transition-all backdrop-blur-sm z-10 opacity-0 group-hover:opacity-100"
                title="Siguiente (→)"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}

            {/* Counter */}
            {canNavigate && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white/80 text-xs px-3 py-1 rounded-full backdrop-blur-sm">
                {currentIndex + 1} / {photos.length}
              </div>
            )}
          </div>

          {/* Right: Info */}
          <div className="w-full md:w-2/5 flex flex-col bg-white h-full overflow-y-auto max-h-[60vh] md:max-h-none border-l border-[#e8e8e6]">
            <div className="sticky top-0 bg-white/90 backdrop-blur-md border-b border-[#e8e8e6] p-5 flex justify-between items-start z-10">
              <div className="flex flex-col gap-0.5 overflow-hidden pr-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#5A5A40] opacity-80">Ficha de Archivo</span>
                <h2 className="font-serif font-bold text-xl text-gray-900 leading-snug" title={photo.title || ""}>
                  {photo.title || "Fotografía sin título"}
                </h2>
                {photo.year && <span className="text-sm text-gray-400">{photo.year}</span>}
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 hidden md:block shrink-0 bg-gray-50 p-2 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5">
              {/* WhatsApp Share, Direct Link & Download */}
              <div className="flex items-center gap-1.5 mb-5 p-2 bg-[#f0f8f2] border border-[#cde8d5] rounded-2xl">
                <button
                  onClick={handleShareWhatsApp}
                  className="flex-1 bg-[#25D366] hover:bg-[#20ba5a] text-white py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer truncate"
                  title="Compartir en WhatsApp"
                >
                  <WhatsAppIcon className="w-4 h-4 fill-white shrink-0" />
                  <span className="truncate">WhatsApp</span>
                </button>
                <button
                  onClick={handleCopyLink}
                  className="bg-white hover:bg-gray-100 text-gray-700 py-2 px-3 rounded-xl font-medium text-xs flex items-center justify-center gap-1 border border-gray-200 transition-all active:scale-95 shrink-0 cursor-pointer"
                  title="Copiar enlace directo"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-green-600" />
                      <span className="text-green-700 font-bold">¡Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-gray-500" />
                      <span className="hidden sm:inline">Copiar enlace</span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleDownloadPhoto}
                  disabled={downloading}
                  className="bg-white hover:bg-gray-100 text-gray-700 py-2 px-3 rounded-xl font-medium text-xs flex items-center justify-center gap-1 border border-gray-200 transition-all active:scale-95 shrink-0 cursor-pointer"
                  title="Descargar fotografía en alta calidad"
                >
                  {downloading ? (
                    <Loader2 className="w-3.5 h-3.5 text-gray-500 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-gray-500" />
                  )}
                  <span className="hidden sm:inline">Descargar</span>
                </button>
              </div>

              {/* Tabs */}
              <div className="flex bg-gray-100 rounded-xl p-1 mb-5 gap-0.5 text-xs">
                {(["info", "curiosities"] as const).map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={cn("flex-1 py-1.5 rounded-lg font-medium transition-colors capitalize",
                      activeTab === tab ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                    )}>
                    {tab === "info" ? "Info" : "Curiosidades"}
                    {tab === "curiosities" && curiosities.length > 0 && (
                      <span className="ml-1 bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full text-[10px]">{curiosities.length}</span>
                    )}
                  </button>
                ))}
                {user && (
                  <>
                    <button onClick={() => setActiveTab("suggest")} className={cn("flex-1 py-1.5 rounded-lg font-medium transition-colors", activeTab === "suggest" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700")}>
                      Sugerir
                    </button>
                    <button onClick={() => setActiveTab("claim")} className={cn("flex-1 py-1.5 rounded-lg font-medium transition-colors", activeTab === "claim" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700")}>
                      Reclamar
                    </button>
                  </>
                )}
                {isAdmin && (
                  <button onClick={() => setActiveTab("quick_edit")} className={cn("flex-1 py-1.5 rounded-lg font-medium transition-colors", activeTab === "quick_edit" ? "bg-red-50 text-red-700 shadow-sm" : "text-red-400 hover:text-red-600")}>
                    Admin
                  </button>
                )}
              </div>

              {success && (
                <div className="bg-green-50 text-green-700 p-3 rounded-lg flex items-start gap-2 text-sm mb-4">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /><p>{success}</p>
                </div>
              )}
              {error && (
                <div className="bg-red-50 text-red-700 p-3 rounded-lg flex items-start gap-2 text-sm mb-4">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><p>{error}</p>
                </div>
              )}

              {/* INFO TAB */}
              {activeTab === "info" && (
                <div className="space-y-5">
                  {photo.description && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                          {photo.aiAnalysis ? "Relato / Testimonio" : "Descripción"}
                        </h3>
                        {photo.facebookAuthor && (
                          <span className="text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200/60 px-2 py-0.5 rounded-full">
                            Por {photo.facebookAuthor}
                          </span>
                        )}
                      </div>
                      <div className="bg-[#fcfbf7] border border-[#e8e6df] rounded-xl p-3.5 shadow-sm">
                        <p className="text-gray-800 text-sm leading-relaxed whitespace-pre-line italic">
                          "{photo.description}"
                        </p>
                        {photo.facebookPostUrl && (
                          <div className="mt-2.5 pt-2 border-t border-amber-100 flex items-center justify-between text-[11px] text-gray-500">
                            <span>Testimonio recuperado del grupo de Facebook</span>
                            <a
                              href={photo.facebookPostUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-amber-800 hover:text-amber-900 font-medium hover:underline inline-flex items-center gap-1"
                            >
                              Ver publicación original ↗
                            </a>
                          </div>
                        )}
                      </div>

                      {photo.aiAnalysis && (
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => setShowAiAnalysis(!showAiAnalysis)}
                            className="text-[11px] text-gray-500 hover:text-gray-800 flex items-center gap-1.5 transition-colors"
                          >
                            <Wand2 className="w-3.5 h-3.5 text-gray-400" />
                            <span>{showAiAnalysis ? "Ocultar análisis visual técnico" : "Ver análisis visual técnico de archivo"}</span>
                            <span className="text-[10px] bg-gray-100 px-1.5 py-0.2 rounded text-gray-500">IA</span>
                          </button>
                          {showAiAnalysis && (
                            <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600 leading-relaxed">
                              <p className="font-semibold text-gray-700 mb-1">Análisis visual técnico (IA):</p>
                              <p>{photo.aiAnalysis}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    {photo.year && (
                      <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-1.5 text-gray-400 mb-1"><Calendar className="w-3.5 h-3.5" /><span className="text-[10px] font-bold uppercase">Año</span></div>
                        <p className="font-bold text-gray-900">{photo.year}</p>
                      </div>
                    )}
                    {photo.location && (
                      <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-1.5 text-gray-400 mb-1"><MapPin className="w-3.5 h-3.5" /><span className="text-[10px] font-bold uppercase">Lugar</span></div>
                        <p className="font-bold text-gray-900 truncate text-sm" title={photo.location}>{photo.location}</p>
                      </div>
                    )}
                    {photo.photographer && (
                      <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-1.5 text-gray-400 mb-1"><Camera className="w-3.5 h-3.5" /><span className="text-[10px] font-bold uppercase">Fotógrafo</span></div>
                        <p className="font-bold text-gray-900 truncate text-sm" title={photo.photographer}>{photo.photographer}</p>
                      </div>
                    )}
                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                      <div className="flex items-center gap-1.5 text-gray-400 mb-1"><UserIcon className="w-3.5 h-3.5" /><span className="text-[10px] font-bold uppercase">Propiedad</span></div>
                      <p className="font-bold text-gray-900 truncate text-sm" title={photo.owner}>{photo.owner}</p>
                    </div>
                    {photo.collection && (
                      <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 col-span-2">
                        <div className="flex items-center gap-1.5 text-gray-400 mb-1"><FolderOpen className="w-3.5 h-3.5" /><span className="text-[10px] font-bold uppercase">Colección</span></div>
                        <p className="font-bold text-gray-900 text-sm">{photo.collection}</p>
                      </div>
                    )}
                    {photo.source && (
                      <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-1.5 text-gray-400 mb-1"><LinkIcon className="w-3.5 h-3.5" /><span className="text-[10px] font-bold uppercase">Origen</span></div>
                        <p className="font-bold text-gray-900 truncate text-sm">{photo.source}</p>
                      </div>
                    )}
                    {photo.license && (
                      <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-1.5 text-gray-400 mb-1"><Scale className="w-3.5 h-3.5" /><span className="text-[10px] font-bold uppercase">Licencia</span></div>
                        <p className="font-bold text-gray-900 truncate text-sm">{photo.license}</p>
                      </div>
                    )}
                  </div>

                  {photo.tags && photo.tags.length > 0 && (
                    <div className="pt-4 border-t border-gray-100">
                      <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Etiquetas</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {photo.tags.map((t) => (
                          <span key={t} className="px-2.5 py-1 bg-amber-50 text-amber-800 text-xs font-medium rounded-full border border-amber-100">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Prensa y documentación relacionada (Brain RAG) */}
                  {photo.relatedArticles && photo.relatedArticles.length > 0 && (
                    <div className="pt-4 border-t border-gray-100">
                      <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Newspaper className="w-3.5 h-3.5" /> En la prensa y documentación
                      </h3>
                      <div className="space-y-2">
                        {photo.relatedArticles.map((a, i) => {
                          const inner = (
                            <>
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700">{fuenteLabel(a.fuente)}</span>
                                {a.fecha && <span className="text-[10px] text-gray-400">{a.fecha}</span>}
                                {a.seccion && <span className="text-[10px] text-gray-400">· {a.seccion}</span>}
                              </div>
                              <p className="text-sm font-semibold text-gray-900 leading-snug">{a.titulo}</p>
                              {a.resumen && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{a.resumen}</p>}
                            </>
                          );
                          return a.url ? (
                            <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                              className="block bg-gray-50 hover:bg-amber-50 p-3 rounded-xl border border-gray-100 hover:border-amber-200 transition-colors">
                              {inner}
                            </a>
                          ) : (
                            <div key={i} className="bg-gray-50 p-3 rounded-xl border border-gray-100">{inner}</div>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-gray-300 mt-2">Documentación relacionada del corpus de Estella, encontrada automáticamente.</p>
                    </div>
                  )}

                  {/* Facebook source link */}
                  {photo.facebookPostUrl && (
                    <div className="pt-3 border-t border-gray-100">
                      <a href={photo.facebookPostUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1">
                        <LinkIcon className="w-3 h-3" /> Ver publicación original en Facebook
                      </a>
                    </div>
                  )}

                  {!user && (
                    <div className="bg-amber-50 rounded-xl p-4 text-sm text-amber-800 border border-amber-100 flex gap-3">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <p>Inicia sesión para sugerir correcciones o reclamar la autoría.</p>
                    </div>
                  )}

                  {/* Keyboard hint */}
                  {canNavigate && (
                    <p className="text-[10px] text-gray-300 text-center pt-2">← → para navegar · Esc para cerrar</p>
                  )}
                </div>
              )}

              {/* CURIOSITIES TAB */}
              {activeTab === "curiosities" && (
                <div className="space-y-5">
                  {[...(photo.curiosities || []), ...curiosities].length > 0 ? (
                    <div className="space-y-3">
                      {[...(photo.curiosities || []), ...curiosities].map((c, idx) => (
                        <div key={c.id || idx} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                              c.type === "anecdote" ? "bg-amber-100 text-amber-800" :
                              c.type === "historia" ? "bg-blue-100 text-blue-800" :
                              c.type === "cotilleo" ? "bg-pink-100 text-pink-800" :
                              c.type === "misterio" ? "bg-purple-100 text-purple-800" :
                              "bg-purple-50 text-purple-700"
                            )}>{c.type}</span>
                            <span className="text-xs text-gray-400">{new Date(c.createdAt).toLocaleDateString("es-ES")}</span>
                          </div>
                          <p className="text-gray-800 text-sm leading-relaxed">{c.text}</p>
                          <div className="flex justify-between items-center mt-3">
                            <span className="text-xs text-gray-400 italic">Por {c.authorName || "Anónimo"}</span>
                            {c.id && (
                              <span className="text-xs text-gray-400 flex items-center gap-1">
                                <Heart className="w-3 h-3" /> {c.likes || 0}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <p className="text-sm">Aún no hay anécdotas para esta foto.</p>
                      {!user && <p className="text-xs mt-1">Inicia sesión para ser el primero.</p>}
                    </div>
                  )}

                  {user && (
                    <div className="pt-4 border-t border-gray-100">
                      <h3 className="font-medium text-gray-800 mb-3 text-sm">Añadir anécdota o curiosidad</h3>
                      <form onSubmit={handleSubmit((data) => handleSuggestionSubmit(data, "add_curiosity"))} className="space-y-3">
                        <div className="flex gap-4">
                          {["curiosity", "anecdote", "historia", "misterio"].map((type) => (
                            <label key={type} className="flex items-center gap-1.5 text-xs cursor-pointer">
                              <input type="radio" {...register("curiosityType")} value={type} className="text-amber-600" />
                              <span className="capitalize">{type === "curiosity" ? "Curiosidad" : type === "anecdote" ? "Anécdota" : type === "historia" ? "Historia" : "Misterio"}</span>
                            </label>
                          ))}
                        </div>
                        <textarea {...register("curiosityText", { required: true })} rows={3}
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-400 text-sm resize-none"
                          placeholder="¿Conoces alguna historia detrás de esta foto?" />
                        <button type="submit" disabled={isSubmitting}
                          className="w-full bg-amber-500 hover:bg-amber-600 text-white font-medium py-2 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-sm">
                          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                          Enviar aportación
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              )}

              {/* SUGGEST TAB */}
              {activeTab === "suggest" && user && (
                <form onSubmit={handleSubmit((data) => handleSuggestionSubmit(data, "edit_details"))} className="space-y-4">
                  <div className="bg-blue-50 text-blue-700 p-3 rounded-xl text-sm">Sugiere correcciones de año o descripción. Un administrador lo revisará.</div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Descripción mejorada</label>
                    <textarea {...register("description")} rows={4}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-400 text-sm resize-none"
                      placeholder="Añade más detalles, nombres..." />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Año (aprox.)</label>
                    <input {...register("year")} type="number"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-400 text-sm" />
                  </div>
                  <button type="submit" disabled={isSubmitting}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white font-medium py-2 px-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 text-sm">
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Edit3 className="w-4 h-4" />}
                    Enviar sugerencia
                  </button>
                </form>
              )}

              {/* CLAIM TAB */}
              {activeTab === "claim" && user && (
                <form onSubmit={handleSubmit((data) => handleSuggestionSubmit(data, "claim_authorship"))} className="space-y-4">
                  <div className="bg-indigo-50 text-indigo-700 p-3 rounded-xl text-sm">¿Es esta foto de tu familia o archivo? Reclama la autoría para que conste tu nombre.</div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nombre para la propiedad</label>
                    <input {...register("owner", { required: "Debes indicar un nombre" })} type="text"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-400 text-sm"
                      placeholder="Ej: Archivo Familia López" />
                    {errors.owner && <p className="text-red-500 text-xs mt-1">{String(errors.owner.message)}</p>}
                  </div>
                  <p className="text-xs text-gray-400 bg-gray-50 p-3 rounded-xl">Al enviar afirmas de buena fe tener los derechos o ser el depositario original.</p>
                  <button type="submit" disabled={isSubmitting}
                    className="w-full bg-gray-900 hover:bg-black text-white font-medium py-2 px-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 text-sm">
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    Solicitar propiedad
                  </button>
                </form>
              )}

              {/* QUICK EDIT (Admin) */}
              {activeTab === "quick_edit" && isAdmin && (
                <form onSubmit={handleSubmit(handleQuickEdit)} className="space-y-4">
                  <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm"><strong>Admin:</strong> Los cambios se guardan sin revisión.</div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
                    <textarea {...register("description")} rows={4}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-400 text-sm resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Año</label>
                    <input {...register("year")} type="number"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-400 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Propietario</label>
                    <input {...register("owner")} type="text"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-400 text-sm" />
                  </div>
                  <button type="submit" disabled={isSubmitting}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 text-sm">
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Guardar cambios
                  </button>
                </form>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
