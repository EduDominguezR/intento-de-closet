# Closetly — Closet Digital, Armador 2D/3D y PWA

Web app consumer mobile-first (PWA) para digitalizar prendas con foto, organizar un closet virtual, vestir un avatar maniquí 2D y una vista 3D paramétrica aproximada por capas, y guardar outfits por colección, construida con **React + Vite + TypeScript + Tailwind CSS** y **Firebase v9+ modular** sin backend propio.

---

## 1. Decisiones Técnicas y Premisas (MVP + Modo 3D)

- **Avatar 2D Collage/Dress-Up + Vista 3D Aproximada (sin simulación de tela):**
  - **Modo 2D:** Maniquí SVG paramétrico (`/public/avatar/mannequin.svg` + `Avatar2D`) con personalización de tono de piel, cabello (estilo y color), complexión y estatura relativa. Las prendas recortadas se superponen por capas (`top/bottom/dress/outerwear/shoes/acc_head/acc_neck/acc_hand`) con reglas de reemplazo (`dress` sustituye `top` + `bottom` y viceversa) y ajuste fino táctil (arrastre, pellizco/zoom y rotación).
  - **Modo 3D propio (Fase 2 integrada):** Avatar 3D paramétrico propio alojado en la app (`Avatar3D`, sin servicios externos ni Ready Player Me) + prendas aproximadas sobre plantillas 3D (`tshirt`, `longsleeve`, `jacket`, `pants`, `shorts`, `skirt`, `dress`, `shoes`) con proyección del cutout frontal y color dominante en el resto de la prenda. La UI deja claro en todo momento que es una **"Vista 3D aproximada"** (no hay image-to-3D de prendas ni simulación de tela).
  - **Un solo borrador de outfit y validación de `renderer` / `photoTransform`:** `useOutfitDraftStore` gobierna las vistas `photo | 2d | 3d` bajo la fuente única de verdad `AVATAR_RENDERERS` (`src/lib/avatar/types.ts`, normalizada al leer desde Firestore con `isAvatarRenderer`). En `outfits`, `firestore.rules` no puede iterar listas, por lo que valida únicamente campos de nivel superior e `items.size() <= 8`; la validación exhaustiva por prenda —incluido `photoTransform` opcional (`cx`, `cy` en `0..1`, `scale > 0 && <= 5`, `rotation` en `-360..360`, `flipX` booleano)— se ejecuta en el cliente con **Zod** (`src/lib/outfit/validation.ts`) en todas las escrituras de `outfits`.
- **Aislamiento de Three.js (carga diferida estricta):**
  - `three`, `@react-three/fiber` y `@react-three/drei` **solo** se cargan de forma diferida (`React.lazy`) en:
    1. `GarmentViewerModal` (visor pseudo-3D de prenda aislada).
    2. `OnboardingAvatarPage` (`Avatar3DPreview`, preview 2D y 3D lado a lado).
    3. `NewOutfitPage` (`Outfit3DViewer`, únicamente cuando el armador está en modo `3D`).
  - Rutas como `/closet`, `/garments/new` (selector SVG de `template3d`) y `/outfits` nunca cargan Three.js en su chunk.
- **Puntos de extensión preparados (Fase 3 — NO implementados, solo interfaces):**
  - `src/lib/avatar/provider.ts` (`photoAvatarProvider` con `// EXTENSION PHASE 3:`).
  - `src/lib/ai/try-on-provider.ts` (`tryOnProvider.generate({ personImage, garmentImage })` con `// EXTENSION PHASE 3:`).
  - `src/components/three/GarmentViewer.tsx` (`source: 'pseudo3d' | 'glb'` para futuro image-to-3D de prenda aislada).
  - MediaPipe pose estimation, sugerencias ("Sorpréndeme"), calendario + estadísticas, compartir outfit como PNG y modo oscuro pastel.
- **Filtrado en el cliente:**
  - Firestore solo permite un `array-contains` por consulta y no ofrece búsqueda full-text nativa. Por ello `useGarmentsQuery` carga las prendas del usuario (`where('userId', '==', uid)`, `staleTime: 5 min`, sin `onSnapshot` global) y aplica filtros (categoría, color, temporada, ocasión, tags y texto) en memoria con `useMemo`.
  - **Límite recomendado:** ~500 prendas por usuario. Para escalar se recomienda paginación en servidor + Algolia/Typesense o búsqueda vectorial.
- **Seguridad de URLs de Storage:**
  - `getDownloadURL()` genera URLs con token firmado; no deben compartirse fuera de la sesión del usuario. Para máxima privacidad o cuando WebGL/Canvas lo requiere, la app usa `getStorageBlob()` (`getBlob()`).
- **PWA y Caché Offline:**
  - **Shell + activos estáticos:** Precacheado con `vite-plugin-pwa` (Workbox `generateSW`), incluyendo `models/manifest.json` y excluyendo archivos `.wasm` pesados del precache inicial.
  - **Modelos `/models/**`:** Estrategia `CacheFirst` en Workbox con expiración (`closetly-3d-models`). Versiona el nombre del archivo por hash (ej. `base.a1b2c3d4.glb`) al reemplazar modelos reales para invalidar caché limpia y determinísticamente.
  - **Imágenes de Storage:** Runtime cache `StaleWhileRevalidate` (`closetly-storage-images`) con plugin `cacheKeyWillBeUsed` que elimina el parámetro `?token=...` para preservar coincidencias en caché entre rotaciones de token.
  - **Datos Firestore:** Workbox **NO** cachea Firestore. La persistencia offline de datos la gestiona el SDK de Firebase con `persistentLocalCache` + `persistentMultipleTabManager` (API v9+, sin `enableIndexedDbPersistence`).
  - **Cola offline de capturas:** Usa IndexedDB (`closetly-offline-queue`) y reintento automático al abrir la app y en el evento `'online'`, sin depender de `Background Sync` (no soportado en Safari/iOS).

---

## 2. Contrato de Modelos `.glb` y `public/models/manifest.json`

Por defecto `/public/models/manifest.json` define `"glb": null` para el avatar y las 8 plantillas, por lo que la app funciona al 100% con el avatar y plantillas procedurales en pastel **sin generar peticiones 404**.

Para sustituirlos por modelos `.glb` reales sin tocar código de la aplicación:

1. Coloca tus archivos en `/public/models/avatar/` y `/public/models/garments/` (recomendado incluir hash en el nombre de archivo para CacheFirst, ej. `base.8f21a3.glb`).
2. Actualiza las rutas en `/public/models/manifest.json` (ej. `"/models/avatar/base.8f21a3.glb"`).
3. Cumple el siguiente **contrato técnico obligatorio**:
   - **Licencia:** Modelos con licencia comercial verificada (ej. CC0 o licencia propia del estudio).
   - **Unidades y origen:** Escala en **metros**, eje **+Y arriba**, frente mirando hacia **+Z** y origen `(0, 0, 0)` exactamente en la planta de los pies (`y = 0`).
   - **Presupuesto geométrico y de texturas:**
     - Avatar base: `<= 60,000` triángulos, texturas `<= 1024 px`.
     - Cada plantilla de prenda: recomendada `<= 15,000` triángulos, texturas `<= 1024 px`.
     - Compresión obligatoria con **Meshopt** o **Draco** (`loadGLBModel` en `src/lib/three/models.ts` ya inicializa `DRACOLoader` y `MeshoptDecoder`).
   - **Morph Targets requeridos (mismos nombres en avatar y plantillas para deformación conjunta):**
     - `body_slim`, `body_curvy`, `height_short`, `height_tall` (configurables vía `manifest.avatar.morphTargets`).
   - **Materiales y proyección frontal:**
     - En avatar: mallas con nombre que contenga `skin`/`body` toman `avatarConfig.skin` y `hair` toma `avatarConfig.hair.color`.
     - En plantillas: la malla frontal debe incluir `front` en su nombre (o ser la primera malla si es un solo mesh) con UVs `[0..1]` centradas al frente para recibir el cutout WebP proyectado desde `textureProjection.ts`; el resto de paneles usa `garment.dominantColor`.

---

## 3. Requisitos Previos, Política de Costo Cero en APIs y Cuotas Firebase

- **Sin API keys de pago ni configuración manual:** Closetly funciona al 100 % sin claves comerciales ni Cloud Functions de terceros.
  - **Cadena `BgRemovalEngine` (`src/lib/bg-removal.ts`):**
    1. `'imgly'` (`@imgly/background-removal` en Web Worker local, gratuito, sin API key).
    2. `'solid-bg'` (`SolidBgWandEditor`: varita mágica interactiva por flood-fill en Canvas 2D desde el punto tocado, con controles de tolerancia y suavizado de bordes; cero modelos externos y cero servicios).
    3. `'manual-brush'` (`MaskEditor`: pincel manual borrar/restaurar con historial y vista fantasma).
    4. Continuar con la foto original si todo lo anterior falla o excede el timeout, mostrando un aviso claro.
    - `// EXTENSION PHASE 3:` cualquier modelo alternativo futuro (p. ej. U²-Net sobre `onnxruntime-web`) solo podrá incorporarse bajo carga diferida y con **licencia comercial verificada**.
  - **Detección de pose/segmentación (`@mediapipe/tasks-vision`):** Modelos locales en `/public/mediapipe/`.
  - **Vista 3D procedural:** Geometría y materiales locales con Three.js (`manifest.json` sin descargas externas obligatorias).
- **Gestión de costos y cuotas gratuitas en Firebase:**
  - **(a) Cloud Storage y política de plan Blaze:** Verifica en la consola de Firebase si el proyecto requiere habilitar el plan **Blaze (pay-as-you-go)** para aprovisionar el bucket de Cloud Storage según la política vigente de Firebase, aun cuando el consumo permanezca dentro del nivel gratuito (*Always Free*).
  - **(b) Sin Cloud Functions:** Al haber eliminado la carpeta `/functions` y toda función serverless, **ya no necesitas Blaze por Cloud Functions**.
  - **(c) Alertas de presupuesto (obligatorias si usas Blaze):** Configura *Budgets & Alerts* en Google Cloud Billing (por ejemplo, umbral de 1 USD con avisos al 50 %, 90 % y 100 %) para evitar cargos inesperados por tráfico anómalo.
  - **(d) Límites gratuitos y ahorro de lecturas:** La capa gratuita (*Spark / Always Free*) limita las operaciones diarias de Firestore (lecturas, escrituras y borrados) y el almacenamiento/ancho de banda de Storage. Closetly minimiza las lecturas cargando el closet completo en **una sola consulta cacheada** (`useGarmentsQuery`, `staleTime: 5 min`, sin `onSnapshot` global) y ejecutando búsquedas y filtros en memoria en el cliente.
- **App Check opcional:** `initAppCheck()` en `src/firebase/config.ts` **solo** se inicializa si defines `VITE_APPCHECK_RECAPTCHA_SITE_KEY` en `.env`. Si queda vacío, la app funciona sin App Check. Antes de activar **Enforce** en Firebase Console, verifica la cuota gratuita vigente del proveedor (reCAPTCHA v3 / Enterprise) para tu volumen esperado.

---

## 4. Setup Completo de Firebase y Despliegue

1. **Authentication:**
   - En Firebase Console → *Authentication* → *Sign-in method*, habilita **Correo electrónico/contraseña** y **Google**.
   - En *Authentication* → *Settings* → *Authorized domains*, añade tu dominio de Hosting (`<project-id>.web.app`) y `localhost`.

2. **Firestore Database (Reglas e Índices):**
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```

3. **Cloud Storage + CORS:**
   ```bash
   firebase deploy --only storage
   gcloud storage buckets update gs://<tu-storage-bucket> --cors-file=cors.json
   ```

4. **Recorte de fondo 100 % gratuito y local (sin API keys ni Cloud Functions):**
   - El recorte principal corre en Web Worker con `'imgly'` (`@imgly/background-removal`, gratuito y sin clave).
   - Si falla, excede el timeout o el usuario lo prefiere en fondos lisos, la app ofrece **`'solid-bg'` (varita mágica interactiva)** y **`'manual-brush'` (`MaskEditor`)**, sin requerir API keys, Cloud Functions ni servicios externos.

5. **Build y Despliegue a Firebase Hosting (opcional, para probar fuera de iframe):**
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

---

## 5. Pruebas de Reglas y Calidad

```bash
# TypeScript check
npm run lint

# Linter oficial de reglas Firestore
npm run lint:rules

# Suite de pruebas contra emuladores de Firestore y Storage (incluye casos a–l)
npx firebase emulators:exec --only firestore,storage "npm run test:rules"
```

> **Revisión recomendada de reglas:** Aunque las reglas en `firestore.rules` y `storage.rules` validan propiedad (`userId == request.auth.uid`), tamaños máximos, colores `#RRGGBB`, enums de `avatarConfig` y lista cerrada de `template3d`, revísalas y audítalas acorde a tus políticas antes de abrir el proyecto a tráfico público amplio.

---

## 6. Riesgos, Licencias, Rendimiento y Roadmap Fase 3

- **Licencia de `@imgly/background-removal`:** Publicado bajo **AGPL-3.0**. Si comercializas Closetly o lo integras en un producto propietario cerrado, evalúa sus obligaciones o adquiere una licencia comercial / migra el recorte al backend.
- **Peso de WASM y WebGL:**
  - El modelo de segmentación WASM (~23 MB) y Three.js se descargan **bajo demanda** únicamente al entrar a `/garments/new` o abrir vistas 3D (`GarmentViewerModal`, `OnboardingAvatarPage`, `NewOutfitPage` en modo 3D).
  - El Web Worker aplica timeout de **60 s** en la primera ejecución y **15 s** en ejecuciones posteriores, con botón explícito para usar la foto original si falla o se agota el tiempo.
- **Objetivo de rendimiento 3D (30 fps en gama media móvil):**
  - `Outfit3DScene` reutiliza objetos matemáticos preasignados (cero GC por frame), detecta WebGL por software (`probeWebGLCapabilities`) para ajustar `dpr`/`shadowMap` y mide FPS reales en GPU: si el promedio cae por debajo de **15 fps** durante más de 3 segundos sostenidos (o si WebGL no está disponible), cambia automáticamente a **vista 2D** mostrando un aviso claro.
  - **Perfilado en dispositivo real:** Ejecuta el build de producción (`npm run build && npm run preview` o Hosting) y mide en Chrome DevTools → *Performance* con *CPU 4x slowdown* o vía *Remote Debugging* en un smartphone gama media para validar frame times <= 33 ms.
- **Cámara en iFrame / Safari:** Si `getUserMedia` está restringido por permisos del entorno o iframe, `CaptureSourceStep` muestra un fallback inmediato a `<input type="file" capture="environment">` / galería.
- **Requisitos futuros de Fase 3 (`tryOnProvider` y `photoAvatarProvider`):**
  - Fuera del flujo privado de Lookbook, **está prohibido** subir fotos de cuerpo completo del usuario a cualquier servidor.
  - Al habilitar `tryOnProvider` en Fase 3: requerirá consentimiento explícito del usuario previo a cada envío, revisión de licencias/costos (preferiblemente ejecución local o modelo gratuito verificado) y borrado inmediato de cualquier imagen temporal tras generar el resultado.

---

## 7. Privacidad del Lookbook (Diario de Uso Real)

- **Acceso estrictamente privado:** Las fotos del lookbook SOLO las ve el dueño (`request.auth.uid == resource.data.userId`). No existe feed público ni botones de compartir en el MVP.
- **Renderizado exclusivo vía `getBlob` (nunca `getDownloadURL`):**
  - Las fotos del lookbook se renderizan mediante `useLookbookPhotoBlob(path)` usando `getBlob()` + `URL.createObjectURL()` (con revocación automática al desmontar), lo que exige autenticación en cada lectura. **NO son compartibles por URL.**
  - *Nota Fase 3:* Si necesitas compartir una foto del lookbook en una fase futura, hazlo únicamente vía Cloud Function que genere una URL temporal firmada de corta duración tras confirmación explícita del usuario.
- **Procesamiento 100 % local sin IA:** La foto real únicamente se redimensiona (`1600 px` detalle, `400 px` miniatura en grid) y se convierte a WebP en el cliente (`src/lib/lookbook/image.ts`), respetando la orientación EXIF original (`createImageBitmap(..., { imageOrientation: 'from-image' })`). No se ejecuta eliminación de fondo, ni detección de pose, ni recorte.
- **Consentimiento explícito:** En la primera subida desde el navegador (`src/lib/lookbook/consent.ts`, `CONSENT_VERSION = 1`), es obligatorio aceptar el aviso de privacidad; se recuerda en `localStorage` (`lookbook-consent`).
- **Borrado seguro y sin huérfanos:**
  - Al eliminar una entrada del lookbook (`useDeleteLookbookEntryMutation`), primero se ejecuta `deleteObject()` sobre `photoPath` y `photoThumbPath` en Storage y **solo si ambos borrados tienen éxito** se elimina el documento en Firestore (`lookbook/{entryId}`). Si falla Storage, la UI muestra un error y conserva la entrada.
  - Al eliminar un outfit (`outfits/{outfitId}`), **NO** se eliminan sus entradas del lookbook; conservan el `outfitSnapshot` congelado (sin `anchor`/`transform`) y muestran `"Outfit eliminado"`.
- **Relación con `outfit_uses`:** La colección reservada `outfit_uses` de Fase 2 se conserva como marcador de extensión; en una fase futura podrá derivarse del lookbook y retirarse. `outfits/{outfitId}` mantiene `lastWornOn` y `wornCount` actualizados de forma atómica con `increment(1)` en el mismo batch al crear una entrada.
- **Limpieza obligatoria al eliminar cuenta (pendiente en automatización):**
  - Antes o al eliminar una cuenta en Firebase Authentication, es **obligatorio** borrar en cascada todos los documentos del usuario (`garments`, `outfits`, `lookbook`, `users/{uid}`) y sus carpetas en Cloud Storage (`garments/{uid}/`, `outfits/{uid}/`, `lookbook/{uid}/`).
  - **Procedimiento actual (manual desde consola):** Ejecuta la limpieza desde Firebase Console (*Authentication* + *Firestore* + *Storage*) o mediante un script administrativo con Firebase Admin SDK al atender solicitudes de baja (no hay Cloud Functions desplegadas en el proyecto).

---

## 8. Criterios de Aceptación Verificados

- Registro / login con correo y Google OAuth (popup con fallback a redirect) + onboarding de avatar 2D y 3D lado a lado en vivo bajo el mismo `avatarConfig` (`renderer: '2d' | '3d' | 'photo'`).
- Captura de prenda desde cámara o galería → recorte cuadrado → cadena gratuita de eliminación de fondo (`'imgly'` en Web Worker → `'solid-bg'` varita mágica interactiva → `'manual-brush'` pincel con deshacer y fantasma → fallback seguro a foto original) → selector visual de `template3d` (8 opciones de lista cerrada + auto-sugerencia) → guardado en WebP (`full` 1200px, `thumb` 400px, `cutout` con alpha) + cola offline en IndexedDB.
- Closet virtual con grid responsive, búsqueda y filtros en cliente, edición inline (incluyendo `template3d` y aviso `"solo en vista 2D"` en accesorios) y eliminación atómica (Firestore + 3 archivos de Storage).
- Armador con toggle **2D | 3D** sobre el mismo borrador de outfit (`useOutfitDraftStore`), reglas de compatibilidad (`dress` vs `top/bottom`, 3 subslots de accesorios), controles accesibles 3D (rotar, zoom, centrar, captura WebP), visor pseudo-3D aislado bajo demanda, avisos en 3D para accesorios o prendas sin plantilla y guardado de outfits por colección (usando captura 3D si existe o preview compuesto 2D).
- **Mi Lookbook (`/lookbook` y `/lookbook/:id`):** consentimiento explícito v1 recordado en `localStorage`, subida exclusiva a `lookbook/{uid}/` (full 1600px + thumb 400px WebP con orientación EXIF sin eliminación de fondo ni recorte), renderizado estricto con `getBlob()` + `objectURL` (nunca `getDownloadURL`), actualización atómica de `lastWornOn` + `wornCount` (`increment(1)`), overlay digital vs real en grid, conservación histórica con `"Outfit eliminado"` si se borra el outfit y borrado Storage-primero en entradas.
- PWA instalable (`manifest.webmanifest`, íconos 192/512/maskable/apple-touch-icon, botón in-app + guía iOS, indicador offline, precache del shell + `models/manifest.json`, `CacheFirst` en `/models/**`, `StaleWhileRevalidate` en Storage sin `?token`, sin cachear Firestore en Workbox).
