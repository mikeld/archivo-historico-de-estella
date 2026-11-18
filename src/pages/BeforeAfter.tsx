import React from "react";
import { BeforeAfterSlider, ComparisonPair } from "../components/BeforeAfterSlider";
import { History, Sparkles, MapPin, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const CURATED_PAIRS: ComparisonPair[] = [
  {
    id: "fueros-evolucion",
    title: "La Plaza de los Fueros: Del Kiosco Histórico al Estella Moderno",
    location: "Plaza de los Fueros",
    beforeYear: "Principios S. XX",
    beforeImage: "/archive-photos/fb_10243020713750847_0.jpg",
    beforeNote: "Kiosco central de música de madera y hierro forjado, rodeado por las galerías tradicionales.",
    afterYear: "Años 60 / 70",
    afterImage: "/archive-photos/fb_3230739650464533_0.jpg",
    afterNote: "Llegada del tráfico rodado, árboles crecidos y bullicio comercial en las galerías porticadas.",
    historyText: "La Plaza de los Fueros ha sido y sigue siendo el corazón latente de Estella-Lizarra. Lugar de ferias, mercados semanales y centro indiscutible de las fiestas patronales de agosto."
  },
  {
    id: "trenico-estacion",
    title: "El Ferrocarril Vasco-Navarro: De las Obras a la Locomotora 'El Trenico'",
    location: "Estación del Trenico (Ferrocarril)",
    beforeYear: "1924 (Obras)",
    beforeImage: "/archive-photos/fb_2234263646778810_0.jpg",
    beforeNote: "Construcción de los andenes y la marquesina de la estación terminal de Estella.",
    afterYear: "Años 50 / 60",
    afterImage: "/archive-photos/fb_3236996239838874_0.jpg",
    afterNote: "Locomotora eléctrica y vagones en plena actividad conectando la ciudad con Vitoria y Bergara.",
    historyText: "El mítico 'Trenico' vertebró Tierra Estella durante casi cuatro décadas (1927-1967). Su cierre supuso un hito en la memoria colectiva, hoy reconvertido en la popular Vía Verde del ferrocarril."
  },
  {
    id: "san-pedro-escalinata",
    title: "San Pedro de la Rúa: Claustro Mayor y la Escalinata Monumental",
    location: "San Pedro de la Rúa",
    beforeYear: "Foto Antigua",
    beforeImage: "/archive-photos/fb_10243964074547936_0.jpg",
    beforeNote: "Perspectiva histórica del entorno amurallado y restos del castillo sobre el barrio de San Pedro.",
    afterYear: "Celebración Popular",
    afterImage: "/archive-photos/fb_3277076722497492_0.jpg",
    afterNote: "Cientos de vecinos congregados en la imponente escalinata durante un acontecimiento cívico-religioso.",
    historyText: "La iglesia de San Pedro de la Rúa, coronando la colina frente al Palacio de los Reyes de Navarra, es el emblema monumental más célebre de Estella-Lizarra."
  }
];

export function BeforeAfter() {
  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#e8e8e6] shadow-sm text-center md:text-left flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center justify-center md:justify-start gap-2 text-xs font-bold uppercase tracking-wider text-[#5A5A40] mb-1.5">
            <History className="w-4 h-4 text-amber-600" />
            <span>Viaje en el Tiempo</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-serif font-bold text-gray-900 tracking-tight">
            Antes y Después: Estella en el Tiempo
          </h1>
          <p className="text-sm text-gray-600 mt-2 max-w-2xl leading-relaxed">
            Arrastra la cortinilla en cada comparador para desvelar cómo han cambiado las calles, plazas e infraestructuras de Estella-Lizarra a lo largo del siglo XX.
          </p>
        </div>

        <Link
          to="/mapa"
          className="inline-flex items-center gap-2 bg-[#5A5A40] hover:bg-[#4a4a30] text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-sm transition-all self-center md:self-auto shrink-0"
        >
          <MapPin className="w-4 h-4 text-amber-200" />
          <span>Ver en el Mapa</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Sliders List */}
      <div className="space-y-10">
        {CURATED_PAIRS.map((pair) => (
          <BeforeAfterSlider key={pair.id} pair={pair} />
        ))}
      </div>

      {/* Footer call to action */}
      <div className="bg-[#eae8e3]/60 border border-[#d8d6ce] rounded-3xl p-6 text-center space-y-3">
        <h4 className="font-serif font-bold text-gray-800 text-lg">
          ¿Tienes fotos antiguas del mismo rincón?
        </h4>
        <p className="text-xs text-gray-600 max-w-md mx-auto leading-relaxed">
          Puedes colaborar subiendo fotografías de tu familia o sugiriendo correcciones para enriquecer este archivo colectivo.
        </p>
        <Link
          to="/upload"
          className="inline-block bg-[#5A5A40] text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm hover:bg-[#4a4a30] transition-colors"
        >
          Aportar fotografía al archivo
        </Link>
      </div>
    </div>
  );
}
