# Ads Analizador — Pendientes de configuración

> Lo que falta de tu lado para que la app funcione con datos reales. El código
> de los cuatro sprints está construido y probado; nada de esto bloquea usar la
> app a mano (alta de campañas, ventas por WhatsApp, cambios), pero sin el
> token de Meta no se trae nada de Meta.
>
> **No hay cron.** La app sincroniza sola al abrirse si los datos tienen más de
> 6 horas (`lib/ads-analizador/sync-al-abrir.ts`), y con el botón
> **Actualizar**. Por eso no hace falta `ADS_CRON_SECRET` ni tocar `vercel.json`.
>
> Última actualización: 2026-10-08.

---

## 1. Token de Meta — `META_ACCESS_TOKEN` ✅ local · ⏳ Vercel

**Estado 2026-09-28:** configurado en `.env.local` y verificado contra Meta.
Token de usuario del sistema ("Admin - Acrosoft Agent", app "Acrosoft"), **no
vence**, con `ads_read`. Ve 3 cuentas (Acros Agency Ad Account 1 · USD, Acros
Books · USD, Acros Books Bs · BOB). Sync real probado con TOEFL y Ebook TOEFL
Bolivia. **Falta cargarlo en las variables de entorno de Vercel.**

**La app "Acrosoft" y su usuario del sistema también sirven a otra app tuya que
usa la API de WhatsApp con OTRO token.** Cada token es independiente: generar
uno nuevo no invalida los anteriores, y Ads Analizador solo hace lecturas (`GET`
de campañas e Insights), nunca toca WhatsApp. Para que eso siga así:

- ⛔ **No usar "Revocar tokens"** en la pantalla del usuario del sistema: revoca
  los tokens de ese usuario para la app, incluido el de WhatsApp.
- ⛔ **No resetear la clave secreta de la app** ni quitarle al usuario del
  sistema la app o los activos de WhatsApp.
- ⛔ No borrar el usuario del sistema.

Nota de seguridad, opcional: este token trae además permisos de WhatsApp
(`whatsapp_business_messaging`, `whatsapp_business_management`,
`manage_app_solution`). Si se filtrara la variable de entorno, alguien podría
mandar mensajes, no solo leer anuncios. Si en algún momento quieres acotarlo, se
puede generar **otro** token desde el mismo usuario del sistema marcando solo
`ads_read` y reemplazar la variable — sin revocar nada, así el de WhatsApp sigue
intacto.

El token es de un **usuario del sistema**, no uno personal: el personal vence a
los 60 días y la sincronización deja de funcionar en silencio. Para generarlo hace falta **primero una
app de desarrollador**: sin una app asignada, el botón "Generar token" del
usuario del sistema no ofrece nada que elegir.

**A. Crear la app** (en [developers.facebook.com](https://developers.facebook.com/apps))

1. **Crear app** → caso de uso **Otro** → tipo **Negocios** (Business).
2. Nombre: por ejemplo "Ads Analizador". Vincúlala a tu **portafolio comercial**
   (el mismo donde están las cuentas publicitarias).
3. Dentro de la app → **Agregar producto** → **Marketing API**.

La app puede quedar en modo desarrollo: para leer tus propias cuentas
publicitarias alcanza con el acceso estándar de Marketing API, no hace falta
revisión de Meta.

**B. Crear el usuario del sistema** (en
[business.facebook.com/settings](https://business.facebook.com/settings) →
Usuarios → **Usuarios del sistema**)

4. **Agregar** → nombre "ads-analizador" → rol **Empleado** (alcanza para leer).
5. **Asignar activos** al usuario del sistema:
   - **Apps** → la app del paso A → control total.
   - **Cuentas publicitarias** → la de USD del curso y la de BOB del ebook →
     permiso **Ver rendimiento** (solo lectura).

**C. Generar el token**

6. En el usuario del sistema → **Generar nuevo token** → elegir la app del
   paso A → caducidad **Nunca** → permiso **`ads_read`** → Generar.
7. Copiarlo en ese momento (no se vuelve a mostrar) y guardarlo como
   `META_ACCESS_TOKEN` en `.env.local` **y** en las variables de entorno del
   proyecto en Vercel.

**Si algo no aparece:** Meta cambia los nombres de estas pantallas seguido. Si
no ves "Usuarios del sistema", es que tu usuario de Facebook no es
**administrador** del portafolio comercial. Si el portafolio no está
verificado, Meta limita cuántos usuarios del sistema se pueden crear; uno
alcanza para esto.

La app usa la Graph API **v24.0** (`lib/ads-analizador/meta-api.ts`,
`META_API_VERSION`). Si Meta la da de baja, es cambiar esa constante.

## 2. Stripe — no se usa

Se sacó la integración con la API de Stripe (2026-09-28, decisión del usuario).
Las campañas de compras toman las compras que reporta Meta, corregibles a mano
día por día, y el neto después de comisiones se carga a mano. No hace falta
`STRIPE_SECRET_KEY_ADS`.

## 3. Acceso a la mini-app ✅

Ya tienes acceso (diste de alta "Ebook TOEFL Bolivia" desde tu cuenta).

## 4. Después del próximo deploy

`vercel.json` no cambia (sigue solo el cron de Finanzas). Igual, apenas se
despliegue:

- Comparar `git ls-remote origin master` con el HEAD local.
- `curl -i https://acrosmkt.com/api/ads-analizador/campaigns` debe dar **401**.
  Un **404** significa que el build no llegó a producción.

## 5. Confirmar el evento de WhatsApp (5 minutos, una vez)

Para campañas `venta_manual`, la app cuenta como "resultado de Meta" la primera
de estas acciones que encuentre en Insights:

1. `onsite_conversion.messaging_conversation_started_7d`
2. `onsite_conversion.total_messaging_connection`
3. `onsite_conversion.messaging_first_reply`

Es lo habitual para campañas de mensajes. Después del primer sync real, mira en
el dashboard del ebook si "Conversaciones" coincide con lo que Ads Manager
muestra como resultado. Si no, avísame qué evento usa la campaña y se agrega a
la lista (`EVENTO_OPTIMIZADO` en `meta-api.ts`).

## 6. Confirmar el evento de las campañas de llamadas (cuando tengas una)

Para campañas `llamadas`, la app toma como "lead" la primera de estas acciones
que encuentre: `schedule_total`, `schedule_website`,
`offsite_conversion.fb_pixel_schedule`, `lead`, `onsite_conversion.lead_grouped`,
`offsite_conversion.fb_pixel_lead`. Después del primer sync, compara la columna
"Leads" con el resultado que muestra Ads Manager; si no coincide, avísame qué
evento usa y se agrega a `EVENTO_OPTIMIZADO` en `meta-api.ts`.

La migración `20261008000000_ads_analizador_reglas_v2.sql` ya está aplicada en
Supabase; no hay que hacer nada más para el deploy.

---

## Limitaciones conocidas (decisiones, no bugs)

| Qué | Por qué | Qué haría falta |
|---|---|---|
| El embudo arranca en **impresiones**, no en alcance | El alcance diario no se puede sumar sin contar dos veces a la misma persona | Pedir a Meta el alcance del rango completo (otra consulta por campaña) |
| El semáforo ignora **hoy** | El día en curso está incompleto; los totales y la tabla sí lo muestran | — |
