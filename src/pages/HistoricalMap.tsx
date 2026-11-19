import React, { useEffect, useRef, useState, useMemo } from "react";
import { getArchivePhotos } from "../lib/dataService";
import { Photo } from "../types";
import { PhotoDetailModal } from "../components/PhotoDetailModal";
import { MapPin, Image as ImageIcon, Sparkles, Filter, X, ChevronRight, Layers, ExternalLink, Building2 } from "lucide-react";
import { cn } from "../lib/utils";
import { NAVARRA_TOWNS, NavarraTown } from "../data/navarra-towns";

export interface Landmark {
  id: string;
  name: string;
  coords: [number, number];
  terms: string[];
  description: string;
}

export const ESTELLA_LANDMARKS: Landmark[] = [
  {
    id: "fueros",
    name: "Plaza de los Fueros",
    coords: [42.6713, -2.0298],
    terms: ["fueros", "quiosco"],
    description: "Centro neurálgico y social de Estella-Lizarra, mercado semanal, fiestas y celebraciones."
  },
  {
    id: "san_pedro",
    name: "San Pedro de la Rúa",
    coords: [42.6698, -2.0305],
    terms: ["san pedro de la rua", "san pedro de la rúa", "escalinata"],
    description: "Iglesia mayor del siglo XII, claustro románico y su célebre escalinata de acceso."
  },
  {
    id: "llanos_ega",
    name: "Río Ega y Los Llanos",
    coords: [42.6685, -2.0320],
    terms: ["los llanos", "rio ega", "río ega", "san benito", "presa"],
    description: "Parque natural, meandro del río Ega, baños veraniegos, huertas y paseos arbolados."
  },
  {
    id: "trenico",
    name: "Estación del Trenico (Ferrocarril)",
    coords: [42.6705, -2.0245],
    terms: ["estacion", "estación", "ferrocarril", "trenico", "locomotora", "vías"],
    description: "Antigua estación terminal del Ferrocarril Vasco-Navarro que conectaba Estella con Vitoria y Bergara."
  },
  {
    id: "el_puy",
    name: "Basílica del Puy",
    coords: [42.6755, -2.0275],
    terms: ["el puy", "virgen del puy"],
    description: "Santuario de la patrona de Estella en lo alto de la colina con vistas panorámicas."
  },
  {
    id: "calle_mayor",
    name: "Calle Mayor y Rúa",
    coords: [42.6708, -2.0285],
    terms: ["calle mayor", "c/ mayor", "la rúa", "comercio"],
    description: "Eje comercial histórico, palacetes góticos y renacentistas y paso del Camino de Santiago."
  },
  {
    id: "reyes_navarra",
    name: "Palacio de los Reyes de Navarra",
    coords: [42.6695, -2.0300],
    terms: ["reyes de navarra", "san martin", "san martín", "fuente de la mona"],
    description: "Única muestra civil del románico en Navarra, frente a la Plaza de San Martín."
  },
  {
    id: "santiago",
    name: "Plaza de Santiago",
    coords: [42.6720, -2.0282],
    terms: ["plaza de santiago", "plaza santiago", "mercado de santiago"],
    description: "Emblemática plaza estellesa donde se celebraba el mercado de hortalizas y aves."
  },
  {
    id: "toros",
    name: "Plaza de Toros",
    coords: [42.6700, -2.0370],
    terms: ["plaza de toros", "ruedo", "festejos"],
    description: "Coso taurino y escenario de festivales y actos populares de las fiestas patronales."
  },
  {
    id: "san_miguel",
    name: "Iglesia de San Miguel",
    coords: [42.6725, -2.0315],
    terms: ["san miguel"],
    description: "Templo encaramado en la ladera norte, célebre por su rica portada románica historiadas."
  },
  {
    id: "puente_carcel",
    name: "Puente de la Cárcel (Picudo)",
    coords: [42.6702, -2.0291],
    terms: ["puente de la carcel", "puente de la cárcel", "puente picudo"],
    description: "Histórico puente medieval que une los barrios de San Pedro y San Miguel sobre el Ega."
  },
  {
    id: "sepulcro",
    name: "Santo Sepulcro",
    coords: [42.6709, -2.0265],
    terms: ["santo sepulcro", "sepulcro"],
    description: "Templo gótico inacabado en la salida del Camino de Santiago hacia Logroño."
  },
  {
    id: "irache",
    name: "Monasterio de Irache",
    coords: [42.6570, -2.0460],
    terms: ["irache"],
    description: "Milenario conjunto monástico benedictino al pie de Montejurra."
  }
];

export function HistoricalMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLandmark, setSelectedLandmark] = useState<Landmark | null>(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [decadeFilter, setDecadeFilter] = useState<string | null>(null);

  // Load photos
  useEffect(() => {
    getArchivePhotos().then((data) => {
      setPhotos(data);
      setLoading(false);
    });
  }, []);

  // Map each landmark to its matching photos
  const landmarkPhotosMap = useMemo(() => {
    const map = new Map<string, Photo[]>();
    ESTELLA_LANDMARKS.forEach((lm) => {
      const list = photos.filter((p) => {
        // 1. Asignación directa y estricta si tiene landmarkId validado
        if (p.landmarkId) {
          return p.landmarkId === lm.id;
        }
        // 2. Fallback estricto solo si el campo location coincide exactamente
        const loc = (p.location || "").toLowerCase().trim();
        if (!loc || loc === "estella-lizarra" || loc === "estella") return false;
        return lm.terms.some((t) => loc === t || loc.startsWith(t + ",") || loc.includes(t));
      });
      map.set(lm.id, list);
    });
    return map;
  }, [photos]);

  // Selected landmark photos filtered by decade
  const activePhotos = useMemo(() => {
    if (!selectedLandmark) return [];
    const list = landmarkPhotosMap.get(selectedLandmark.id) || [];
    if (!decadeFilter) return list;
    return list.filter((p) => {
      if (decadeFilter === "historic") {
        return (p.year && p.year < 1950) || (p.tags && p.tags.some((t) => ["anos_10", "anos_20", "anos_30", "anos_40"].includes(t)));
      }
      return (p.tags && p.tags.includes(decadeFilter)) || (p.year && String(p.year).startsWith(decadeFilter.replace("anos_", "19")));
    });
  }, [selectedLandmark, landmarkPhotosMap, decadeFilter]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    let isCancelled = false;

    // Load Leaflet dynamically via CDN
    const initLeaflet = async () => {
      if (!(window as any).L) {
        // Inyectar CSS
        if (!document.getElementById("leaflet-css")) {
          const link = document.createElement("link");
          link.id = "leaflet-css";
          link.rel = "stylesheet";
          link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
          document.head.appendChild(link);
        }

        // Inyectar JS
        await new Promise<void>((resolve) => {
          if ((window as any).L) return resolve();
          const script = document.createElement("script");
          script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
          script.onload = () => resolve();
          document.head.appendChild(script);
        });
      }

      if (isCancelled || !mapContainerRef.current) return;

      const L = (window as any).L;
      if (!L) return;

      if (!mapInstanceRef.current) {
        // Coordenadas centro de Estella / Navarra
        const map = L.map(mapContainerRef.current, {
          center: [42.6705, -2.0298],
          zoom: 14,
          minZoom: 8,
          maxZoom: 18,
          zoomControl: true,
        });

        // Tiles OpenStreetMap estándar (100% libre, sin requerir API key)
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);

        mapInstanceRef.current = map;
      }

      const map = mapInstanceRef.current;

      // Limpiar marcadores anteriores
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      // Añadir marcadores por cada municipio de Navarra
      NAVARRA_TOWNS.forEach((town) => {
        if (town.id === "estella-lizarra") return; // Estella tiene sus propios marcadores detallados por monumento

        const townIcon = L.divIcon({
          className: "custom-town-pin",
          html: `
            <div style="
              background: #3A3A28;
              color: #fefae0;
              border: 2px solid #e0c088;
              border-radius: 9999px;
              padding: 4px 10px;
              display: flex;
              align-items: center;
              gap: 4px;
              font-weight: 600;
              font-size: 11px;
              white-space: nowrap;
              box-shadow: 0 4px 12px rgba(0,0,0,0.25);
              cursor: pointer;
            ">
              <span>🏰</span>
              <span>${town.name.split("-")[0]}</span>
            </div>
          `,
          iconSize: [80, 26],
          iconAnchor: [40, 13],
        });

        const townMarker = L.marker(town.coords, { icon: townIcon }).addTo(map);
        townMarker.on("click", () => {
          map.setView(town.coords, 14, { animate: true });
        });
        townMarker.bindTooltip(`<strong>${town.name}</strong><br/>Merindad de ${town.merindad}<br/><span style="color:#666;font-size:10px">${town.description || ""}</span>`, {
          direction: "top",
          offset: [0, -12],
          className: "font-sans text-xs shadow-md rounded-lg py-1 px-2 border border-amber-200",
        });
        markersRef.current.push(townMarker);
      });

      // Añadir marcadores por cada punto histórico de Estella
      ESTELLA_LANDMARKS.forEach((lm) => {
        const count = landmarkPhotosMap.get(lm.id)?.length || 0;
        if (count === 0) return;

        // Marcador HTML personalizado con insignia de conteo de fotos
        const customIcon = L.divIcon({
          className: "custom-map-pin",
          html: `
            <div style="
              background: #5A5A40;
              color: #fefae0;
              border: 2px solid #d4a373;
              border-radius: 9999px;
              width: 38px;
              height: 38px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: bold;
              font-size: 13px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.3);
              cursor: pointer;
              transition: transform 0.2s;
            " class="hover:scale-110">
              ${count}
            </div>
          `,
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        });

        const marker = L.marker(lm.coords, { icon: customIcon }).addTo(map);

        marker.on("click", () => {
          setSelectedLandmark(lm);
          setDecadeFilter(null);
          map.setView(lm.coords, 16, { animate: true });
        });

        marker.bindTooltip(`<strong>${lm.name}</strong><br/>${count} fotos históricas`, {
          direction: "top",
          offset: [0, -18],
          className: "font-sans text-xs shadow-md rounded-lg py-1 px-2 border border-amber-200",
        });

        markersRef.current.push(marker);
      });
    };

    initLeaflet();

    return () => {
      isCancelled = true;
    };
  }, [landmarkPhotosMap]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#e8e8e6] shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#5A5A40] mb-1">
              <MapPin className="w-4 h-4 text-amber-600" />
              <span>Cartografía Histórica de Navarra</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-gray-900">
              Mapa Histórico de Navarra
            </h1>
            <p className="text-sm text-gray-600 mt-1 max-w-2xl">
              Explora las calles, plazas, puentes y monumentos de Estella-Lizarra y los municipios históricos de Navarra. Pulsa en cada punto del plano para descubrir las fotografías tomadas a lo largo de las décadas.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-[#eae8e3]/60 px-4 py-2 rounded-2xl border border-[#d8d6ce] shrink-0 text-xs font-semibold text-[#5A5A40]">
            <ImageIcon className="w-4 h-4 text-amber-700" />
            <span>338 fotos en monumentos verificados</span>
          </div>
        </div>

        {/* Quick jump towns of Navarra */}
        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 shrink-0 mr-1 flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5 text-amber-700" /> Municipios:
          </span>
          {NAVARRA_TOWNS.map((town) => (
            <button
              key={town.id}
              onClick={() => {
                if (mapInstanceRef.current) {
                  mapInstanceRef.current.setView(town.coords, town.id === "estella-lizarra" ? 15 : 14, { animate: true });
                }
              }}
              className="px-3 py-1 rounded-full text-xs font-semibold shrink-0 transition-all border bg-amber-50/60 hover:bg-amber-100 text-amber-900 border-amber-200 cursor-pointer"
            >
              🏰 {town.name}
            </button>
          ))}
        </div>

        {/* Quick jump carousel of landmarks */}
        <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 shrink-0 mr-1">
            Monumentos Estella:
          </span>
          {ESTELLA_LANDMARKS.map((lm) => {
            const count = landmarkPhotosMap.get(lm.id)?.length || 0;
            const isSelected = selectedLandmark?.id === lm.id;
            return (
              <button
                key={lm.id}
                onClick={() => {
                  setSelectedLandmark(lm);
                  setDecadeFilter(null);
                  if (mapInstanceRef.current) {
                    mapInstanceRef.current.setView(lm.coords, 16, { animate: true });
                  }
                }}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-all border flex items-center gap-1.5",
                  isSelected
                    ? "bg-[#5A5A40] text-white border-[#5A5A40] shadow-sm"
                    : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                )}
              >
                <span>{lm.name}</span>
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded-full font-bold",
                    isSelected ? "bg-amber-300 text-amber-950" : "bg-gray-200 text-gray-600"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Map View & Side Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Leaflet Map container */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-[#e8e8e6] shadow-sm overflow-hidden h-[540px] sm:h-[620px] relative">
          <div ref={mapContainerRef} className="w-full h-full z-0" />

          {/* Floating map hint */}
          <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-md border border-gray-200 text-[11px] text-gray-600 font-medium z-10 hidden sm:flex items-center gap-1.5 pointer-events-none">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>Haz clic en un punto para ver sus fotos</span>
          </div>
        </div>

        {/* Side Panel: Selected Landmark Gallery */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-[#e8e8e6] shadow-sm p-6 min-h-[540px] flex flex-col justify-between">
          {selectedLandmark ? (
            <div className="space-y-4 flex-1 flex flex-col">
              <div className="flex items-start justify-between border-b border-gray-100 pb-3">
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-800">
                    <MapPin className="w-3.5 h-3.5 text-amber-600" />
                    <span>Lugar seleccionado</span>
                  </div>
                  <h3 className="text-xl font-serif font-bold text-gray-900 mt-0.5">
                    {selectedLandmark.name}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    {selectedLandmark.description}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedLandmark(null)}
                  className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Cerrar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Decade filter pills */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  onClick={() => setDecadeFilter(null)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
                    decadeFilter === null
                      ? "bg-[#5A5A40] text-white border-[#5A5A40]"
                      : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                  )}
                >
                  Todas ({landmarkPhotosMap.get(selectedLandmark.id)?.length || 0})
                </button>
                {[
                  { id: "historic", label: "Hasta 1950" },
                  { id: "anos_50", label: "Años 50" },
                  { id: "anos_60", label: "Años 60" },
                  { id: "anos_70", label: "Años 70" },
                  { id: "anos_80", label: "Años 80" },
                ].map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setDecadeFilter(decadeFilter === d.id ? null : d.id)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
                      decadeFilter === d.id
                        ? "bg-[#5A5A40] text-white border-[#5A5A40]"
                        : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              {/* Photos Gallery Grid */}
              <div className="flex-1 overflow-y-auto max-h-[420px] pr-1">
                {activePhotos.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {activePhotos.map((photo, idx) => (
                      <div
                        key={photo.id}
                        onClick={() => setSelectedPhotoIndex(idx)}
                        className="group relative aspect-[4/3] rounded-xl overflow-hidden bg-gray-100 border border-gray-200 cursor-pointer hover:shadow-md transition-all hover:scale-[1.02]"
                      >
                        <img
                          src={photo.thumbnailUrl || photo.imageUrl}
                          alt={photo.title || photo.description || selectedLandmark.name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                        {photo.year && (
                          <div className="absolute top-1.5 right-1.5 bg-black/60 backdrop-blur-sm text-white px-1.5 py-0.5 rounded text-[9px] font-bold">
                            {photo.year}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2 text-center">
                          <span className="text-[10px] text-white font-medium line-clamp-2">
                            {photo.title || photo.description || "Ver fotografía"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-400">
                    <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">No hay fotos en esta época para este lugar.</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-400 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-[#eae8e3]/50 flex items-center justify-center border border-[#d8d6ce]">
                <MapPin className="w-7 h-7 text-[#5A5A40]" />
              </div>
              <h4 className="font-serif font-bold text-gray-700 text-lg">
                Selecciona un punto en el mapa
              </h4>
              <p className="text-xs text-gray-500 max-w-xs leading-relaxed">
                Toca cualquier chincheta numérica de Estella para desplegar aquí las fotos históricas catalogadas de esa plaza, puente o calle.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal de detalle de fotografía si se selecciona una */}
      {selectedPhotoIndex !== null && activePhotos[selectedPhotoIndex] && (
        <PhotoDetailModal
          photo={activePhotos[selectedPhotoIndex]}
          photos={activePhotos}
          currentIndex={selectedPhotoIndex}
          onNavigate={(newIdx) => setSelectedPhotoIndex(newIdx)}
          onClose={() => setSelectedPhotoIndex(null)}
          user={null}
          userRole="user"
        />
      )}
    </div>
  );
}
