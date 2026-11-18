import React, { useState, useRef, useCallback } from "react";
import { Sparkles, Calendar, MapPin, Eye } from "lucide-react";

export interface ComparisonPair {
  id: string;
  title: string;
  location: string;
  beforeYear: string;
  beforeImage: string;
  beforeNote: string;
  afterYear: string;
  afterImage: string;
  afterNote: string;
  historyText: string;
}

export interface BeforeAfterSliderProps {
  pair: ComparisonPair;
  key?: string;
}

export function BeforeAfterSlider({ pair }: BeforeAfterSliderProps) {
  const [sliderPos, setSliderPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = Math.max(0, Math.min((x / rect.width) * 100, 100));
    setSliderPos(percent);
  }, []);

  const handleTouchMove = (e: React.TouchEvent) => {
    handleMove(e.touches[0].clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    handleMove(e.clientX);
  };

  return (
    <div className="bg-white rounded-3xl border border-[#e8e8e6] shadow-sm overflow-hidden flex flex-col">
      {/* Slider Viewport */}
      <div
        ref={containerRef}
        className="relative w-full aspect-[4/3] sm:aspect-[16/10] overflow-hidden select-none cursor-ew-resize bg-black"
        onMouseDown={() => setIsDragging(true)}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => setIsDragging(false)}
        onMouseMove={handleMouseMove}
        onTouchMove={handleTouchMove}
      >
        {/* After Image (Background) */}
        <img
          src={pair.afterImage}
          alt={pair.afterNote}
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
        <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-md text-white text-[11px] font-bold px-3 py-1 rounded-full shadow-lg pointer-events-none">
          {pair.afterYear}
        </div>

        {/* Before Image (Foreground Clipped) */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ width: `${sliderPos}%` }}
        >
          <img
            src={pair.beforeImage}
            alt={pair.beforeNote}
            className="absolute inset-0 w-full h-full object-cover max-w-none"
            style={{ width: containerRef.current ? `${containerRef.current.clientWidth}px` : "100%" }}
            draggable={false}
          />
          <div className="absolute top-4 left-4 bg-amber-950/80 backdrop-blur-md text-amber-200 text-[11px] font-bold px-3 py-1 rounded-full shadow-lg border border-amber-600/30 pointer-events-none">
            {pair.beforeYear}
          </div>
        </div>

        {/* Divider Line & Handle */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-white shadow-2xl cursor-ew-resize pointer-events-none"
          style={{ left: `${sliderPos}%` }}
        >
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-white shadow-xl flex items-center justify-center text-gray-800 border-2 border-[#5A5A40]">
            <svg className="w-4 h-4 fill-current text-[#5A5A40]" viewBox="0 0 24 24">
              <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12l-4.58 4.59z M15.41 16.59L14 18l-6-6 6-6 1.41 1.41L10.83 12l4.58 4.59z" />
            </svg>
          </div>
        </div>

        {/* Floating helper instruction */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm text-white/90 text-[10px] uppercase tracking-wider px-3 py-1 rounded-full pointer-events-none sm:opacity-0 hover:opacity-100 transition-opacity">
          Desliza para comparar
        </div>
      </div>

      {/* Info Card */}
      <div className="p-6 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-800">
            <MapPin className="w-3.5 h-3.5 text-amber-600" />
            <span>{pair.location}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>{pair.beforeYear}</span>
            <span>⟷</span>
            <span>{pair.afterYear}</span>
          </div>
        </div>

        <h3 className="font-serif font-bold text-xl text-gray-900 leading-snug">
          {pair.title}
        </h3>

        <p className="text-sm text-gray-600 leading-relaxed font-sans">
          {pair.historyText}
        </p>

        <div className="pt-2 border-t border-gray-100 grid grid-cols-2 gap-3 text-xs text-gray-500">
          <div>
            <strong className="text-gray-800 block text-[11px] mb-0.5">{pair.beforeYear}:</strong>
            <span>{pair.beforeNote}</span>
          </div>
          <div>
            <strong className="text-gray-800 block text-[11px] mb-0.5">{pair.afterYear}:</strong>
            <span>{pair.afterNote}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
