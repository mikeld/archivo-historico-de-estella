# Archivo Histórico de Estella-Lizarra
## Estado del proyecto y guía de continuación

---

## ¿Qué hemos construido?

Un pipeline completo para importar fotos históricas del grupo de Facebook
"Fotos Antiguas de Estella-Lizarra" al archivo web en:
https://springgreen-grouse-873895.hostingersite.com/

### Arquitectura

```
Grupo de Facebook
      ↓
01-facebook-scraper.ts   → descarga imágenes + metadatos del post
      ↓
02-ai-catalog.ts         → Gemini Vision filtra y cataloga cada foto
      ↓
import-fotos.html        → sube a Firebase Storage + Firestore
      ↓
Web React (Hostinger)    → muestra el archivo con búsqueda
```

---

## Dónde nos hemos quedado

- **5 fotos históricas importadas** a Firebase (primera prueba con 11 posts)
- El scraper bajó 11 posts del grupo antes de pararlo
- Gemini filtró correctamente: 5 históricas aceptadas, 6 modernas descartadas
- Las 5 fotos ya aparecen en la web

### Fotos importadas
1. Concurso Ajoarrero, Fiestas de Estella 1975
2. Camino Ancho de Los Llanos arbolado (1970-1994)
3. Retablo Mayor de la Iglesia de San Pedro de la Rúa (1550-1750)
4. Fiestas de Estella-Lizarra, 1975
5. Procesión festiva en calle de Estella-Lizarra (1980-1994)

---

## Flujo completo para añadir más fotos

### Paso 1 — Descargar fotos del grupo de Facebook
```bash
cd ~/Developer/archivo-histórico-de-estella
npx tsx scripts/01-facebook-scraper.ts
```
- Se abre un Chromium
- Haz login en Facebook si te lo pide
- Cuando veas el feed del grupo, pulsa ENTER en la terminal
- El script hace scroll automático y descarga fotos + metadatos
- Se puede parar (Ctrl+C) y reanudar: guarda el progreso en raw-posts.json

### Paso 2 — Catalogar con IA
```bash
npx tsx scripts/02-ai-catalog.ts
```
- Necesita GEMINI_API_KEY en el archivo .env (cuenta de pago, ~0,01€ por 100 fotos)
- Filtra automáticamente fotos modernas y no históricas
- Solo acepta fotos anteriores a 1995
- Guarda resultado en cataloged-posts.json

### Paso 3 — Importar a Firebase
- Abre https://springgreen-grouse-873895.hostingersite.com/import-fotos.html
- Login con estellaescapecity@gmail.com
- Selecciona facebook-import/cataloged-posts.json
- Selecciona las imágenes de facebook-import/images/ (Cmd+A para todas)
- Clic en "Importar fotos históricas"
- Solo sube las que no han sido importadas aún (processed: false)

### Paso 4 — Desplegar cambios en la web (si tocas código)
```bash
npm run build
# Sube la carpeta dist/ a public_html/ en Hostinger
```

---

## Archivos importantes

| Archivo | Descripción |
|---------|-------------|
| `facebook-import/raw-posts.json` | Posts descargados del scraper |
| `facebook-import/images/` | Imágenes descargadas |
| `facebook-import/cataloged-posts.json` | Posts catalogados por IA |
| `facebook-import/skipped-posts.json` | Posts descartados (modernos) |
| `scripts/01-facebook-scraper.ts` | Scraper de Facebook |
| `scripts/02-ai-catalog.ts` | Catalogador con Gemini Vision |
| `public/import-fotos.html` | Página de importación a Firebase |
| `service-account.json` | NO EXISTE (bloqueado por org policy) |
| `.env` | GEMINI_API_KEY (necesaria para paso 2) |

---

## Mejoras pendientes

### 🔴 Prioritarias

1. **Descargar el resto del grupo**
   - El grupo tiene ~200-500 posts, solo se han procesado 11
   - Volver a ejecutar el scraper y dejarlo correr hasta el final
   - El grupo tiene fotos desde los años 20 hasta los 90

2. **Limpiar imágenes basura de la carpeta**
   - Hay iconos y píxeles de seguimiento (<10KB) mezclados con las fotos reales
   - Ejecutar: `find ~/Developer/archivo-histórico-de-estella/facebook-import/images -size -10k -delete`

3. **Mejorar detección de ubicación**
   - Muchas fotos salen con "sin ubicacion"
   - Mejorar el prompt de Gemini con más contexto de zonas de Estella
   - Añadir las fotos ya importadas como ejemplos en el prompt

### 🟡 Mejoras de calidad

4. **Revisar manualmente las catalogaciones**
   - Abrir cataloged-posts.json y corregir años o ubicaciones incorrectas
   - Especialmente las que tienen aiConfidence: "low"

5. **Extraer mejor la imagen principal**
   - El scraper a veces coge la imagen _1 en lugar de la mejor
   - Añadir lógica para detectar la imagen más grande/relevante del post

6. **Importar múltiples imágenes por post**
   - Algunos posts tienen 3-5 fotos históricas
   - El importador actual solo sube la primera imagen válida

7. **Corregir año en fotos sin fecha**
   - Las fotos sin año exacto usan un rango (ej: 1970-1994)
   - Se podría pedir al usuario que confirme o corrija al subir

### 🟢 Funcionalidades futuras

8. **Actualización automática semanal**
   - Programar el scraper para que se ejecute cada semana
   - Las nuevas publicaciones del grupo se añaden automáticamente

9. **Formulario de corrección para usuarios**
   - Los visitantes de la web pueden sugerir correcciones de año/lugar
   - La funcionalidad ya existe en el código (suggestions en Firestore)

10. **Búsqueda por décadas y zonas**
    - La web ya tiene searchTerms pero mejorar los filtros visuales
    - Añadir filtros por: década, zona de Estella, tipo (fiestas, cotidiano, etc.)

11. **Fuentes adicionales**
    - Otros grupos de Facebook con fotos de Estella
    - Archivo Municipal de Estella
    - Fototecas privadas

---

## Configuración Firebase

- **Proyecto:** project-4938c1eb-c32b-4494-95c
- **Base de datos Firestore:** ai-studio-d55aaa70-4a7c-4319-86af-28ede5db32a3
- **Storage:** project-4938c1eb-c32b-4494-95c.firebasestorage.app
- **Admin:** estellaescapecity@gmail.com, mikeldiaz0@gmail.com
- **Web:** https://springgreen-grouse-873895.hostingersite.com/

---

## Notas técnicas

- El scraper usa Playwright (Chromium) — requiere que Facebook esté abierto
- La catalogación usa Gemini 2.5 Flash con vision (~0,01€/foto)
- Las service accounts están bloqueadas por org policy de Google
- La importación se hace desde el navegador (import-fotos.html) con Google Auth
- El proyecto es React + Vite + Firebase + Tailwind
- Desplegado en Hostinger como sitio estático
