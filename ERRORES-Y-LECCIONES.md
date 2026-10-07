# Errores cometidos y lecciones aprendidas

Este archivo documenta los errores graves cometidos por el asistente de IA (Claude) durante el desarrollo. Se mantiene para que no vuelvan a repetirse.

---

## ❌ ERROR 1 — Cargar todos los documentos de Firestore en cada visita

### Qué se hizo mal
Se implementó una "carga progresiva" que en realidad cargaba TODOS los documentos en cada visita a la web:

```typescript
// MALO — esto lee TODOS los documentos en cada visita
const q1 = query(collection(db, "photos"), orderBy("createdAt", "desc"), limit(200));
const snap1 = await getDocs(q1); // 200 lecturas

// Y luego en bucle infinito hasta cargar el resto:
while (true) {
  const qN = query(..., startAfter(lastDoc), limit(500));
  const snapN = await getDocs(qN); // 500 lecturas más, y otra vez, y otra vez...
  setPhotos((prev) => [...prev, ...batch]);
  if (snapN.size < 500) break;
  lastDoc = snapN.docs[snapN.docs.length - 1];
}
```

### Consecuencia
Con 2076 fotos en la base de datos:
- Cada visita a la web = **2076 lecturas de Firestore**
- Límite gratuito = 50.000 lecturas/día
- La cuota se agotó con ~24 visitas
- La web dejó de funcionar completamente para todos los usuarios

### Cómo se corrigió
Paginación real: solo se cargan 50 documentos en la primera carga. Más documentos se cargan únicamente cuando el usuario hace scroll hasta el final, bajo demanda.

```typescript
// CORRECTO — solo 50 lecturas en la carga inicial
const PAGE_SIZE = 50;
const q = query(collection(db, "photos"), orderBy("createdAt", "desc"), limit(PAGE_SIZE));
```

### Lección
**Nunca cargar una colección entera de Firestore en cada visita.** Siempre paginar. El número de lecturas = número de documentos leídos, no de queries. Con 2000+ documentos, cargarlos todos en cada visita agota la cuota en horas.

---

## ❌ ERROR 2 — No entender la arquitectura antes de actuar

### Qué se hizo mal
Al inicio de la sesión, se usó `WebFetch` para analizar la web. `WebFetch` no ejecuta JavaScript, así que solo vio el HTML estático vacío y reportó que la web "solo tenía un título" y "5 fotos". En realidad tenía **2076 fotos**, hemeroteca, curiosidades, búsqueda con IA, panel de admin y más.

Se dio un análisis incorrecto del estado del proyecto, lo que podría haber llevado a proponer mejoras ya implementadas o innecesarias.

### Cómo se debería haber hecho
Leer los archivos de código fuente directamente (`src/pages/`, `src/components/`, `ESTADO-PROYECTO.md`) antes de sacar conclusiones sobre el estado de la web.

### Lección
**`WebFetch` no sirve para analizar apps React/SPA.** Estas apps renderizan en el cliente con JavaScript. `WebFetch` solo ve el `<div id="root"></div>` vacío. Para entender el estado de una app, hay que leer el código fuente.

---

## ❌ ERROR 3 — No verificar que los cambios generaban un bundle diferente antes de decir "ya está"

### Qué se hizo mal
Después de hacer cambios en el código y buildear, el bundle generado tenía el **mismo nombre de archivo** (`index-Curesadl.js`) que el bundle anterior. Esto significa que Hostinger servía el archivo antiguo desde caché aunque el usuario lo hubiera subido de nuevo.

Se le dijo al usuario "sube dist/ y ya está" sin detectar este problema. El usuario subió el archivo, abrió la web, y vio la versión antigua.

### Causa raíz
Vite genera el hash del bundle basándose en el contenido. Si el contenido minificado produce el mismo hash (coincidencia), el nombre es idéntico y los CDN/navegadores sirven la versión cacheada.

### Cómo se corrigió
Se modificó `vite.config.ts` para incluir un timestamp en el nombre del archivo en cada build:

```typescript
const buildId = Date.now().toString(36);
build: {
  rollupOptions: {
    output: {
      entryFileNames: `assets/[name]-[hash]-${buildId}.js`,
      // ...
    }
  }
}
```

Así cada `npm run build` genera un nombre único y Hostinger no puede servir archivos cacheados.

### Lección
**Al trabajar con hosting estático (Hostinger, S3, Netlify...), verificar siempre que el nombre del bundle cambia entre builds.** Si no cambia, hay riesgo de que el CDN sirva el archivo antiguo.

---

## ❌ ERROR 4 — Desplegar reglas de Firestore sin `firebase.json` correcto

### Qué se hizo mal
El archivo `firestore.rules` existía en el proyecto pero **nunca se había desplegado** a la base de datos con nombre propio del proyecto. Sin `firebase.json` configurado correctamente, `firebase deploy` habría apuntado a la base de datos por defecto, dejando la base de datos real (`ai-studio-d55aaa70...`) con las reglas deny-all por defecto.

Resultado: las colecciones `curiosities` y `news` fallaban con "Missing or insufficient permissions" aunque las reglas del archivo las declaraban públicas.

### Cómo se corrigió
Se creó `firebase.json` apuntando explícitamente a la base de datos con nombre:

```json
{
  "firestore": [
    {
      "database": "ai-studio-d55aaa70-4a7c-4319-86af-28ede5db32a3",
      "rules": "firestore.rules",
      "indexes": "firestore.indexes.json"
    }
  ]
}
```

Y se desplegó: `firebase deploy --only firestore:rules --project project-4938c1eb-c32b-4494-95c`

### Lección
**Si el proyecto usa una base de datos Firestore con nombre propio (no "(default)"), el `firebase.json` debe especificarla explícitamente.** Sin esto, los deploys de reglas no tienen efecto sobre la base de datos real.

---

## Checklist antes de tocar rendimiento o infraestructura

Antes de hacer cualquier cambio relacionado con carga de datos o infraestructura:

- [ ] ¿Cuántos documentos tiene la colección? ¿Cuántas lecturas costará cada visita?
- [ ] ¿Se ha leído el código existente completo antes de proponer cambios?
- [ ] ¿El bundle generado tiene un nombre diferente al anterior?
- [ ] ¿Las reglas de Firestore están desplegadas en la base de datos correcta?
- [ ] ¿Hay caché persistente configurada para reducir lecturas en visitas repetidas?
