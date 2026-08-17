# DRC Finanzas — Dashboard en vivo

Dashboard financiero de DRC Academy que lee sus métricas **en tiempo real**
desde el Google Sheet de KPIs (hoja `DB_KPI` y hojas relacionadas). Construido
con Next.js 16 (App Router) + TypeScript + Tailwind + Google Sheets API.

Páginas: **Resumen Ejecutivo**, **Captación** (mensual y semanal), **Ingresos**,
**Retención**, **Situación Financiera**, **Producto** y **Profesores**.

Hay **dos fuentes de datos independientes**: el Google Sheet (casi todo) y el
endpoint de **DRC Gestión**, que alimenta entera la página de Profesores
(ver §11). Si una falla, la otra sigue funcionando.

---

## 1. Cómo funciona la lectura del Sheet

- El servidor (API routes en `src/app/api/*`) se conecta a Google Sheets con
  una **Service Account** (no con tu cuenta personal), usando el paquete
  `googleapis`.
- Cada endpoint cachea la respuesta 60 segundos (`src/lib/cache.ts`) para no
  saturar la API de Sheets — el navegador hace polling cada 60s
  (`src/hooks/useLiveData.ts`), así que los números se actualizan solos sin
  recargar la página.
- Si una hoja no existe o falta una columna, la página muestra "Sin datos"
  en vez de romperse.

## 2. Preparar el Google Sheet

Estructura esperada:

| Hoja | Uso |
|---|---|
| `DB_KPI` | Métrica por mes (transpuesta): col. A = mes, fila 1 = claves técnicas |
| `KPI Producto` | Ingresos por producto/plan y mes (misma lógica transpuesta) |
| `Cohortes Clientes` | Heatmap de retención por cohorte |
| `Cohortes Producto` | Heatmap de retención por producto |
| `Cancelaciones` | Motivo, fecha, suscripción |
| `Cupon` | Fecha, cupón, suscripción, impacto |
| `Renovaciones` | Suscripción, estado, fecha |

## 3. Crear la Service Account (una sola vez)

1. Andá a Google Cloud Console → creá o elegí un proyecto.
2. **APIs y servicios → Biblioteca** → buscá "Google Sheets API" → **Habilitar**.
3. **APIs y servicios → Credenciales → Crear credenciales → Cuenta de servicio**.
   Nombre: `drc-dashboard-reader` (o el que prefieras) → Crear y continuar → Listo.
4. Entrá a la cuenta de servicio creada → pestaña **Claves** → **Agregar clave
   → Crear clave nueva → JSON**. Se descarga un archivo `.json`.
5. Abrí ese JSON: necesitás dos campos:
   - `client_email` → esto es `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → esto es `GOOGLE_PRIVATE_KEY`

## 4. Compartir el Sheet con la Service Account

En tu Google Sheet real (el que tiene `DB_KPI`, etc.):

1. Botón **Compartir**.
2. Pegá el `client_email` de la Service Account (termina en
   `...iam.gserviceaccount.com`).
3. Rol: **Lector** (Viewer) alcanza, es acceso de solo lectura.

## 5. Variables de entorno

Copiá `.env.local.example` a `.env.local` y completá:

```
GOOGLE_SHEET_ID=1AbC...XYZ            # el ID de la URL del Sheet
GOOGLE_SERVICE_ACCOUNT_EMAIL=drc-dashboard-reader@tu-proyecto.iam.gserviceaccount.com
```

Para la private key tenés **dos opciones** (elegí una):

### Opción A — `GOOGLE_PRIVATE_KEY_B64` (recomendada)

La private key codificada en **base64**. Es la opción recomendada, sobre todo
para Vercel: al pegar la clave cruda en un panel web se corrompen los `\n` y las
comillas, lo que provoca el error
`error:1E08010C:DECODER routines::unsupported / ERR_OSSL_UNSUPPORTED`. El base64
es una sola línea sin caracteres especiales, así que no se rompe al pegarlo.

Generala a partir del valor `private_key` del JSON de la Service Account:

```bash
# Linux/macOS
base64 -w0 private_key.pem
```

```powershell
# Windows PowerShell (el valor incluye los saltos de línea reales de la clave)
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($privateKey))
```

```
GOOGLE_PRIVATE_KEY_B64=LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0t...
```

### Opción B — `GOOGLE_PRIVATE_KEY` (cruda)

La private key tal cual viene en el JSON, con los `\n` literales incluidos y
entre comillas dobles:

```
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"
```

Si definís **ambas**, `GOOGLE_PRIVATE_KEY_B64` tiene prioridad. El código
(`src/lib/sheetsClient.ts`) desescapa los `\n` y saca comillas envolventes si
quedaron pegadas, pero en paneles web como Vercel conviene usar la Opción A.

### Variables del gasto en profesores

Además de las de Google, la sección **Profesores** de Situación Financiera
necesita estas dos (ver §11 para el detalle):

```
DRC_API_URL=https://academy-scheduler-aqpt.vercel.app
DASHBOARD_EXTERNAL_SECRET=          # lo provee DRC Gestión, no se genera acá
```

Sin ellas el dashboard **arranca y funciona igual**: sólo esa sección muestra
"sin datos" (y el servidor loguea que falta la configuración).

## 6. Correr en local

```bash
npm install
npm run dev
```

Abrí `http://localhost:3000` (te redirige a `/resumen`).

## 7. Deploy en Vercel

1. Subí el proyecto a un repo de GitHub (privado, como el resto de tus
   proyectos).
2. Importalo en Vercel.
3. En **Settings → Environment Variables**, cargá las variables del paso 5
   para **Production**, **Preview** y **Development**: las de Google (Sheet ID,
   email de la Service Account y la private key) más `DRC_API_URL` y
   `DASHBOARD_EXTERNAL_SECRET` (§11).
4. Deploy. Cada push a `main` redepliega solo.

## 8. Estructura del proyecto

```
src/
  lib/
    sheetsClient.ts   # cliente autenticado de Google Sheets (solo servidor)
    externalPayouts.ts # gasto en profesores desde DRC Gestión — SOLO servidor (§11)
    cache.ts          # cache en memoria con TTL (60s)
    kpi.ts            # readDBKPI() — SOLO servidor (usa googleapis)
    kpiHelpers.ts     # funciones puras (series, MoM, semáforo, formatos) — cliente y servidor
    cohortes.ts       # lectura de hojas de cohortes
    relaciones.ts     # lectura de Cancelaciones / Cupon / Renovaciones
    productoKpi.ts    # lectura de "KPI Producto"
    gastos.ts         # módulo DESACOPLADO de gastos (placeholder, ver comentario en el archivo)
  hooks/
    useLiveData.ts    # polling client-side cada 60s
  components/ui/      # KpiCard, TrendChart, CohortHeatmap, FunnelSteps, etc.
  app/
    api/              # endpoints internos que exponen los lib/* al cliente
    (dashboard)/      # las 5 páginas + layout con sidebar
```

## 9. Conectar el módulo de gastos cuando esté listo

`src/lib/gastos.ts` devuelve datos placeholder (todos en 0€) y un flag
`esPlaceholder: true`. Cuando tu software de gestión tenga un endpoint de
gastos operativos, reemplazá el cuerpo de `readGastos()` por el fetch real
manteniendo la misma forma de respuesta (`{ categorias, total, esPlaceholder: false }`).
La UI de `/financiera` no necesita cambios.

## 10. Identidad visual

Verde `#1E9E3A`, amarillo `#FFC400`, fondo `#F7F7F5`, tipografía Radio Canada
(texto) + IBM Plex Mono (cifras, para lectura tipo "ledger" en los números).
El semáforo de color en el borde izquierdo de cada tarjeta KPI compara el
valor real contra su objetivo (`*_obj` en `DB_KPI`) cuando existe.

## 11. Página de Profesores (endpoint de DRC Gestión)

`/profesores` es la única página que no sale del Sheet: la sirve entera el
proyecto **DRC Gestión** (`academy-scheduler`), que expone el gasto ya calculado
con su lógica de negocio completa — la misma función de liquidación que ve el
admin en su panel de finanzas. Acá no se reimplementa ningún cálculo ni se lee
su base de datos.

Tiene tres tarjetas (activos ahora, gasto del mes, gasto promedio), la **tabla
de detalle por profesor** (ordenable, con filtros de estado/activo y buscador,
todo en el cliente sobre el array que ya vino) y la tendencia mensual.

### Variables de entorno

| Variable | Qué es |
|---|---|
| `DRC_API_URL` | URL base del proyecto DRC Gestión, sin barra final (ej. `https://academy-scheduler-aqpt.vercel.app`) |
| `DASHBOARD_EXTERNAL_SECRET` | Secreto compartido que viaja en la cabecera `X-Dashboard-Secret`. **Lo provee DRC Gestión** (es el valor de su propia variable homónima): no se genera en este proyecto |

Las dos son **de servidor**: nunca les pongas el prefijo `NEXT_PUBLIC_`, eso
publicaría el secreto en el bundle del navegador.

### Por qué el fetch es siempre desde el servidor

El endpoint remoto **no emite cabeceras CORS a propósito**, para forzar que la
llamada sea servidor a servidor. En este proyecto:

- `src/lib/externalPayouts.ts` es el único que conoce el secreto — **solo
  servidor**, igual que `sheetsClient.ts`.
- La página (`"use client"`) habla con las rutas internas
  `/api/profesores?month=YYYY-MM` y `/api/profesores/summary?from=&to=`, que son
  las que llaman al endpoint externo.

Las dos rutas tienen valores por defecto propios, calculados en el servidor en
hora de Madrid (la zona con la que DRC Gestión decide cuál es el mes en curso):
sin `month`, el detalle devuelve el mes actual; sin `from`/`to`, la serie
devuelve los últimos 12 meses hasta el actual. De esa serie salen también los
meses del desplegable de la página, y por eso **el mes en curso se puede elegir**
aunque el Sheet vaya un mes por detrás.

### Qué pasa si el endpoint no responde

Nada se rompe. `readPayoutsMonth()` y `readPayoutsSummary()` nunca lanzan:
loguean el diagnóstico en el servidor y devuelven `null`, y la página muestra
el `EmptyState` de siempre. Cada código tiene su mensaje propio, porque no los
arregla la misma persona:

| Código | Significado | De quién es el problema |
|---|---|---|
| 401 | El secreto falta o no coincide | **Nuestro** (config de este proyecto) |
| 400 | Parámetros mal formados | **Nuestro** (bug al armar la query) |
| 503 | DRC Gestión no tiene su variable configurada | Del otro lado |
| 500 | Error interno al calcular la liquidación | Del otro lado |
| Otros / timeout | Endpoint no desplegado, red caída, etc. | A investigar |

El resto del dashboard (que lee de Google Sheets) no se ve afectado: son dos
fuentes independientes.

### Dos detalles del dato que conviene no olvidar

- **`active_teachers_now` es una foto del presente**, no una serie: son los
  profesores con al menos un alumno activo *hoy*, y sale igual pidas el mes que
  pidas. Por eso la tarjeta dice "ahora" y aclara que no cambia con el mes
  elegido, y por eso **no se grafica** en la tendencia (ahí va
  `teachers_with_amount`, que sí varía mes a mes).
- **El gasto promedio se divide por `teachers_with_amount`**, no por
  `active_teachers_now`: dividir por un número que no varía daría un promedio
  diluido en los meses viejos sin actividad.

### Lo que todavía NO está

**Facturación y margen bruto por profesor.** Haría falta el importe de
WooCommerce por alumno, y está sin confirmar si DRC Gestión puede darlo sin
salir a consultar la API de Woo en vivo. La tabla está preparada para recibirlas
como columnas nuevas (`sortKey` + celda en `PayoutsTable`), pero no se muestran
placeholders: una columna vacía se termina leyendo como un cero.

<!-- test de conexión post-transferencia: 2026-08-17 -->

