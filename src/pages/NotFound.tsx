import React from "react";
import { Link } from "react-router-dom";
import { Landmark, Newspaper, Sparkles, Home, ArrowLeft } from "lucide-react";

export function NotFound() {
  return (
    <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6 text-center">
      <div className="bg-white rounded-[32px] border border-[#e8e8e6] shadow-sm p-8 sm:p-12 relative overflow-hidden">
        {/* Subtle decorative top bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-200 via-[#5A5A40] to-amber-200 opacity-60" />

        <div className="w-20 h-20 mx-auto rounded-3xl bg-[#5A5A40]/10 text-[#5A5A40] flex items-center justify-center mb-6 shadow-inner">
          <Landmark className="w-10 h-10 stroke-[1.5]" />
        </div>

        <span className="text-xs font-bold uppercase tracking-[0.25em] text-[#5A5A40] opacity-80">
          Error 404 · Archivo Histórico
        </span>

        <h1 className="text-3xl sm:text-5xl font-serif text-[#3A3A28] mt-3 mb-4 tracking-tight leading-tight">
          Página perdida en el tiempo
        </h1>

        <p className="text-gray-600 font-serif text-base sm:text-lg max-w-xl mx-auto mb-8 leading-relaxed">
          El documento o rincón que buscas no figura en nuestro catálogo de Estella-Lizarra. Tal vez fue trasladado o la dirección no es correcta.
        </p>

        {/* Action cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8 text-left">
          <Link
            to="/"
            className="p-4 rounded-2xl bg-[#f5f5f0] hover:bg-[#eae8e3] border border-[#e8e8e6] transition-all group"
          >
            <div className="w-8 h-8 rounded-xl bg-[#5A5A40] text-white flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
              <Home className="w-4 h-4" />
            </div>
            <div className="font-serif font-bold text-sm text-[#3A3A28]">Explorar Fotos</div>
            <p className="text-xs text-gray-500 mt-0.5">1.216 fotografías de la ciudad</p>
          </Link>

          <Link
            to="/news"
            className="p-4 rounded-2xl bg-[#f5f5f0] hover:bg-[#eae8e3] border border-[#e8e8e6] transition-all group"
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-800 text-white flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
              <Newspaper className="w-4 h-4" />
            </div>
            <div className="font-serif font-bold text-sm text-[#3A3A28]">Hemeroteca</div>
            <p className="text-xs text-gray-500 mt-0.5">1.725 crónicas y artículos</p>
          </Link>

          <Link
            to="/cronista"
            className="p-4 rounded-2xl bg-[#f5f5f0] hover:bg-[#eae8e3] border border-[#e8e8e6] transition-all group"
          >
            <div className="w-8 h-8 rounded-xl bg-amber-700 text-amber-100 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="font-serif font-bold text-sm text-[#3A3A28]">El Cronista IA</div>
            <p className="text-xs text-gray-500 mt-0.5">Pregunta sobre historia local</p>
          </Link>
        </div>

        <Link
          to="/"
          className="inline-flex items-center gap-2 bg-[#5A5A40] hover:bg-[#4a4a30] text-white px-7 py-3 rounded-full text-sm font-semibold transition-all shadow-sm active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a la galería principal
        </Link>
      </div>
    </div>
  );
}
