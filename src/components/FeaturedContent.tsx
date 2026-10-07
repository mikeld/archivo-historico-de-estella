import React, { useEffect, useState } from "react";
import { collection, query, limit, getDocs, orderBy, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Curiosity, News, Photo } from "../types";
import { Sparkles, Newspaper, ArrowRight, Quote } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Link } from "react-router-dom";

import { getArchivePhotos } from "../lib/dataService";

export function FeaturedContent() {
  const [randomCuriosity, setRandomCuriosity] = useState<{ text: string; photo?: Photo } | null>(null);
  const [latestNews, setLatestNews] = useState<News | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFeatured() {
      try {
        // 1. Pick a rich historical story from the archive
        const photos = await getArchivePhotos();
        const candidates = photos.filter(
          (p) => (p.description && p.description.length > 50) || (p.relatedArticles && p.relatedArticles.length > 0)
        );
        if (candidates.length > 0) {
          const selected = candidates[Math.floor(Math.random() * candidates.length)];
          const storyText = selected.description?.slice(0, 160) || selected.relatedArticles?.[0]?.resumen || selected.title || "";
          setRandomCuriosity({
            text: storyText,
            photo: selected,
          });
        }

        // 2. Fetch latest news from Firestore if permitted
        try {
          const newsQuery = query(collection(db, "news"), orderBy("date", "desc"), limit(1));
          const newsSnap = await getDocs(newsQuery);
          if (!newsSnap.empty) {
            setLatestNews({ id: newsSnap.docs[0].id, ...newsSnap.docs[0].data() } as News);
          }
        } catch {
          // Ignore news permission errors quietly
        }
      } catch (err) {
        console.debug("Featured content load skipped:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchFeatured();
  }, []);

  if (loading || (!randomCuriosity && !latestNews)) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
      {/* Curiosity Card */}
      <AnimatePresence mode="wait">
        {randomCuriosity && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-[32px] overflow-hidden border border-[#e8e8e6] shadow-sm flex flex-col md:flex-row min-h-[220px]"
          >
            {randomCuriosity.photo && (
              <div className="w-full md:w-2/5 shrink-0 bg-gray-100 relative group">
                <img 
                  src={randomCuriosity.photo.imageUrl} 
                  alt="Curiosidad" 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-black/20" />
              </div>
            )}
            <div className="p-8 flex flex-col justify-center relative flex-1">
              <div className="absolute top-6 right-8 opacity-5 text-[#5A5A40]">
                <Quote size={64} fill="currentColor" />
              </div>
              <div className="flex items-center gap-2 text-[#6A4C93] mb-3">
                <Sparkles size={16} />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Sabías que...</span>
              </div>
              <p className="text-gray-800 font-serif text-lg leading-relaxed italic mb-4 line-clamp-4">
                "{randomCuriosity.text}"
              </p>
              <Link 
                to="/curiosities" 
                className="mt-auto inline-flex items-center gap-2 text-[#5A5A40] text-sm font-semibold hover:gap-3 transition-all"
              >
                Ver más curiosidades <ArrowRight size={14} />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Latest News Card */}
      <AnimatePresence mode="wait">
        {latestNews && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-[32px] p-8 border border-[#e8e8e6] shadow-sm flex flex-col justify-between relative overflow-hidden"
          >
             <div className="absolute top-0 right-0 p-8 text-[#5A5A40] opacity-5">
              <Newspaper size={80} />
            </div>
            <div>
              <div className="flex items-center gap-2 text-amber-700 mb-3">
                <Newspaper size={16} />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Última Noticia Histórica</span>
              </div>
              <h3 className="text-xl font-serif text-[#3A3A28] mb-3 leading-tight line-clamp-2">
                {latestNews.title}
              </h3>
              <p className="text-gray-500 text-sm line-clamp-3 mb-6 leading-relaxed">
                {latestNews.content}
              </p>
            </div>
            <Link 
                to="/news" 
                className="inline-flex items-center gap-2 text-[#5A5A40] text-sm font-semibold hover:gap-3 transition-all"
              >
                Ir a la hemeroteca <ArrowRight size={14} />
              </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
