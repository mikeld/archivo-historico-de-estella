import React, { useState, useRef, useEffect } from "react";
import { User } from "firebase/auth";
import { askCronista, CronistaResponse } from "../services/cronistaService";
import { ArchiveArticle, Photo } from "../types";
import { PhotoDetailModal } from "../components/PhotoDetailModal";
import {
  Sparkles,
  Send,
  Loader2,
  BookOpen,
  Image as ImageIcon,
  ExternalLink,
  RotateCcw,
  Newspaper,
  Compass,
  Scroll,
  Calendar,
} from "lucide-react";

interface CronistaChatProps {
  user: User | null;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  articles?: ArchiveArticle[];
  photos?: Photo[];
  timestamp: string;
}

const SUGGESTED_QUESTIONS = [
  { label: "🚂 El Trenico Vasco-Navarro", query: "¿Cómo era el trenico Vasco-Navarro y qué supuso la estación de Estella?" },
  { label: "⛪ Basílica del Puy", query: "¿Cuál es la historia y tradición de la Virgen del Puy y su basílica?" },
  { label: "🌊 Inundaciones del Ega", query: "¿Qué grandes inundaciones y riadas del río Ega se recuerdan en la historia de Estella?" },
  { label: "🎭 Gigantes y Fiestas", query: "¿Cuál es el origen de la comparsa de Gigantes y Cabezudos de Estella-Lizarra?" },
  { label: "🏰 La Judería y Sefarad", query: "¿Qué importancia tuvo la antigua judería de Estella y qué vestigios se conservan?" },
  { label: "🎵 El Padre Hilario Olazarán", query: "¿Quién fue el Padre Hilario Olazarán y su legado en Estella?" },
];

export function CronistaChat({ user }: CronistaChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "¡Saludos, vecino y visitante de Estella-Lizarra! Soy **El Cronista de Estella**, tu guía por la memoria histórica de nuestra noble ciudad del Ega.\n\nTengo acceso a nuestros fondos de más de **1.200 fotografías históricas** y a una hemeroteca de **1.700 crónicas y artículos** de la revista *Calle Mayor* (desde 1992), *Radio Estella COPE*, el *Diario de Noticias* y documentos de investigación.\n\n¿Qué rincón, personaje o suceso de Estella te gustaría rememorar hoy?",
      timestamp: "Ahora",
    },
  ]);
  const [inputQuery, setInputQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async (queryToSend?: string) => {
    const q = (queryToSend || inputQuery).trim();
    if (!q || loading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: q,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuery("");
    setLoading(true);

    try {
      const historyContext = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res: CronistaResponse = await askCronista(q, historyContext);

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: res.answer,
        articles: res.citedArticles,
        photos: res.relevantPhotos,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error("Error consultando al Cronista:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "Disculpa, ha ocurrido un tropiezo consultando las crónicas del archivo. ¿Podrías replantear tu pregunta?",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content:
          "¡Saludos de nuevo! He abierto una nueva página en el libro de crónicas. ¿Qué episodio o rincón de Estella-Lizarra deseas explorar?",
        timestamp: "Ahora",
      },
    ]);
  };

  const formatMarkdown = (text: string) => {
    // Parser simple y seguro de markdown básico (negritas, cursivas, listas)
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      if (line.startsWith("### ")) {
        return (
          <h4 key={idx} className="font-serif font-bold text-base text-[#3A3A28] mt-3 mb-1">
            {line.replace("### ", "")}
          </h4>
        );
      }
      if (line.startsWith("## ")) {
        return (
          <h3 key={idx} className="font-serif font-bold text-lg text-[#3A3A28] mt-4 mb-2">
            {line.replace("## ", "")}
          </h3>
        );
      }
      if (line.startsWith("* ") || line.startsWith("- ")) {
        const itemText = line.substring(2);
        return (
          <li key={idx} className="ml-4 list-disc text-sm text-gray-800 my-1 leading-relaxed">
            <span dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(itemText) }} />
          </li>
        );
      }
      if (!line.trim()) {
        return <div key={idx} className="h-2" />;
      }
      return (
        <p key={idx} className="text-sm text-gray-800 leading-relaxed mb-2 font-serif">
          <span dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(line) }} />
        </p>
      );
    });
  };

  const renderInlineMarkdown = (str: string) => {
    return str
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>");
  };

  return (
    <div className="max-w-5xl mx-auto flex flex-col h-[calc(100vh-140px)] min-h-[600px] pb-4">
      {/* Header */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-[#e8e8e6] shadow-xs mb-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#5A5A40] text-white flex items-center justify-center shadow-xs">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-serif font-bold text-[#3A3A28]">
                El Cronista de Estella
              </h1>
              <span className="bg-[#5A5A40]/10 text-[#5A5A40] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                IA Histórica
              </span>
            </div>
            <p className="text-xs text-[#5A5A40] font-serif mt-0.5 hidden sm:block">
              Conversa con la historia local documentada con 1.216 fotos y 1.725 crónicas periodísticas.
            </p>
          </div>
        </div>

        <button
          onClick={handleReset}
          className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-gray-100 transition-colors"
          title="Reiniciar conversación"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Nueva charla</span>
        </button>
      </div>

      {/* Chat Messages Container */}
      <div className="flex-1 bg-white rounded-3xl border border-[#e8e8e6] shadow-xs overflow-y-auto p-4 sm:p-6 space-y-6">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.role === "user" ? "items-end" : "items-start"
            }`}
          >
            <div
              className={`max-w-[90%] sm:max-w-[80%] rounded-3xl p-5 ${
                msg.role === "user"
                  ? "bg-[#5A5A40] text-white rounded-tr-xs shadow-xs"
                  : "bg-[#FBFBFA] border border-[#ECEBE7] text-gray-800 rounded-tl-xs shadow-xs"
              }`}
            >
              {msg.role === "assistant" && (
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#E8E7E2]">
                  <Scroll className="w-4 h-4 text-[#5A5A40]" />
                  <span className="text-xs font-serif font-bold text-[#5A5A40] uppercase tracking-wider">
                    Crónica del Archivo
                  </span>
                </div>
              )}

              <div className={msg.role === "user" ? "text-sm text-white font-sans" : ""}>
                {msg.role === "assistant" ? formatMarkdown(msg.content) : msg.content}
              </div>

              {/* Photos Gallery attached to Cronista response */}
              {msg.photos && msg.photos.length > 0 && (
                <div className="mt-5 pt-4 border-t border-[#E8E7E2]">
                  <div className="text-xs font-bold text-[#5A5A40] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5" />
                    Fotografías del archivo vinculadas:
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {msg.photos.map((photo) => (
                      <div
                        key={photo.id}
                        onClick={() => setSelectedPhoto(photo)}
                        className="group/photo relative aspect-4/3 rounded-xl overflow-hidden bg-gray-200 cursor-pointer shadow-xs hover:shadow-md transition-all"
                      >
                        <img
                          src={photo.thumbnailUrl || photo.imageUrl}
                          alt={photo.title || photo.description || "Foto histórica"}
                          className="w-full h-full object-cover group-hover/photo:scale-105 transition-transform"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-80" />
                        <div className="absolute bottom-1.5 left-2 right-2 text-white text-[10px] font-medium line-clamp-1">
                          {photo.title || photo.year || "Ver foto"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cited Articles attached to response */}
              {msg.articles && msg.articles.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[#E8E7E2]">
                  <div className="text-xs font-bold text-[#5A5A40] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Newspaper className="w-3.5 h-3.5" />
                    Crónicas consultadas en la hemeroteca:
                  </div>
                  <div className="space-y-1.5">
                    {msg.articles.slice(0, 4).map((art) => (
                      <div
                        key={art.id}
                        className="flex items-center justify-between text-xs bg-white p-2 rounded-xl border border-gray-200 hover:border-[#5A5A40] transition-colors"
                      >
                        <div className="flex items-center gap-2 overflow-hidden mr-2">
                          <span className="font-semibold text-[#5A5A40] shrink-0 text-[10px] bg-[#5A5A40]/10 px-1.5 py-0.5 rounded">
                            {art.fuente}
                          </span>
                          <span className="truncate text-gray-700 font-serif">
                            {art.titulo}
                          </span>
                        </div>
                        {art.url && (
                          <a
                            href={art.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 shrink-0 text-[11px] flex items-center gap-1 hover:underline"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div
                className={`text-[10px] mt-2.5 ${
                  msg.role === "user" ? "text-white/60 text-right" : "text-gray-400"
                }`}
              >
                {msg.timestamp}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-start">
            <div className="bg-[#FBFBFA] border border-[#ECEBE7] rounded-3xl rounded-tl-xs p-5 max-w-[80%] shadow-xs flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-[#5A5A40]" />
              <p className="text-xs font-serif text-[#5A5A40] italic">
                El Cronista está consultando los manuscritos y la hemeroteca de Estella...
              </p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompt Chips */}
      <div className="pt-3 pb-2 px-1 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
        {SUGGESTED_QUESTIONS.map((item, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(item.query)}
            disabled={loading}
            className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium bg-white hover:bg-gray-100 text-[#3A3A28] border border-[#e8e8e6] transition-colors shadow-2xs disabled:opacity-50 shrink-0"
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Input Box */}
      <div className="bg-white rounded-3xl border border-[#e8e8e6] p-2 shadow-sm flex items-center gap-2 shrink-0">
        <input
          type="text"
          placeholder="Pregunta sobre la historia, fotos o personajes de Estella-Lizarra..."
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={loading}
          className="flex-1 bg-transparent border-none py-2.5 px-4 text-sm text-gray-800 placeholder-[#5A5A40]/60 focus:outline-none"
        />

        <button
          onClick={() => handleSend()}
          disabled={!inputQuery.trim() || loading}
          className="w-10 h-10 rounded-2xl bg-[#5A5A40] hover:bg-[#4a4a30] text-white flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-xs shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      {/* Photo detail modal */}
      {selectedPhoto && (
        <PhotoDetailModal
          photo={selectedPhoto}
          user={user}
          onClose={() => setSelectedPhoto(null)}
        />
      )}
    </div>
  );
}
