# Arquitectura del proyecto

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Base de datos | Firebase Firestore (base de datos con nombre propio) |
| Almacenamiento | Firebase Storage |
| Auth | Firebase Auth (Google Sign-In) |
| Hosting | Hostinger (sitio estático) |
| IA catalogo | Gemini Vision (scripts de importación) |
| IA búsqueda | Gemini 2.0 Flash (búsqueda semántica en la web) |

---

## Base de datos Firestore

**IMPORTANTE:** El proyecto usa una base de datos Firestore con **nombre propio**, no la base de datos por defecto.

- **Database ID:** `ai-studio-d55aaa70-4a7c-4319-86af-28ede5db32a3`
- **Proyecto Firebase:** `project-4938c1eb-c32b-4494-95c`
- Configurado en `firebase-applet-config.json` → campo `firestoreDatabaseId`
- En el código: `initializeFirestore(app, { ... }, firebaseConfig.firestoreDatabaseId)`

### ⚠️ Consecuencia crítica
Cuando se despliegan reglas de Firestore con `firebase deploy --only firestore:rules`, hay que asegurarse de que el `firebase.json` apunta a esta base de datos con nombre, no a la default. Si no, las reglas no se aplican y Firestore deniega todas las lecturas con "Missing or insufficient permissions".

Ver `firebase.json` en la raíz del proyecto.

---

## Colecciones Firestore

| Colección | Acceso lectura | Acceso escritura |
|-----------|---------------|-----------------|
| `photos` | público (`if true`) | usuarios autenticados con validación |
| `news` | público (`if true`) | admins |
| `curiosities` | público (`if true`) | usuarios autenticados |
| `users/{uid}` | solo el propio usuario o editors | solo el propio usuario |
| `suggestions` | usuario propio o editors | usuarios autenticados |

---

## Plan de carga de fotos (rendimiento)

**Regla de oro: cada documento leído de Firestore cuenta contra la cuota.**

- **Free tier:** 50.000 lecturas/día
- **Estrategia actual:** paginación real — 50 fotos por carga, más al hacer scroll
- **Caché:** `persistentLocalCache` con IndexedDB — visitas repetidas cuestan 0 lecturas
- **Nunca** cargar todos los documentos en cada visita

Ver `src/pages/Home.tsx` → constante `PAGE_SIZE`.

---

## Pipeline de importación de fotos

```
Grupo de Facebook
      ↓
scripts/01-facebook-scraper.ts   → descarga imágenes + metadatos (Playwright)
      ↓
scripts/02-ai-catalog.ts         → Gemini Vision filtra y cataloga (requiere GEMINI_API_KEY)
      ↓
public/import-fotos.html         → sube a Firebase Storage + Firestore (desde el navegador)
      ↓
Web React en Hostinger           → muestra el archivo
```

---

## Despliegue

1. `npm run build` → genera `dist/` con hash único por build (evita caché de Hostinger)
2. Subir contenido de `dist/` a `public_html/` en Hostinger
3. Para reglas Firestore: `firebase deploy --only firestore:rules --project project-4938c1eb-c32b-4494-95c`

---

## Páginas y rutas

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/` | `Home.tsx` | Galería principal con búsqueda y filtros |
| `/news` | `NewsArchive.tsx` | Hemeroteca (Diario de Navarra) |
| `/curiosities` | `Curiosities.tsx` | Curiosidades y anécdotas |
| `/about` | `About.tsx` | Información del proyecto |
| `/upload` | `Upload.tsx` | Subir fotos (usuarios autenticados) |
| `/admin` | `AdminDashboard.tsx` | Panel de administración |
| `/profile` | `Profile.tsx` | Perfil de usuario y favoritos |

---

## Admins

- `mikeldiaz0@gmail.com`
- `estellaescapecity@gmail.com`
