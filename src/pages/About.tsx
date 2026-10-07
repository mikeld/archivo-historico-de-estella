import React from "react";
import { BookOpen, Library, Landmark, Users, Info } from "lucide-react";

export function About() {
  return (
    <div className="max-w-4xl mx-auto space-y-12">
      <div className="text-center space-y-4 mb-12 bg-white/80 backdrop-blur-sm p-10 rounded-3xl border border-[#e8e8e6] shadow-sm">
        <Info className="w-12 h-12 text-[#5A5A40] mx-auto opacity-80" />
        <h1 className="text-4xl font-serif text-[#3A3A28] tracking-tight">El Proyecto</h1>
        <p className="text-gray-600 max-w-xl mx-auto text-lg leading-relaxed">
          Por qué es importante el Archivo Histórico de Estella - Lizarrako Artxibo Historikoa,
          nuestras fuentes y dónde puedes encontrar recursos libres para colaborar.
        </p>
      </div>

      <div className="bg-white rounded-3xl p-8 border border-[#e8e8e6] shadow-sm space-y-6">
        <h2 className="text-2xl font-serif text-[#3A3A28] flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-[#5A5A40]" />
          La importancia del Archivo y las Fuentes
        </h2>
        <div className="text-gray-700 space-y-4 leading-relaxed">
          <p>
            Preservar la memoria gráfica de Estella-Lizarra es fundamental para entender nuestra identidad, 
            nuestra historia y cómo ha evolucionado nuestra ciudad. Cada fotografía es un fragmento de tiempo 
            que cuenta una historia sobre nuestros antepasados, nuestros edificios y nuestras costumbres.
          </p>
          <p>
            Al crear un archivo digital abierto, aseguramos que este patrimonio no se pierda en cajas olvidadas, 
            sino que sea accesible para todos los ciudadanos, investigadores y curiosos. La correcta atribución 
            y referenciación de las fuentes es vital para mantener el rigor histórico y respetar los derechos de autor.
          </p>
        </div>
      </div>

      <div className="bg-[#EAE8E3]/50 rounded-3xl p-8 border border-[#e8e8e6] shadow-sm space-y-8">
        <h2 className="text-2xl font-serif text-[#3A3A28] flex items-center gap-3 border-b border-[#e8e8e6] pb-4">
          <Landmark className="w-6 h-6 text-[#5A5A40]" />
          ¿Dónde podemos encontrar recursos?
        </h2>
        
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-[#e8e8e6] flex gap-4">
            <div className="mt-1"><Library className="w-6 h-6 text-blue-600" /></div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">1. Archivo Real y General de Navarra (Fototeca)</h3>
              <p className="text-gray-600 text-sm mb-3">Es la fuente más fiable. El Gobierno de Navarra tiene digitalizados miles de fondos.</p>
              <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
                <strong>Qué buscar:</strong> Filtra por "Estella" y "Plaza de los Fueros". Muchas fotos de principios del siglo XX (como las de los Hermanos Aguirre o Mauro Ibáñez) ya están en dominio público porque han pasado más de 70-80 años desde la muerte del autor.
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-[#e8e8e6] flex gap-4">
            <div className="mt-1"><BookOpen className="w-6 h-6 text-red-600" /></div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">2. Biblioteca Digital Hispánica (BNE)</h3>
              <p className="text-gray-600 text-sm mb-3">La Biblioteca Nacional de España tiene una colección inmensa de postales antiguas.</p>
              <div className="bg-red-50 p-3 rounded-lg text-sm text-red-800">
                <strong>Búsqueda:</strong> "Estella Plaza" o "Estella mercado".<br/>
                <strong>Ventaja:</strong> Las postales de antes de 1920-1930 suelen estar libres de derechos y puedes descargarlas en alta resolución.
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-[#e8e8e6] flex gap-4">
            <div className="mt-1"><Landmark className="w-6 h-6 text-green-600" /></div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">3. Archivo Municipal de Estella-Lizarra</h3>
              <p className="text-gray-600 text-sm">
                Aunque no siempre tienen todo online, puedes contactar con ellos o revisar su sección de patrimonio. 
                A veces publican galerías históricas en la web municipal para uso ciudadano.
              </p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-[#e8e8e6] flex gap-4">
            <div className="mt-1"><Library className="w-6 h-6 text-purple-600" /></div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">4. Fondos de Instituciones Culturales</h3>
              <p className="text-gray-600 text-sm mb-3">Eusko Ikaskuntza / Auñamendi, entre otros.</p>
              <div className="bg-purple-50 p-3 rounded-lg text-sm text-purple-800">
                Tienen fotografías históricas de Navarra. Debes revisar si la licencia es "CC-BY" (que permite uso citando al autor).
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-[#e8e8e6] flex gap-4">
            <div className="mt-1"><Users className="w-6 h-6 text-orange-600" /></div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">5. Grupos de Facebook y Redes de Memoria Histórica</h3>
              <p className="text-gray-600 text-sm mb-3">Hay grupos como "Estella-Lizarra en el recuerdo" donde los vecinos comparten fotos familiares.</p>
              <div className="bg-orange-50 p-3 rounded-lg text-sm text-orange-800">
                <strong>Importante:</strong> Aquí no tienes la propiedad legal, pero puedes pedir permiso directamente al usuario que subió la foto. A la gente de Estella suele encantarle que sus fotos se usen para dar a conocer la ciudad si les mencionas o etiquetas.
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
