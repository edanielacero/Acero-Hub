# Daily — Documento Maestro

## Descripción general
Mini-app del Hub en la ruta `/daily`. Permite al usuario subir archivos para extraer sus nombres y generar un reporte de actividad diaria en texto, listo para copiar al clipboard.

---

## Funcionalidad principal

### 1. Subida de archivos
- El usuario sube uno o varios archivos a la vez (por lote)
- La app **no abre ni guarda** el contenido de los archivos — solo extrae el nombre
- Tras cada lote, la app pregunta: **¿EDIT o MU CREATED?**
- El usuario puede subir múltiples lotes y los archivos se acumulan en la lista

### 2. Categorías de archivos
| Categoría | Descripción |
|-----------|-------------|
| **EDITS** | Archivos en los que ya se estaba trabajando (ediciones) |
| **MU CREATED** | Archivos nuevos creados desde cero (Mock Ups) |

### 3. Formato del texto final
```
What I Did Today:

EDITS
	• archivo1.psd
	• archivo2.ai

MU CREATED
	• archivo3.psd

What I'll do Tomorrow:
	• Keep working on pending tasks
	• Meeting

Blockers/Issues:
	• None
```

> **Regla de día:** Si hoy es **viernes**, el encabezado dice `What I'll do Monday:` en vez de `What I'll do Tomorrow:`. Se detecta automáticamente por fecha del sistema.

### 4. Secciones editables
Las siguientes secciones son texto libre, editables por el usuario antes de copiar:
- Bullets de **"What I'll do Tomorrow/Monday"** (por defecto: "Keep working on pending tasks" y "Meeting")
- Bullets de **"Blockers/Issues"** (por defecto: "None")

### 5. Copiar al clipboard
- Botón **"Copy"** que copia el texto completo formateado
- Confirmación visual al copiar

---

## Comportamiento y restricciones
- La lista **no persiste** entre sesiones (vive solo en memoria mientras la pestaña está abierta)
- El usuario puede **eliminar archivos** individuales de la lista antes de copiar
- No hay límite de archivos por lote

---

## Estructura de archivos (dentro del Hub)
```
app/
└── daily/
    ├── layout.tsx       ← Layout autónomo de la mini-app
    └── page.tsx         ← Página principal con toda la lógica
```

---

## Flujo de usuario
1. Usuario entra a `/daily`
2. Arrastra o selecciona archivos
3. App pregunta: ¿EDIT o MU CREATED?
4. Los nombres se agregan a la sección correspondiente
5. (Opcional) El usuario edita bullets de "Tomorrow" y "Blockers"
6. (Opcional) El usuario elimina archivos de la lista
7. Usuario presiona **Copy** → texto formateado al clipboard

---

## Notas de diseño
- Mini-app autónoma: no contamina `app/layout.tsx` ni `globals.css` del Hub
- Toda la lógica, estilos y estado viven en los archivos bajo `app/daily/`
- Sin base de datos, sin API, sin autenticación

---

*Documento creado: 2026-07-10*

---

## Sprints de desarrollo

Los sprints están ordenados por dependencia: cada uno construye sobre el anterior. No se puede avanzar al siguiente sin completar el actual.

---

### Sprint 1 — Estructura base + Upload + Categorización
> **Prioridad: Indispensable. Todo lo demás depende de este sprint.**

Este sprint establece la mini-app funcional en su nivel más básico: el usuario puede subir archivos y categorizarlos.

**Tareas:**
- [ ] Crear `app/daily/layout.tsx` — layout autónomo de la mini-app
- [ ] Crear `app/daily/page.tsx` — página principal
- [ ] Zona de carga: drag & drop + click para seleccionar archivos (múltiples a la vez)
- [ ] Extracción del nombre de cada archivo del lote (sin abrir ni guardar contenido)
- [ ] Modal de categorización post-carga: el usuario elige **EDIT** o **MU CREATED** para el lote completo
- [ ] Estado en memoria: dos listas separadas (`edits[]` y `muCreated[]`) que se acumulan con cada lote
- [ ] Botón de eliminar archivo individual de cada lista

**UI de este sprint:**
- Zona de drop visible y clara (borde punteado, ícono, texto de instrucción)
- Modal simple centrado con dos opciones: `EDIT` / `MU CREATED`
- Lista de archivos por categoría con botón de eliminar (×) por ítem

**Criterio de éxito:** El usuario puede subir múltiples lotes, elegir categoría para cada uno, ver la lista acumulada y eliminar ítems individuales.

---

### Sprint 2 — Generación de texto + Secciones editables + Copy
> **Depende de: Sprint 1**

Este sprint convierte las listas del Sprint 1 en el texto formateado final, listo para copiar.

**Tareas:**
- [ ] Generar texto formateado en tiempo real con la estructura definida
- [ ] Detección automática del día: si es **viernes** → `What I'll do Monday:`, cualquier otro día → `What I'll do Tomorrow:`
- [ ] Sección "What I'll do Tomorrow/Monday" con bullets editables (valor por defecto: "Keep working on pending tasks" y "Meeting")
- [ ] Sección "Blockers/Issues" con bullets editables (valor por defecto: "None")
- [ ] Poder agregar y eliminar bullets en las secciones editables
- [ ] Botón **Copy** que copia el texto completo al clipboard
- [ ] Feedback visual al copiar (ej: botón cambia a "Copied ✓" por 2 segundos)

**UI de este sprint:**
- Panel de preview del texto final (o área de texto de solo lectura visualmente)
- Campos editables integrados en el flujo (no interrumpen el layout)
- Botón Copy destacado, con estado de confirmación visual

**Criterio de éxito:** El usuario puede ver el texto generado, editar las secciones libres y copiarlo al clipboard con un clic.

---

### Sprint 3 — Pulido UI/UX
> **Depende de: Sprint 1 + Sprint 2**

Este sprint refina la experiencia sin agregar funcionalidad nueva. La app ya funciona; aquí se pule.

**Tareas:**
- [ ] Estado vacío: pantalla inicial cuando no hay archivos cargados aún
- [ ] Feedback visual al hacer drag (hover sobre la zona de drop)
- [ ] Animaciones suaves al agregar/eliminar archivos de las listas
- [ ] Transición al aparecer el modal de categorización
- [ ] Diseño responsive (funciona bien en pantallas medianas y grandes)
- [ ] Revisión general de tipografía, espaciado y consistencia visual

**UI de este sprint:**
- Misma estructura visual que los sprints anteriores, refinada
- Micro-interacciones (hover, focus, transiciones)
- Estado vacío con ilustración o mensaje guía

**Criterio de éxito:** La app se siente terminada y pulida. Sin bugs visuales, sin estados sin manejar.
