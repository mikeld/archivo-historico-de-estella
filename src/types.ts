export type Role = "admin" | "editor" | "user";

export interface User {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  role?: Role;
  isAdmin?: boolean; // legacy
  favorites?: string[]; // list of photo IDs
  likedCuriosities?: string[]; // list of curiosity IDs
  createdAt: number;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  photoIds: string[];
  userId: string;
  createdAt: number;
}

export interface Curiosity {
  id: string;
  photoId: string;
  text: string;
  addedBy: string; // User ID
  authorName?: string;
  type: "curiosity" | "anecdote" | "historia" | "cotilleo" | "misterio";
  createdAt: number;
  likes?: number; // total likes
}

export interface Like {
  id: string; // usually userId
  userId: string;
  createdAt: number;
}

// Artículo/documento del corpus (Brain del Escape Room) relacionado con una foto.
// Se rellena por lotes con scripts/03-enrich-photos-rag.ts y se lee en el modal.
export interface RelatedArticle {
  fuente: string;       // p. ej. "callemayor", "diario_navarra", "notebooklm"
  titulo: string;
  fecha?: string;
  url?: string;
  resumen?: string;
  score: number;        // 0-100 (relevancia)
  seccion?: string;
}

export interface ArchiveArticle {
  id: string;
  titulo: string;
  fuente: string;
  fecha: string;
  year?: number | null;
  url?: string;
  resumen?: string;
  seccion?: string;
  score: number;
  photoId: string;
  photoTitle: string;
  photoThumbnail: string;
  photoYear?: number | null;
}


export interface Photo {
  id: string;
  title?: string; // Título
  imageUrl: string;
  thumbnailUrl?: string; // Optional, might use same as imageUrl
  owner: string; // The person who owns the original physical photo (Propietario / Source)
  photographer?: string; // Productor / Fotógrafo
  location?: string; // Lugar (e.g. calle, barrio, plaza)
  collection?: string; // Serie / Colección
  referenceCode?: string; // Referencia (e.g., código de archivo)
  license?: string; // Licencia (e.g., Creative Commons)
  physicalFormat?: string; // Características físicas (e.g., 10x12,5 cm - Proceso cromógeno)
  year?: number;
  description?: string;
  quality?: string;
  priority?: string;
  isRetouched?: boolean;
  source?: string;
  tags?: string[]; // E.g. "plaza", "monumento"
  curiosities?: Curiosity[];
  uploadedBy: string; // UID of uploader
  createdAt: any;
  updatedAt?: any;
  searchTerms?: string[];
  likes?: number;
  likedBy?: string[];
  relatedArticles?: RelatedArticle[]; // Prensa/documentación relacionada (Brain RAG)
  relatedArticlesUpdatedAt?: any;     // Marca de cuándo se enriqueció (idempotencia)
  facebookPostUrl?: string;           // Enlace al post original (import de Facebook)
  facebookAuthor?: string;
  aiAnalysis?: string;                // Descripción visual técnica de IA (secundaria)
  landmarkId?: string;                // ID del monumento/lugar estricto en el mapa histórico
  town?: string;                      // Localidad (Estella-Lizarra, Olite, Tafalla, etc.)
  townSlug?: string;                  // Slug normalizado ("estella-lizarra", "olite-erriberri", etc.)
  merindad?: string;                  // Merindad histórica (Estella, Olite, Tudela, Pamplona, Sangüesa)
  comarca?: string;                   // Comarca geográfica
  decade?: string;                    // Década formateada ("1960s")
  people?: string[];                  // Personas citadas o identificadas
  coordinates?: [number, number];     // Coordenadas geográficas [lat, lng]
  verifiedLocation?: boolean;         // Indicador de ubicación verificada sin duda
  archiveReference?: string;          // Código oficial de archivo (ej. ES/NA/AGN/...)
}

export type SuggestionType =
  | "claim_authorship"
  | "edit_details"
  | "add_curiosity"
  | "add_anecdote";
export type SuggestionStatus = "pending" | "approved" | "rejected";

export interface Suggestion {
  id: string;
  photoId: string;
  suggestedBy: string;
  type: SuggestionType;
  status: SuggestionStatus;
  proposedChanges?: {
    owner?: string;
    description?: string;
    year?: number;
    tags?: string[];
    curiosityText?: string;
    curiosityType?: "curiosity" | "anecdote";
  };
  createdAt: number;
}

export interface News {
  id: string;
  title: string;
  date: string;
  year: number;
  content: string;
  source: string;
  url?: string;
  protagonists?: string[];
  createdAt: any;
}

declare global {
  const __APP_BUILD_ID__: string;
  const __APP_BUILD_TIME__: string;
  const __APP_GIT_SHA__: string;
}
