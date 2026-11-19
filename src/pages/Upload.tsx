import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  db,
  storage,
  handleFirestoreError,
  OperationType,
} from "../lib/firebase";
import { User } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import {
  ImagePlus,
  AlertCircle,
  CheckCircle2,
  Loader2,
  UploadCloud,
  Sparkles,
  Building2,
  Users,
  BookOpen,
} from "lucide-react";
import { Photo, Role } from "../types";
import imageCompression from 'browser-image-compression';
import { ARCHIVO_IA_URL } from "../services/cronistaService";
import { NAVARRA_TOWNS } from "../data/navarra-towns";

interface UploadProps {
  user: User | null;
  userRole: Role;
}

interface PhotoFormData {
  title: string;
  imageUrl: string;
  owner: string;
  photographer: string;
  town: string;
  people: string;
  anecdote: string;
  location: string;
  collection: string;
  referenceCode: string;
  license: string;
  physicalFormat: string;
  year: number;
  description: string;
  quality: string;
  priority: string;
  isRetouched: boolean;
  source: string;
  tags: string;
}

export function Upload({ user, userRole }: UploadProps) {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<"file" | "url">("url");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<PhotoFormData>({
    defaultValues: {
      quality: "media",
      priority: "media",
      isRetouched: false,
      source: "",
    },
  });

  const urlWatch = watch("imageUrl");

  React.useEffect(() => {
    if (uploadMode === "url") {
      setPreviewUrl(urlWatch || null);
    }
  }, [uploadMode, urlWatch]);

  if (!user) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center max-w-md mx-auto mt-12">
        <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-medium text-gray-900 mb-2">
          Acceso Requerido
        </h2>
        <p className="text-gray-500 mb-6">
          Necesitas iniciar sesión para subir fotos al archivo.
        </p>
      </div>
    );
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (selected.size > 5 * 1024 * 1024) {
        setError("La imagen es demasiado grande (máximo 5MB)");
        return;
      }
      setFile(selected);
      setPreviewUrl(URL.createObjectURL(selected));
      setError(null);
    }
  };

  const [aiLoading, setAiLoading] = useState(false);

  const handleAiDescribe = async () => {
    if (!file) return;
    setAiLoading(true);
    
    try {
      // Imagen reducida (máx. 1024 px) para la IA del servidor; exige sesión (token de Firebase)
      const small = await imageCompression(file, { maxWidthOrHeight: 1024, maxSizeMB: 0.8, fileType: "image/jpeg" });
      const image = await imageCompression.getDataUrlFromFile(small);
      const resp = await fetch(ARCHIVO_IA_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user!.getIdToken()}`,
        },
        body: JSON.stringify({ accion: "describirFoto", image }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || `HTTP ${resp.status}`);

      // Auto-fill form
      const currentData = watch();
      if (!currentData.description && result.description) {
         setValue("description", result.description);
      }
      if (!currentData.year && result.year) {
         setValue("year", result.year);
      }
      if (!currentData.tags && result.tags) {
         setValue("tags", result.tags.join(", "));
      }
      setValue("isRetouched", (result.isRetouched ? "true" : "false") as any);
      
    } catch(err) {
      console.error(err);
      setError(err instanceof Error && err.message ? err.message : "No se pudo analizar la imagen con IA");
    } finally {
      setAiLoading(false);
    }
  };

  const onSubmit = async (data: PhotoFormData) => {
    if (uploadMode === "file" && !file) {
      setError("Por favor, selecciona una imagen para subir.");
      return;
    }
    if (uploadMode === "url" && !data.imageUrl) {
      setError("Por favor, introduce una URL de imagen.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      let downloadUrl = data.imageUrl || "";
      const photoId = crypto.randomUUID();

      if (uploadMode === "file" && file) {
        try {
          if (!storage)
            throw new Error("Firebase Storage no está configurado.");
            
          // Compress the image before uploading
          setAiLoading(true); // Re-use the loading state or add a new one, but for now we can just show compression takes time
          const options = {
            maxSizeMB: 1,
            maxWidthOrHeight: 1920,
            useWebWorker: true
          };
          let fileToUpload = file;
          try {
             const compressedFile = await imageCompression(file, options);
             fileToUpload = compressedFile;
          } catch (error) {
             console.error("Error compressing image, uploading original", error);
          } finally {
             setAiLoading(false);
          }

          const storageRef = ref(storage, `photos/${photoId}_${fileToUpload.name}`);
          const snapshot = await uploadBytes(storageRef, fileToUpload);
          downloadUrl = await getDownloadURL(snapshot.ref);
        } catch (storageErr: any) {
          console.error("Storage error:", storageErr);

          // Check if it's the specific Error 404 or CORS which means the bucket doesn't exist
          if (
            storageErr?.message?.includes("CORS") ||
            storageErr?.message?.includes("404") ||
            storageErr?.code === "storage/object-not-found" ||
            storageErr?.code === "storage/unauthorized" ||
            storageErr?.message?.includes("Not Found") ||
            storageErr?.message?.includes("bucket")
          ) {
            throw new Error(
              "Parece que Firebase Storage no está activado. Ve a tu consola de Firebase > Storage y pulsa 'Comenzar' para crear el bucket por defecto. Una vez creado, intenta subir la foto de nuevo.",
            );
          }

          throw new Error(
            "No se pudo subir la imagen al almacenamiento. " +
              storageErr.message,
          );
        }
      }

      // Generate basic search terms
      const searchTerms = (data.description || "")
        .toLowerCase()
        .replace(/[^\w\s\u00C0-\u017F]/g, "")
        .split(/\s+/)
        .filter((term) => term.length > 2);

      if (data.year) searchTerms.push(data.year.toString());
      if (data.owner) searchTerms.push(data.owner.toLowerCase());

      let customTags: string[] = [];
      if (data.tags) {
        customTags = data.tags
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter((t) => t.length > 0);
        customTags.forEach((t) => searchTerms.push(t));
      }

      let newPhoto: Photo = {
        id: photoId,
        imageUrl: downloadUrl,
        thumbnailUrl: downloadUrl,
        owner: data.owner,
        quality: data.quality || "media",
        priority: data.priority || "media",
        isRetouched:
          data.isRetouched === true || data.isRetouched === ("true" as any),
        uploadedBy: user.uid,
        createdAt: serverTimestamp(),
        tags: customTags.slice(0, 20),
        searchTerms: Array.from(new Set(searchTerms)).slice(0, 100), // max 100 terms
      };

      if (data.year) newPhoto.year = Number(data.year);
      if (data.description) newPhoto.description = data.description;
      if (data.source) newPhoto.source = data.source;
      if (data.title) newPhoto.title = data.title;
      if (data.location) newPhoto.location = data.location;
      if (data.photographer) newPhoto.photographer = data.photographer;
      if (data.collection) newPhoto.collection = data.collection;
      if (data.referenceCode) newPhoto.referenceCode = data.referenceCode;
      if (data.license) newPhoto.license = data.license;
      if (data.physicalFormat) newPhoto.physicalFormat = data.physicalFormat;

      // Asignación de Pueblo, Merindad, Personas identificadas y Memoria Oral
      if (data.town) {
        newPhoto.town = data.town;
        const tInfo = NAVARRA_TOWNS.find((t) => t.name === data.town || t.id === data.town);
        if (tInfo) {
          newPhoto.townSlug = tInfo.id;
          newPhoto.merindad = tInfo.merindad;
        }
      }
      if (data.people) {
        newPhoto.people = data.people
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean);
        newPhoto.people.forEach((p) => searchTerms.push(p.toLowerCase()));
      }
      if (data.anecdote && data.anecdote.trim()) {
        const oralHistoryText = `📖 Memoria Oral: ${data.anecdote.trim()}`;
        newPhoto.description = newPhoto.description
          ? `${newPhoto.description}\n\n${oralHistoryText}`
          : oralHistoryText;
        searchTerms.push("memoria oral", "historia viva");
      }

      console.log("Photo to save:", newPhoto);
      console.log("Calling setDoc on db:", db);

      // Add a timeout to prevent setDoc from hanging forever if DB is unreachable
      // Los editores publican directamente; el resto queda pendiente de revisión (panel de admin)
      const isEditor =
        userRole === "admin" ||
        userRole === "editor" ||
        user.email === "mikeldiaz0@gmail.com" ||
        user.email === "estellaescapecity@gmail.com";
      const setDocPromise = setDoc(doc(db, isEditor ? "photos" : "photos_pending", photoId), newPhoto);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                "Timeout: La base de datos no responde después de 15 segundos. Asegúrate de que el nombre de la base de datos es correcto y hay conexión.",
              ),
            ),
          15000,
        ),
      );

      await Promise.race([setDocPromise, timeoutPromise]);

      console.log("setDoc finished");
      if (!isEditor) {
        alert("¡Gracias! Tu fotografía queda pendiente de revisión y se publicará cuando la aprobemos.");
      }
      navigate("/");
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes("almacenamiento") ||
          err.message.includes("Timeout"))
      ) {
        setError(err.message);
      } else {
        try {
          handleFirestoreError(err, OperationType.CREATE, "photos");
        } catch (handledErr) {
          setError(
            handledErr instanceof Error
              ? handledErr.message
              : "Error al subir la foto",
          );
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8 bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-sm border border-[#e8e8e6]">
        <h1 className="text-3xl font-serif tracking-tight text-[#3A3A28]">
          Aportar al Archivo
        </h1>
        <p className="text-[#5A5A40] mt-2 font-medium">
          Añade una nueva fotografía histórica de Estella para compartirla con
          la comunidad.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Form */}
        <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-sm border border-[#e8e8e6] p-6 sm:p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="flex bg-[#EAE8E3] p-1.5 rounded-full mb-6">
              <button
                type="button"
                onClick={() => setUploadMode("url")}
                className={`flex-1 py-2 text-sm font-medium rounded-full transition-all ${uploadMode === "url" ? "bg-white shadow text-[#3A3A28]" : "text-[#5A5A40] hover:text-[#3A3A28]"}`}
              >
                Pegar Enlace
              </button>
              <button
                type="button"
                onClick={() => setUploadMode("file")}
                className={`flex-1 py-2 text-sm font-medium rounded-full transition-all ${uploadMode === "file" ? "bg-white shadow text-[#3A3A28]" : "text-[#5A5A40] hover:text-[#3A3A28]"}`}
              >
                Subir Archivo
              </button>
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 p-4 rounded-2xl flex items-start gap-3 text-sm border border-red-200">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-1">Ocurrió un error</p>
                  <p>{error}</p>
                </div>
              </div>
            )}

            <div>
              {uploadMode === "url" ? (
                <>
                  <label
                    htmlFor="imageUrl"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    URL de la Imagen *
                  </label>
                  <input
                    {...register("imageUrl")}
                    type="url"
                    placeholder="https://..."
                    className="w-full px-4 py-2 border border-[#e8e8e6] rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-[#5A5A40] transition-colors"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Pega el enlace a la imagen (ej: copiar dirección de imagen
                    de Facebook).
                  </p>
                </>
              ) : (
                <>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fotografía (Archivo) *
                  </label>

                  <div
                    className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-[#e8e8e6] border-dashed rounded-2xl relative hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() =>
                      document.getElementById("file-upload")?.click()
                    }
                  >
                    <div className="space-y-1 text-center">
                      <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
                      <div className="flex text-sm text-gray-600 justify-center">
                        <label
                          htmlFor="file-upload"
                          className="relative cursor-pointer bg-white rounded-md font-medium text-[#c4923e] hover:text-[#a87a2d] focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-[#c4923e]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span>Selecciona un archivo</span>
                          <input
                            id="file-upload"
                            name="file-upload"
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={handleFileChange}
                          />
                        </label>
                      </div>
                      <p className="text-xs text-gray-500">
                        PNG, JPG, GIF (Max 5MB)
                      </p>
                    </div>
                  </div>
                  {file && (
                    <div className="mt-2 text-sm text-gray-600 flex items-center justify-between bg-gray-50 p-2 rounded-xl border border-gray-200">
                      <span className="truncate pr-2 font-medium">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setFile(null);
                          setPreviewUrl(null);
                        }}
                        className="text-red-500 hover:text-red-700 font-medium whitespace-nowrap bg-red-50 px-3 py-1 rounded-full"
                      >
                        Quitar
                      </button>
                    </div>
                  )}
                  
                  {file && (
                     <button
                       type="button"
                       onClick={handleAiDescribe}
                       disabled={aiLoading}
                       className="mt-4 w-full bg-[#6A4C93]/10 hover:bg-[#6A4C93]/20 text-[#6A4C93] font-medium py-2 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                     >
                        {aiLoading ? (
                           <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                           <Sparkles className="w-5 h-5" />
                        )}
                        {aiLoading ? "Analizando imagen..." : "Auto-completar con IA"}
                     </button>
                  )}
                </>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="title"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Título de la Fotografía
                </label>
                <input
                  {...register("title")}
                  type="text"
                  placeholder="Ej: Vista aérea club deportivo Obeki..."
                  className="w-full px-4 py-2 border border-[#e8e8e6] rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-[#5A5A40] transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  ¿Qué representa? (Notas)
                </label>
                <textarea
                  {...register("description")}
                  rows={4}
                  placeholder="Describe qué lugares o personas aparecen, contexto histórico..."
                  className="w-full px-4 py-2 border border-[#e8e8e6] rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-[#5A5A40] transition-colors resize-none"
                ></textarea>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="town"
                  className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5"
                >
                  <Building2 className="w-4 h-4 text-amber-700" />
                  Pueblo / Municipio de Navarra *
                </label>
                <select
                  {...register("town")}
                  defaultValue="Estella-Lizarra"
                  className="w-full px-4 py-2 border border-[#e8e8e6] rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-[#5A5A40] bg-white transition-colors"
                >
                  {NAVARRA_TOWNS.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name} ({t.merindad})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="year"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Año (Aprox) / Fechas
                </label>
                <input
                  {...register("year", {
                    valueAsNumber: true,
                    min: { value: 1800, message: "Año inválido" },
                    max: { value: 2026, message: "Año inválido" },
                  })}
                  type="number"
                  placeholder="Ej: 1965"
                  className="w-full px-4 py-2 border border-[#e8e8e6] rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-[#5A5A40] transition-colors"
                />
                {errors.year && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.year.message}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="location"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Calle, Plaza o Rincón
              </label>
              <input
                {...register("location")}
                type="text"
                placeholder="Ej: Plaza de los Fueros, Calle Mayor..."
                className="w-full px-4 py-2 border border-[#e8e8e6] rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-[#5A5A40] transition-colors"
              />
            </div>

            {/* Vecinos identificados */}
            <div>
              <label
                htmlFor="people"
                className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5"
              >
                <Users className="w-4 h-4 text-purple-600" />
                Vecinos o Familiares que aparecen (Nombres propios)
              </label>
              <input
                {...register("people")}
                type="text"
                placeholder="Ej: Patxi Ruiz, Tomás Martínez, Juana Goñi (separados por comas)"
                className="w-full px-4 py-2 border border-[#e8e8e6] rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-[#5A5A40] transition-colors"
              />
              <p className="text-xs text-gray-500 mt-1">
                Identifica a las personas que aparecen para preservar la memoria vecinal.
              </p>
            </div>

            {/* Memoria oral / Historia familiar */}
            <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200">
              <label
                htmlFor="anecdote"
                className="block text-sm font-bold text-amber-950 mb-1 flex items-center gap-1.5"
              >
                <BookOpen className="w-4 h-4 text-amber-700" />
                Historia Viva / Memoria Oral de la Foto
              </label>
              <textarea
                {...register("anecdote")}
                rows={3}
                placeholder="¿Qué historia tiene esta foto? Cuéntanos la anécdota, el oficio, qué festividad o evento se celebraba, recuerdos de la familia o del pueblo..."
                className="w-full px-4 py-2 bg-white border border-amber-200 rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-[#5A5A40] transition-colors resize-none text-sm"
              ></textarea>
              <p className="text-xs text-amber-800/80 mt-1">
                La historia y memoria oral de los vecinos es el valor más grande de este archivo.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="owner"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Propietario / Fondo *
                </label>
                <input
                  {...register("owner", {
                    required: "Indica de quién es la foto o de qué fondo procede",
                  })}
                  type="text"
                  placeholder="Ej: Familia López / FOTOTECA"
                  className="w-full px-4 py-2 border border-[#e8e8e6] rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-[#5A5A40] transition-colors"
                />
                {errors.owner && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.owner.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="photographer"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Productor / Autor
                </label>
                <input
                  {...register("photographer")}
                  type="text"
                  placeholder="Ej: FOTOGRAFÍA AÉREA Y TERRESTRE"
                  className="w-full px-4 py-2 border border-[#e8e8e6] rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-[#5A5A40] transition-colors"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="tags"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Etiquetas (Categorías, monumentos, lugares...)
              </label>
              <input
                {...register("tags")}
                type="text"
                placeholder="Ej: plaza, fiestas, ayuntamiento (separadas por comas)"
                className="w-full px-4 py-2 border border-[#e8e8e6] rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-[#5A5A40] transition-colors"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="collection"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Serie / Colección
                </label>
                <input
                  {...register("collection")}
                  type="text"
                  placeholder="Ej: Vistas aéreas de industrias navarras"
                  className="w-full px-4 py-2 border border-[#e8e8e6] rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-[#5A5A40] transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="referenceCode"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Referencia / Código
                </label>
                <input
                  {...register("referenceCode")}
                  type="text"
                  placeholder="Ej: ES/NA/AGN/F432/FOT_FOAT_2839"
                  className="w-full px-4 py-2 border border-[#e8e8e6] rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-[#5A5A40] transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="license"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Licencia
                </label>
                <input
                  {...register("license")}
                  type="text"
                  placeholder="Ej: Creative Commons BY-NC-ND"
                  className="w-full px-4 py-2 border border-[#e8e8e6] rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-[#5A5A40] transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="physicalFormat"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Características físicas
                </label>
                <input
                  {...register("physicalFormat")}
                  type="text"
                  placeholder="Ej: 1 Fotografía - 10x12,5 cm - Proceso cromógeno"
                  className="w-full px-4 py-2 border border-[#e8e8e6] rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-[#5A5A40] transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#EAE8E3]/30 p-4 rounded-xl border border-[#e8e8e6]">
              <div>
                <label className="block text-sm font-medium text-[#3A3A28] mb-2">
                  ¿Es original o retocada?
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      {...register("isRetouched")}
                      value="false"
                      className="text-[#c4923e] focus:ring-[#c4923e]"
                    />
                    <span className="text-sm font-medium text-gray-700">Original</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      {...register("isRetouched")}
                      value="true"
                      className="text-[#c4923e] focus:ring-[#c4923e]"
                    />
                    <span className="text-sm font-medium text-gray-700">Retocada / Coloreada</span>
                  </label>
                </div>
              </div>

              <div>
                <label
                  htmlFor="source"
                  className="block text-sm font-medium text-[#3A3A28] mb-1"
                >
                  Origen / Fuente (Opcional)
                </label>
                <input
                  {...register("source")}
                  type="text"
                  placeholder="Ej: Facebook, Cámara, Libro..."
                  className="w-full px-4 py-2 border border-[#e8e8e6] rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-[#5A5A40] transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="quality"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Calidad de la Fotografía
                </label>
                <select
                  {...register("quality")}
                  className="w-full px-4 py-2 border border-[#e8e8e6] rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-[#5A5A40] bg-white"
                >
                  <option value="alta">Alta (Muy nítida)</option>
                  <option value="media">Media (Aceptable)</option>
                  <option value="baja">Baja (Borrosa / Dañada)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="priority"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Importancia Histórica
                </label>
                <select
                  {...register("priority")}
                  className="w-full px-4 py-2 border border-[#e8e8e6] rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-[#5A5A40] bg-white"
                >
                  <option value="alta">Alta (Muy rara/icónica)</option>
                  <option value="media">Media (Interesante)</option>
                  <option value="baja">Baja (Común)</option>
                </select>
              </div>
            </div>

            <div className="pt-4 mt-8">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#5A5A40] hover:bg-[#4a4a30] text-white font-medium py-3 px-4 rounded-full flex items-center justify-center gap-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed shadow-md"
              >
                {isSubmitting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
                {isSubmitting
                  ? "Guardando en el archivo..."
                  : "Guardar Fotografía"}
              </button>
            </div>
          </form>
        </div>

        {/* Preview */}
        <div className="lg:pl-8">
          <div className="sticky top-24">
            <h3 className="text-sm font-bold text-[#5A5A40] uppercase tracking-wider mb-4 border-b border-[#e8e8e6] pb-2">
              Vista Previa de la Ficha
            </h3>
            {previewUrl ? (
              <div className="bg-white rounded-3xl shadow-sm border border-[#e8e8e6] overflow-hidden">
                <div className="aspect-[4/3] bg-[#EAE8E3] relative">
                  <img
                    src={previewUrl}
                    alt="Vista previa"
                    className="absolute inset-0 w-full h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        "https://placehold.co/600x400/f3f4f6/a1a1aa?text=URL+Inv%C3%A1lida";
                    }}
                  />
                </div>
                <div className="p-4 bg-gray-50 border-t border-[#e8e8e6] italic text-sm text-center text-gray-500">
                  Así se verá la imagen dentro del archivo.
                </div>
              </div>
            ) : (
              <div className="bg-[#EAE8E3]/50 border-2 border-dashed border-[#e8e8e6] rounded-3xl aspect-[4/3] flex flex-col items-center justify-center text-gray-400 p-8 text-center mt-2">
                <ImagePlus className="w-12 h-12 mb-3 text-gray-300" />
                <p>
                  Sube un archivo de imagen o pega una URL para previsualizarlo.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
