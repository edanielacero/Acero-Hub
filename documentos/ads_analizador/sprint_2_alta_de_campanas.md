# Ads Analizador — Sprint 2: "Alta de campañas y home"

> Documento maestro: `documento_maestro_ads_analizador.md`.
> Sprint anterior: `sprint_1_fundaciones_y_reglas.md` (1).
>
> Este documento especifica **únicamente el Sprint 2** — lo suficiente para
> empezar a programar sin volver a decidir nada.
>
> Última actualización: 2026-09-28 · Estado: **construido**. Desviaciones en
> §0.

---

## 0. Lo que cambió al construirlo

- **El id va en el query, no en el path:** `/ads-analizador/campana?id=…` y
  `/ajustes?id=…`. Así las cuatro URLs son enumerables en el build y la ruta
  queda estática (`dynamicParams = false`), igual que Finanzas y Gas.
- **Validación en `lib/ads-analizador/validar.ts`**, pura y probada en `unit`.
  Suma dos reglas que la spec no tenía: el margen no puede ser mayor que el
  precio (daría un ROAS de equilibrio menor a 1, sin sentido), y la cuenta
  publicitaria se acepta con o sin `act_`.
- **Una campaña sin datos se pinta en gris ("Sin datos")**, no en amarillo:
  no hay nada que revisar todavía. Tampoco cuenta en el resumen del home.
- En el alta, el margen se copia del precio mientras no lo toques (en digital
  suelen ser iguales) y se muestra el ROAS de equilibrio/objetivo en vivo.

**Verificación:** `api.mjs` → secciones de alta, lista, aislamiento entre dos
usuarios, edición y borrado en cascada, todas en verde. Capturas reales en
Chrome a 1280 px y 390 px sin scroll horizontal ni errores de consola.

## 1. Objetivo del sprint

Que el usuario pueda agregar una campaña **pegando su ID de Meta a mano**
(todavía sin el picker en vivo — eso es Sprint 3), verla en el home con el
semáforo de `calc.ts` aplicado a lo que haya (aunque sea nada), y editarla o
pausarla. Ningún dato viene de Meta ni de Stripe todavía: el home de este
sprint muestra campañas "sin datos aún".

### Definición de "terminado"

- [ ] `POST /api/ads-analizador/campaigns` crea una campaña con los 6 campos
      requeridos, validados en el servidor
- [ ] `GET /api/ads-analizador/campaigns` lista las campañas del usuario, cada
      una con su `EstadoCampana` ya calculado
- [ ] El home muestra una tarjeta por campaña con el semáforo, o el estado
      "sin datos aún" para una recién creada
- [ ] `PATCH /api/ads-analizador/campaigns/[id]` edita precio, margen,
      `roas_objetivo` y pausa/reactiva (`activo`)
- [ ] `DELETE /api/ads-analizador/campaigns/[id]` borra la campaña y, en
      cascada, sus métricas/ventas/pagos/cambios
- [ ] Todas las rutas usan `requireUser()`; ninguna usa `createAdminClient()`
- [ ] `npm run build` pasa sin errores

---

## 2. Alcance

### Entra

| Pieza | Detalle |
|---|---|
| CRUD de campañas | Crear, listar, editar, pausar, borrar — sin ninguna llamada externa |
| `lib/ads-analizador/load.ts` | `cargarCampanas()`: trae las campañas del usuario, agrega sus métricas/ventas/pagos/cambios y llama a `calcularEstado` por cada una |
| `home.tsx` | Lista de tarjetas con semáforo |
| `agregar-campana.tsx` | Formulario: **pegar** `meta_campaign_id` y `meta_ad_account_id`, moneda, tipo de conversión, precio de venta, margen |
| `ajustes-campana.tsx` | Editar precio/margen/`roas_objetivo`, pausar, borrar |
| `components/campaign-card.tsx`, `roas-badge.tsx`, `estado-badges.tsx` | Consumen `EstadoCampana` de `calc.ts` — ya existen desde el Sprint 1, no hay lógica nueva que inventar acá |

### No entra (y en qué sprint entra)

| Fuera | Por qué / dónde |
|---|---|
| Picker en vivo de campañas activas de Meta | Necesita `meta-api.ts` → Sprint 3. Este sprint solo permite pegar el ID a mano — la otra opción que el maestro ya contemplaba |
| Cualquier sync de Meta o Stripe | Sprint 3 |
| Dashboard por campaña (funnel, ventas manuales, registrar cambio) | Sprint 4 |

---

## 3. Modelo de datos

No cambia — usa las 5 tablas del Sprint 1 tal cual.

---

## 4. Reglas de negocio

### 4.1 Validación de alta

Servidor, nunca cliente:

| Campo | Regla |
|---|---|
| `meta_campaign_id`, `meta_ad_account_id` | No vacíos |
| `moneda` | `'USD'` \| `'BOB'` |
| `tipo_conversion` | `'compra_stripe'` \| `'venta_manual'` |
| `precio_venta`, `margen_venta` | `> 0` |
| `(user_id, meta_campaign_id)` | Único — un segundo alta con el mismo ID de Meta responde `409` con un mensaje claro ("Esta campaña ya está trackeada") en vez del error crudo de Postgres |

**`roas_objetivo` nunca se manda en el alta.** Nace `null` — "derivado, nunca
guardado hasta que alguien lo pisa a mano", mismo principio que ya usa
Finanzas para varios de sus campos calculados. `calcularEstado` (Sprint 1)
ya sabe calcular el default (`roasEquilibrio * 1.35`) cuando es `null`; la
base solo guarda un override explícito.

### 4.2 Separador decimal

`precio_venta` y `margen_venta` son inputs de plata en Bolivia — el usuario
puede tipear `24,50`. Los dos campos usan `parseDecimalInput()` (el mismo
helper que ya existe para el resto del Hub), nunca `parseFloat()` directo:
sin eso, `24,50` se guarda como `2450`.

### 4.3 Home sin datos

Una campaña recién creada llega a `cargarCampanas()` con `metricas: []`,
`conversionesConfirmadas: 0`, `ingresoTotal: 0`, `gastoTotal: 0`. Con eso,
`calcularEstado` (§4.8 del Sprint 1) ya devuelve 🟡 "todavía no hay gasto
registrado" sin que `home.tsx` necesite ningún caso especial — es el mismo
motor, con una entrada vacía.

### 4.4 Pausar no es borrar

`activo = false` saca la campaña del sync (Sprint 3 filtra por
`activo = true`) pero no borra nada — sigue visible en el home, en una
sección aparte ("Pausadas"), con su último estado calculado congelado en el
tiempo. Borrar (`DELETE`) es la única acción destructiva, y solo desde
`ajustes-campana.tsx` con una confirmación explícita.

---

## 5. Estructura de archivos

### Nuevos

```
app/api/ads-analizador/
  campaigns/route.ts             GET listar · POST crear
  campaigns/[id]/route.ts        GET detalle · PATCH editar · DELETE

app/ads-analizador/
  screens/home.tsx
  screens/agregar-campana.tsx
  screens/ajustes-campana.tsx
  components/campaign-card.tsx
  components/roas-badge.tsx
  components/estado-badges.tsx

lib/ads-analizador/
  load.ts                        cargarCampanas()
  format.ts                      formateo de moneda multi-divisa (USD/BOB)
```

### Modificados

| Archivo | Cambio |
|---|---|
| `app/ads-analizador/screens/paths.ts` | Rutas de `home`, `agregar-campana`, `ajustes-campana/[id]` |
| `app/ads-analizador/screens/index.tsx` | Resuelve las tres pantallas nuevas en vez del placeholder |
| `lib/ads-analizador/types.ts` | `Campana`, `CampanaInput`, tipos de request/response de los endpoints |

---

## 6. Contratos de API

Todas las rutas: `requireUser()`, `401` sin usuario, cliente con RLS. Nunca
`createAdminClient()`.

### `GET /api/ads-analizador/campaigns`

```jsonc
{
  "campaigns": [{
    "id": "uuid", "nombre": "TOEFL", "moneda": "USD",
    "tipo_conversion": "compra_stripe", "precio_venta": 24.00, "margen_venta": 24.00,
    "roas_objetivo": null, "activo": true,
    "estado": {
      "color": "amarillo", "mensaje": "Colchón por debajo del objetivo — prueba un anuncio o audiencia nueva",
      "banderas": [], "roas_equilibrio": 1.0, "roas_objetivo": 1.35, "roas_actual": 1.28
    }
  }]
}
```

### `POST /api/ads-analizador/campaigns`

```jsonc
{
  "meta_campaign_id": "120211...", "meta_ad_account_id": "act_123...",
  "nombre": "TOEFL", "moneda": "USD", "tipo_conversion": "compra_stripe",
  "precio_venta": 24.00, "margen_venta": 24.00
}
```
`409` si `(user_id, meta_campaign_id)` ya existe.

### `PATCH /api/ads-analizador/campaigns/[id]`

```jsonc
{ "precio_venta": 25.00, "margen_venta": 25.00, "roas_objetivo": 1.4, "activo": false }
```
Todos los campos opcionales — solo pisa lo que venga.

### `DELETE /api/ads-analizador/campaigns/[id]`

Borra la campaña y, por `on delete cascade`, sus filas en las cuatro tablas
hijas. Sin confirmación de servidor — la confirmación es de UI (§7).

---

## 7. UI

### Home

```
Ads Analizador                                    [+ Agregar campaña]
──────────────────────────────────────────────────────────────────
🟡 TOEFL · compra_stripe · USD
   ROAS 1.28x (equilibrio 1.0x · objetivo 1.35x)
   Prueba un anuncio o audiencia nueva antes de subir presupuesto

🟢 Ebook TOEFL Bolivia · venta_manual · BOB
   ROAS 1.84x (equilibrio 1.0x · objetivo 1.35x)
   Sano — puedes seguir escalando verticalmente

── Pausadas ──
⏸ Campaña vieja · sin cambios desde el 12 ago
```

### Agregar campaña

```
Agregar campaña
──────────────────────────────
ID de campaña de Meta   [ 120211...            ]
Cuenta publicitaria     [ act_123...            ]
Nombre                  [ TOEFL                 ]
Moneda                  ( USD )  ( BOB )
Tipo de conversión      ( Compra por Stripe )  ( Venta por WhatsApp )
Precio de venta         [ 24,00 ]
Margen de venta         [ 24,00 ]

              [ Agregar ]
```

Nota para Sprint 3: cuando exista el picker en vivo, esta pantalla gana un
segundo modo ("Elegir de la lista") arriba de estos mismos campos — los
campos de abajo (nombre, moneda, tipo, precio, margen) no cambian.

### Ajustes de campaña

```
TOEFL
──────────────────────────────
Precio de venta    [ 24,00 ]
Margen de venta    [ 24,00 ]
ROAS objetivo       [ 1.35 ]   (vacío = automático: equilibrio × 1.35)

[ Pausar ]                              [ Borrar campaña ]
```

Borrar pide confirmación explícita ("Esto borra también todo su historial de
métricas y ventas. ¿Seguro?").

---

## 8. Verificación

```bash
node tests/ads-analizador/run.mjs api
```
Necesita el dev server levantado (`ADS_BASE_URL`, default `localhost:3000`).
Crea un usuario temporal, le da acceso a `ads-analizador`, trabaja ahí y lo
borra al terminar — mismo patrón que `tests/gas/run.mjs`.

| # | Prueba |
|---|---|
| 1 | Crear una campaña con los 6 campos válidos → `201`, aparece en `GET` |
| 2 | Crear con el mismo `meta_campaign_id` dos veces → `409` en la segunda |
| 3 | Crear con `precio_venta <= 0` → `400` |
| 4 | `"24,50"` en precio de venta se guarda como `24.50`, no `2450` |
| 5 | `GET` de una campaña sin ninguna métrica trae `estado.color === 'amarillo'` y `roas_actual === null` |
| 6 | `PATCH` con `roas_objetivo: 1.4` cambia el cálculo del estado en el siguiente `GET` |
| 7 | `PATCH` con `activo: false` la mueve a "Pausadas" sin borrar nada |
| 8 | `DELETE` borra la campaña y sus filas hijas (verificado con una métrica de prueba insertada antes) |
| 9 | Todas las rutas responden `401` sin sesión |
| 10 | `npm run build` pasa sin errores |

---

## 9. Qué desbloquea

| Qué | Cómo |
|---|---|
| **Sprint 3** | El sync necesita campañas ya creadas y listables para saber sobre cuáles correr |
| **Sprint 4** | Los dashboards por campaña parten de la misma `cargarCampanas()` — solo agregan la vista de detalle |
