import type { DBKpiData, MetricValue } from "@/types/kpi";

/** Serie temporal de una métrica a lo largo de todos los meses disponibles. */
export function getSeries(
  kpi: DBKpiData,
  key: string
): { month: string; value: MetricValue }[] {
  return kpi.months.map((month) => ({
    month,
    value: kpi.data[month]?.[key] ?? null,
  }));
}

/** Último valor no nulo de una métrica (o null si no hay datos). */
export function getLatest(kpi: DBKpiData, key: string): MetricValue {
  for (let i = kpi.months.length - 1; i >= 0; i--) {
    const v = kpi.data[kpi.months[i]]?.[key];
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

/** Valor del mes anterior al último con dato (para variación MoM). */
export function getPrevious(kpi: DBKpiData, key: string): MetricValue {
  let seen = 0;
  for (let i = kpi.months.length - 1; i >= 0; i--) {
    const v = kpi.data[kpi.months[i]]?.[key];
    if (v !== null && v !== undefined) {
      seen++;
      if (seen === 2) return v;
    }
  }
  return null;
}

/** Variación porcentual mes a mes. Devuelve null si no se puede calcular. */
export function getMoM(kpi: DBKpiData, key: string): number | null {
  const latest = getLatest(kpi, key);
  const prev = getPrevious(kpi, key);
  if (latest === null || prev === null || prev === 0) return null;
  return ((latest - prev) / Math.abs(prev)) * 100;
}

/**
 * Valor de una métrica en un mes concreto (el que elige el usuario en el
 * desplegable de mes), en vez de asumir el último. Devuelve null si ese mes no
 * tiene dato para la clave. No reemplaza a getLatest: convive con él.
 */
/**
 * De las claves que una página necesita, cuáles NO están en DB_KPI.
 *
 * NO es lo mismo que un valor null, y por eso es una función aparte. Un null
 * es "la columna existe y ese mes no tiene dato"; una clave ausente es "la
 * columna no llegó a la hoja". En pantalla las dos se ven idénticas —un "—"—
 * y son problemas distintos: la primera se resuelve cargando el mes, la
 * segunda es una métrica caída para TODOS los meses.
 *
 * Pasa más de lo que parece. DB_KPI no es una tabla escrita a mano: es una
 * única fórmula en A1 que transpone y FILTRA la hoja "KPI General", y ese
 * filtro DESCARTA la fila entera de cualquier métrica cuyo cálculo dé error.
 * Una fórmula rota río arriba —una celda pegada a mano que bloquea una
 * arrayformula, por ejemplo— no llega acá como #N/A: llega como una columna
 * que dejó de existir, en silencio. Sin este guardia eso se lee como “falta
 * cargar el mes” cuando en realidad la métrica no está para ningún mes.
 */
export function clavesAusentes(kpi: DBKpiData, claves: string[]): string[] {
  // kpi.keys vacío NO es "faltan todas": es que DB_KPI no se pudo leer (Sheets
  // caído, hoja renombrada, credenciales). De eso ya avisa el EmptyState de la
  // página, y devolver acá la lista entera lo taparía con un muro de ruido.
  if (kpi.keys.length === 0) return [];
  const presentes = new Set(kpi.keys);
  return claves.filter((clave) => !presentes.has(clave));
}

export function getValueAtMonth(
  kpi: DBKpiData,
  key: string,
  month: string
): MetricValue {
  if (!month) return null;
  const v = kpi.data[month]?.[key];
  return v === null || v === undefined ? null : v;
}

/**
 * Variación mes a mes calculada respecto al mes elegido: compara el valor del
 * mes seleccionado contra el mes anterior con dato (dentro de kpi.months).
 * Devuelve null si no se puede calcular.
 */
export function getMoMAtMonth(
  kpi: DBKpiData,
  key: string,
  month: string
): number | null {
  const idx = kpi.months.indexOf(month);
  if (idx < 0) return null;
  const latest = getValueAtMonth(kpi, key, month);
  if (latest === null) return null;
  let prev: MetricValue = null;
  for (let i = idx - 1; i >= 0; i--) {
    const v = kpi.data[kpi.months[i]]?.[key];
    if (v !== null && v !== undefined) {
      prev = v;
      break;
    }
  }
  if (prev === null || prev === 0) return null;
  return ((latest - prev) / Math.abs(prev)) * 100;
}

/**
 * Delta ABSOLUTO respecto al mes anterior con dato, en la unidad de la métrica
 * (€, pedidos, ...) en vez de en %. Mismo criterio de "mes anterior" que
 * getMoMAtMonth: el anterior CON dato, no el inmediatamente previo.
 *
 * A diferencia de getMoMAtMonth, sí devuelve valor cuando el mes anterior es 0
 * (ahí el % no existe pero el delta sigue siendo informativo).
 */
export function getDeltaAtMonth(
  kpi: DBKpiData,
  key: string,
  month: string
): number | null {
  const idx = kpi.months.indexOf(month);
  if (idx < 0) return null;
  const latest = getValueAtMonth(kpi, key, month);
  if (latest === null) return null;
  for (let i = idx - 1; i >= 0; i--) {
    const v = kpi.data[kpi.months[i]]?.[key];
    if (v !== null && v !== undefined) return latest - v;
  }
  return null;
}

/**
 * Promedio de los últimos `n` meses CON DATO hasta el mes indicado (incluido).
 * Salta los huecos en vez de cortarse en ellos: un mes sin valor no debería
 * dejar la media a medias. Devuelve null si no hay ningún mes con dato.
 *
 * Ojo con las columnas de cashflow: los meses en los que todavía no se cargó el
 * cuadro de resultados vienen como 0, no como vacío, así que sí entran en la
 * media. Es lo que dice el Sheet y no lo maquillamos acá.
 */
export function getAverageAtMonth(
  kpi: DBKpiData,
  key: string,
  month: string,
  n: number
): number | null {
  const idx = kpi.months.indexOf(month);
  if (idx < 0 || n <= 0) return null;
  const valores: number[] = [];
  for (let i = idx; i >= 0 && valores.length < n; i--) {
    const v = kpi.data[kpi.months[i]]?.[key];
    if (v !== null && v !== undefined) valores.push(v);
  }
  if (valores.length === 0) return null;
  return valores.reduce((s, v) => s + v, 0) / valores.length;
}

export type SemaforoColor = "green" | "yellow" | "red" | "blue" | "neutral";

/**
 * Compara un valor real contra su objetivo.
 * `lowerIsBetter`: true para métricas donde bajar es bueno (CAC, CPL, churn).
 */
export function getSemaforo(
  real: MetricValue,
  objetivo: MetricValue,
  lowerIsBetter: boolean
): SemaforoColor {
  if (real === null || objetivo === null || objetivo === 0) return "neutral";

  const ratio = lowerIsBetter ? objetivo / real : real / objetivo;

  if (ratio >= 1) return "green";
  if (ratio >= 0.85) return "yellow";
  return "red";
}

/**
 * Paleta de las alertas operativas, alineada 1:1 con SemaforoColor para que la
 * "pestañita"/borde lateral de la tarjeta pueda pintarse del mismo color que el
 * chip. Semántica de mejor → peor:
 *   EN OBJETIVO → azul  ·  BIEN → verde  ·  MEJORABLE → amarillo  ·  PELIGRO → rojo
 */
export type AlertaColor = "blue" | "green" | "yellow" | "red";

export interface AlertaOperativa {
  texto: string;
  color: AlertaColor;
}

/** Traduce el color de una alerta al color del semáforo (borde) de la tarjeta. */
export function alertaToSemaforo(color: AlertaColor): SemaforoColor {
  return color; // AlertaColor ⊂ SemaforoColor por diseño
}

/** Métricas con umbrales de alerta definidos. */
export type AlertaKey =
  | "CPL_ads"
  | "CAC"
  | "CR_clientes"
  | "clientes_churn"
  | "LTV_CAC";

/**
 * OBJETIVO y LÍMITE de las métricas con umbrales fijos. Son constantes de
 * negocio, NO columnas del Sheet: DB_KPI trae CPL_obj/CAC_obj/CR_obj (con los
 * mismos valores de objetivo), pero ninguna columna de límite.
 *
 * Viven acá — y no sueltos dentro de getAlertaOperativa — porque las tarjetas
 * de CPL/CAC/CR los reutilizan como hints ("Objetivo: X" / "Límite: Y"). Un
 * único número por umbral: si cambia el criterio, cambian a la vez el chip de
 * alerta y el hint.
 *
 * CPL y CAC van en € (cuanto más bajo, mejor → el límite está POR ENCIMA del
 * objetivo). CR va en FRACCIÓN 0-1 igual que el Sheet y es al revés: cuanto más
 * alto mejor, así que su límite está POR DEBAJO del objetivo.
 */
export const CPL_OBJETIVO = 12;
export const CPL_LIMITE = 20;
export const CAC_OBJETIVO = 65;
export const CAC_LIMITE = 120;
export const CR_OBJETIVO = 0.28;
export const CR_LIMITE = 0.2;

/**
 * CHURN MENSUAL (clientes_churn) — en FRACCIÓN 0-1, como lo guarda el Sheet.
 * Es una TASA de pérdida: cuanto más alta, peor.
 *
 * El objetivo (20%) no es un número inventado: coincide con la columna
 * churn_obj de DB_KPI, que vale 0,2 en todos los meses. El límite (25%) sí es
 * una constante de negocio sin columna en el Sheet.
 *
 * Ojo: estos umbrales son SÓLO para clientes_churn (churn mensual). El churn a
 * 3 meses (clientes_churn_3m, tarjeta "Churn 3M" de Retención) mide otra cosa —
 * la ventana trimestral, siempre más alta — y se deja sin alerta hasta tener
 * umbrales propios.
 */
export const CHURN_OBJETIVO = 0.2;
export const CHURN_LIMITE = 0.25;

/**
 * LTV:CAC — el ratio en veces (3 = "cada cliente deja 3× lo que costó traerlo").
 *
 * Los rangos que llegaron tenían un hueco (nada cubría 2x-2,5x) y un solape
 * (">3x BIEN" y ">4x EN OBJETIVO" se pisaban en todo valor > 4x). Se cerró el
 * hueco bajando MEJORABLE a 2x y se cortó el solape dejando BIEN acotado a
 * 3x-4x, con EN OBJETIVO reservado a ≥ 4x — el estado mejor, igual que en el
 * resto del dashboard, donde el azul manda sobre el verde.
 */
export const LTV_CAC_MINIMO = 2;
export const LTV_CAC_SANO = 3;
export const LTV_CAC_OBJETIVO = 4;

/**
 * MARGEN EBITDA en % (columna %ebitda), en FRACCIÓN 0-1. Umbrales distintos
 * según se mire el mes suelto o el trimestre: un mes flojo se compensa dentro
 * del trimestre, así que al trimestre se le exige más.
 *
 * El objetivo estacional ("30% en temporada alta, 18-20% en temporada media")
 * queda como TEXTO FIJO: el proyecto no tiene definido en ningún lado qué meses
 * son temporada alta y cuáles media para DRC Academy, y no se inventa acá. La
 * alerta se calcula sólo con los umbrales numéricos de abajo.
 */
export const EBITDA_MENSUAL_LIMITE = 0.1;
export const EBITDA_MENSUAL_OBJETIVO = 0.18;
export const EBITDA_TRIMESTRAL_LIMITE = 0.15;
export const EBITDA_TRIMESTRAL_OBJETIVO = 0.22;
export const EBITDA_OBJETIVO_TEXTO =
  "Objetivo: 18-20% (30% en temporada alta)";

/**
 * Alerta operativa por umbrales fijos (se pinta en el nivel n3 de la tarjeta).
 * Función pura y client-safe: no toca el Sheet ni sheetsClient.
 *
 * CPL_ads y CAC son COSTES → cuanto más alto, peor.
 * CR_clientes es una TASA de conversión en FRACCIÓN 0-1, tal cual viene del
 * Sheet (sin ×100) → cuanto más alto, mejor, así que sus umbrales van al revés.
 *
 * value <= 0 (o null) → null: no hay dato útil que juzgar y la tarjeta no
 * renderiza nada (no deja hueco).
 */
export function getAlertaOperativa(
  key: AlertaKey,
  value: MetricValue
): AlertaOperativa | null {
  if (value === null || value <= 0) return null;

  switch (key) {
    case "CPL_ads":
      if (value < CPL_OBJETIVO) return { texto: "EN OBJETIVO", color: "blue" };
      if (value < 15) return { texto: "BIEN", color: "green" };
      if (value < CPL_LIMITE) return { texto: "MEJORABLE", color: "yellow" };
      return { texto: "PELIGRO", color: "red" };
    case "CAC":
      if (value < CAC_OBJETIVO) return { texto: "EN OBJETIVO", color: "blue" };
      if (value < 80) return { texto: "BIEN", color: "green" };
      if (value < CAC_LIMITE) return { texto: "MEJORABLE", color: "yellow" };
      return { texto: "PELIGRO", color: "red" };
    case "CR_clientes":
      if (value < CR_LIMITE) return { texto: "PELIGRO", color: "red" };
      if (value < 0.25) return { texto: "MEJORABLE", color: "yellow" };
      if (value < CR_OBJETIVO) return { texto: "BIEN", color: "green" };
      return { texto: "EN OBJETIVO", color: "blue" };
    /**
     * Churn mensual: > 25% PELIGRO · 20-25% MEJORABLE · ≤ 20% BIEN.
     *
     * "BIEN" y "EN OBJETIVO" quedan fundidos en un solo estado verde. Los
     * umbrales que llegaron ponían "< 20% BIEN" y "= 20% EN OBJETIVO", que
     * son ambiguos en el borde y además dejarían el azul reservado a un valor
     * exacto (20,000%) que en la práctica no se da nunca: churn es un cociente
     * con decimales. Reservar el azul a una franja "excelente" habría exigido
     * inventar un umbral que nadie definió, así que ≤ 20% —cumplir el objetivo
     * de churn_obj— se pinta verde y listo.
     */
    case "clientes_churn":
      if (value > CHURN_LIMITE) return { texto: "PELIGRO", color: "red" };
      if (value > CHURN_OBJETIVO) return { texto: "MEJORABLE", color: "yellow" };
      return { texto: "BIEN", color: "green" };
    /** LTV:CAC — ver LTV_CAC_MINIMO/SANO/OBJETIVO para el porqué de los cortes. */
    case "LTV_CAC":
      if (value < LTV_CAC_MINIMO) return { texto: "PELIGRO", color: "red" };
      if (value < LTV_CAC_SANO) return { texto: "MEJORABLE", color: "yellow" };
      if (value < LTV_CAC_OBJETIVO) return { texto: "BIEN", color: "green" };
      return { texto: "EN OBJETIVO", color: "blue" };
  }
}

/** Periodicidad con la que se leen los márgenes del cuadro de resultados. */
export type PeriodoMargen = "mensual" | "trimestral";

/**
 * Alerta del margen EBITDA en % (fracción 0-1).
 *
 * No pasa por getAlertaOperativa a propósito: aquella descarta los valores ≤ 0
 * como "sin dato útil", y un EBITDA negativo (jun-26: −6,8%) es justo el caso
 * que MÁS hay que pintar en rojo.
 *
 *   mensual:    < 10% rojo · 10-18% amarillo · > 18% verde
 *   trimestral: < 15% rojo · 15-22% amarillo · > 22% verde
 *
 * Sin estado azul (EN OBJETIVO): los umbrales que llegaron sólo definen tres
 * bandas para el EBITDA, y no se inventa una cuarta.
 */
export function getAlertaEbitda(
  value: MetricValue,
  periodo: PeriodoMargen
): AlertaOperativa | null {
  if (value === null) return null;
  const limite =
    periodo === "mensual" ? EBITDA_MENSUAL_LIMITE : EBITDA_TRIMESTRAL_LIMITE;
  const objetivo =
    periodo === "mensual" ? EBITDA_MENSUAL_OBJETIVO : EBITDA_TRIMESTRAL_OBJETIVO;
  if (value < limite) return { texto: "PELIGRO", color: "red" };
  if (value <= objetivo) return { texto: "MEJORABLE", color: "yellow" };
  return { texto: "BIEN", color: "green" };
}

/**
 * Alerta operativa a partir de la comparación real vs objetivo (para métricas
 * que se juzgan contra su columna _obj, como LTV). Devuelve el mismo tipo que
 * getAlertaOperativa para que la tarjeta la trate igual (chip junto al título +
 * color de borde). `lowerIsBetter`: true si bajar es bueno (coste), false si
 * subir es bueno (LTV).
 *
 * Umbrales alineados con getSemaforo (1 / 0.85) y ampliados a 4 estados:
 *   ratio ≥ 1     → EN OBJETIVO (azul)
 *   ratio ≥ 0.85  → BIEN (verde)
 *   ratio ≥ 0.7   → MEJORABLE (amarillo)
 *   ratio < 0.7   → PELIGRO (rojo)
 */
export function getAlertaObjetivo(
  real: MetricValue,
  objetivo: MetricValue,
  lowerIsBetter: boolean
): AlertaOperativa | null {
  if (real === null || objetivo === null || objetivo === 0 || real === 0)
    return null;
  const ratio = lowerIsBetter ? objetivo / real : real / objetivo;
  if (ratio >= 1) return { texto: "EN OBJETIVO", color: "blue" };
  if (ratio >= 0.85) return { texto: "BIEN", color: "green" };
  if (ratio >= 0.7) return { texto: "MEJORABLE", color: "yellow" };
  return { texto: "PELIGRO", color: "red" };
}

/**
 * es-ES define minimumGroupingDigits=2 en CLDR: por defecto NO agrupa los
 * números de 4 dígitos (3000 → "3000", 8513.82 € → "8514 €"). El dashboard los
 * quiere siempre agrupados ("3.000", "8.514 €"), y eso es lo que fuerza
 * useGrouping:"always". El separador decimal (coma) ya lo da el locale.
 */
const GROUPING = { useGrouping: "always" } as const;

export function formatCurrency(value: MetricValue, currency = "EUR"): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    ...GROUPING,
  }).format(value);
}

export function formatNumber(value: MetricValue): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 1,
    ...GROUPING,
  }).format(value);
}

/**
 * Formatea una FRACCIÓN (0-1) como porcentaje. En DB_KPI las tasas se guardan
 * como fracción (retention_rate=0.2389 → "23,9%"), por eso multiplicamos ×100.
 */
export function formatPercent(value: MetricValue): string {
  if (value === null) return "—";
  return `${new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 1,
    ...GROUPING,
  }).format(value * 100)}%`;
}

/**
 * Formatea un valor YA expresado en PUNTOS porcentuales (5.34 → "5,3%"), sin
 * multiplicar. Para las variaciones (getMoM*, que ya devuelven ×100), a
 * diferencia de formatPercent, que espera una fracción.
 */
export function formatPercentPoints(value: MetricValue): string {
  if (value === null) return "—";
  return `${new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 1,
    ...GROUPING,
  }).format(value)}%`;
}

/** Delta absoluto en € con signo explícito: 450 → "+450 €", -450 → "-450 €". */
export function formatCurrencyDelta(
  value: MetricValue,
  currency = "EUR"
): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    signDisplay: "exceptZero",
    ...GROUPING,
  }).format(value);
}

/**
 * Delta en PUNTOS porcentuales con signo: 5.34 → "+5,3 pp".
 *
 * Es la comparativa correcta para los MÁRGENES, donde el % relativo no sirve:
 * un EBITDA que pasa de +9,5% a -6,8% "cae un 171%", que no significa nada, y
 * en cuanto la métrica cruza el cero el signo del % relativo se da vuelta. La
 * distancia en puntos, en cambio, siempre se lee igual.
 */
export function formatPointsDelta(value: MetricValue): string {
  if (value === null) return "—";
  return `${new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
    ...GROUPING,
  }).format(value)} pp`;
}

/** Delta absoluto numérico con signo explícito: 8 → "+8", -8 → "-8". */
export function formatNumberDelta(value: MetricValue): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
    ...GROUPING,
  }).format(value);
}

/** Meses abreviados en español para convertir seriales de fecha de Sheets. */
const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function serialToMonthLabel(serial: number): string {
  // Epoch de los seriales de Google Sheets = 1899-12-30. UTC para no desfasar.
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000;
  const d = new Date(ms);
  return `${MONTHS_ES[d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(-2)}`;
}

/**
 * Convierte el valor "mes" de una celda de Sheets a "mmm-yy" (ej. "ago-25").
 * - Si ya es texto tipo "ago-25", lo devuelve tal cual.
 * - Si es un serial de fecha de Sheets (número ≥ 30000, ej. 45658), lo convierte.
 */
export function formatSheetMonth(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "string") {
    const s = raw.trim();
    const n = Number(s);
    if (s !== "" && Number.isFinite(n) && n >= 30000) return serialToMonthLabel(n);
    return s;
  }
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 30000) {
    return serialToMonthLabel(raw);
  }
  return String(raw);
}

/**
 * "ago-25" → índice absoluto de mes (año × 12 + mes), para poder RESTAR meses
 * entre dos etiquetas sin pasar por Date. La diferencia de dos índices es la
 * distancia en meses: eso es lo que traduce una cohorte a su mes de vida actual.
 * Devuelve null si la etiqueta no tiene la forma "mmm-yy".
 */
export function monthLabelToIndex(label: string): number | null {
  const m = /^([a-zé]{3})-(\d{2})$/i.exec(label.trim());
  if (!m) return null;
  const mes = MONTHS_ES.indexOf(m[1].toLowerCase());
  if (mes < 0) return null;
  return (2000 + Number(m[2])) * 12 + mes;
}

/**
 * El mes MÁS RECIENTE de una lista de labels "mmm-yy", por CALENDARIO y no por
 * posición en la lista. `kpi.months` sale de las filas del Sheet en su orden, y
 * una fila fuera de sitio (o insertada a mitad) no debería decidir qué mes se
 * muestra por defecto: eso es justo lo que hace que el dashboard se quede en un
 * mes viejo sin que nadie lo note.
 *
 * Los labels que no se pueden parsear se ignoran. Si NINGUNO se puede, cae al
 * último de la lista —el comportamiento anterior— para no devolver "" cuando la
 * hoja usa un formato de mes que no conocemos.
 */
export function mesMasReciente(months: string[]): string {
  let mejor = "";
  let mejorIdx = -Infinity;
  for (const m of months) {
    const i = monthLabelToIndex(m);
    if (i === null || i <= mejorIdx) continue;
    mejorIdx = i;
    mejor = m;
  }
  return mejor || months[months.length - 1] || "";
}

/**
 * FORMATO DE MES DE LA API EXTERNA — "YYYY-MM" (ISO), el que habla el endpoint
 * de gasto en profesores de DRC Gestión. Convive con el "mmm-yy" del Sheet, que
 * es el que ven los usuarios y el que usan los desplegables; las dos funciones
 * de abajo son el único puente entre ambos.
 */
const API_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** ¿Es un mes "YYYY-MM" válido? Mismo criterio que valida el endpoint remoto. */
export function isApiMonth(m: string | null | undefined): m is string {
  return !!m && API_MONTH_RE.test(m);
}

/**
 * "jul-26" → "2026-07". Devuelve null si la etiqueta no tiene la forma "mmm-yy"
 * (incluido el caso de mes vacío, mientras el Sheet todavía no cargó): así el
 * caller sabe que NO tiene que llamar a la API en vez de pedirle un mes roto.
 */
export function monthLabelToApiMonth(label: string): string | null {
  const m = /^([a-zé]{3})-(\d{2})$/i.exec(label.trim());
  if (!m) return null;
  const mes = MONTHS_ES.indexOf(m[1].toLowerCase());
  if (mes < 0) return null;
  return `20${m[2]}-${String(mes + 1).padStart(2, "0")}`;
}

/** "2026-07" → "jul-26", para etiquetar los ejes con el mismo formato que el resto. */
export function apiMonthToLabel(month: string): string {
  if (!isApiMonth(month)) return month;
  const [anio, mes] = month.split("-");
  return `${MONTHS_ES[Number(mes) - 1]}-${anio.slice(-2)}`;
}

/**
 * "feb-26" → "T1-26". Trimestres NATURALES (T1 ene-mar, T2 abr-jun, T3 jul-sep,
 * T4 oct-dic), que es como cierra el cuadro de resultados. Devuelve null si la
 * etiqueta no tiene la forma "mmm-yy".
 */
export function monthToQuarterLabel(label: string): string | null {
  const m = /^([a-zé]{3})-(\d{2})$/i.exec(label.trim());
  if (!m) return null;
  const mes = MONTHS_ES.indexOf(m[1].toLowerCase());
  if (mes < 0) return null;
  return `T${Math.floor(mes / 3) + 1}-${m[2]}`;
}

/**
 * Meses de la serie que caen en el MISMO trimestre natural que `month`, en
 * orden. Sólo devuelve los que existen en el Sheet: si el trimestre está a
 * medias (jul-26 en un T3 que aún no tiene agosto), devuelve lo que va del
 * trimestre — el agregado es entonces un "trimestre hasta la fecha", no un
 * trimestre cerrado, y así se dice en la UI.
 */
export function getQuarterMonths(months: string[], month: string): string[] {
  const q = monthToQuarterLabel(month);
  if (!q) return month ? [month] : [];
  return months.filter((m) => monthToQuarterLabel(m) === q);
}

/**
 * Meses del trimestre ANTERIOR al de `month` (los que existan en la serie).
 * Vacío si `month` cae en el primer trimestre del dataset. Se usa para el
 * comparativo QoQ de las tarjetas cuando se mira el cuadro de resultados por
 * trimestre, igual que el MoM cuando se mira por mes.
 */
export function getPrevQuarterMonths(
  months: string[],
  month: string
): string[] {
  const q = monthToQuarterLabel(month);
  if (!q) return [];
  const quarters: string[] = [];
  for (const m of months) {
    const label = monthToQuarterLabel(m);
    if (label && !quarters.includes(label)) quarters.push(label);
  }
  const idx = quarters.indexOf(q);
  if (idx <= 0) return [];
  const prev = quarters[idx - 1];
  return months.filter((m) => monthToQuarterLabel(m) === prev);
}

/** Suma de una métrica sobre un conjunto de meses. null si ninguno tiene dato. */
export function getSumAtMonths(
  kpi: DBKpiData,
  key: string,
  months: string[]
): MetricValue {
  let total: number | null = null;
  for (const m of months) {
    const v = kpi.data[m]?.[key];
    if (v === null || v === undefined) continue;
    total = (total ?? 0) + v;
  }
  return total;
}

/**
 * Ratio agregado de dos columnas sobre varios meses: suma(num) / suma(den).
 *
 * Es la forma CORRECTA de llevar un margen (%margenbruto, %ebitda) de mes a
 * trimestre: promediar los porcentajes mensuales le daría el mismo peso a un
 * mes de 8.000 € que a uno de 33.000 €. La media ponderada por ingresos es
 * exactamente el margen del trimestre visto como un solo período.
 *
 * Los meses en los que el cuadro de resultados todavía no se cargó vienen como
 * 0 en las dos columnas: no aportan ni al numerador ni al denominador, así que
 * no distorsionan (a diferencia de un promedio de %, donde ese 0% sí contaría).
 */
export function getRatioAtMonths(
  kpi: DBKpiData,
  numKey: string,
  denKey: string,
  months: string[]
): MetricValue {
  const num = getSumAtMonths(kpi, numKey, months);
  const den = getSumAtMonths(kpi, denKey, months);
  if (num === null || den === null || den === 0) return null;
  return num / den;
}

/** getLatest pero en valor absoluto — para métricas que el Sheet guarda en negativo (pérdidas). */
export function getLatestAbs(kpi: DBKpiData, key: string): MetricValue {
  const v = getLatest(kpi, key);
  return v === null ? null : Math.abs(v);
}

/**
 * MoM calculado sobre valores absolutos. Para métricas de "pérdida" guardadas
 * en negativo (clientes_perdidos, suscripciones_perdidas, MRR_lost, ...): si se
 * pierde MÁS, el MoM da positivo (y con momIsGoodWhenPositive=false se pinta
 * rojo, como corresponde) en vez de verde.
 */
export function getMoMAbs(kpi: DBKpiData, key: string): number | null {
  const latest = getLatest(kpi, key);
  const prev = getPrevious(kpi, key);
  if (latest === null || prev === null) return null;
  const a = Math.abs(latest);
  const p = Math.abs(prev);
  if (p === 0) return null;
  return ((a - p) / p) * 100;
}

/**
 * ROI por canal de un mes = (ingresos_canal - ads_canal) / ads_canal.
 * ROI_google / ROI_meta NO existen como columnas en DB_KPI; se derivan con la
 * misma fórmula que el ROI global del Sheet (ROI_marketing).
 */
export function getRoiCanal(
  kpi: DBKpiData,
  month: string,
  canal: "google" | "meta"
): MetricValue {
  const ingresos = kpi.data[month]?.[`ingresos_${canal}`] ?? null;
  const ads = kpi.data[month]?.[`ads_${canal}`] ?? null;
  if (ingresos === null || ads === null || ads === 0) return null;
  return (ingresos - ads) / ads;
}

/** ROI por canal del último mes con datos de ese canal. */
export function getRoiCanalLatest(
  kpi: DBKpiData,
  canal: "google" | "meta"
): MetricValue {
  for (let i = kpi.months.length - 1; i >= 0; i--) {
    const r = getRoiCanal(kpi, kpi.months[i], canal);
    if (r !== null) return r;
  }
  return null;
}

/**
 * LTV:CAC de un mes = LTV / CAC. La columna LTV_CAC del Sheet está rota (da 0),
 * así que la calculamos; sólo si el cálculo no es posible (CAC=0 o null) caemos
 * al valor crudo de la columna.
 */
function ltvCacAt(kpi: DBKpiData, month: string): MetricValue {
  const ltv = kpi.data[month]?.["LTV"] ?? null;
  const cac = kpi.data[month]?.["CAC"] ?? null;
  if (ltv !== null && cac !== null && cac !== 0) return ltv / cac;
  return kpi.data[month]?.["LTV_CAC"] ?? null;
}

export function getLtvCacSeries(
  kpi: DBKpiData
): { month: string; value: MetricValue }[] {
  return kpi.months.map((month) => ({ month, value: ltvCacAt(kpi, month) }));
}

/** LTV:CAC de un mes concreto (el elegido en el desplegable). Ver ltvCacAt. */
export function getLtvCacAtMonth(kpi: DBKpiData, month: string): MetricValue {
  if (!month) return null;
  return ltvCacAt(kpi, month);
}

/**
 * MoM sobre valores absolutos calculado respecto al mes elegido. Versión "at
 * month" de getMoMAbs: para métricas de "pérdida" guardadas en negativo
 * (suscripciones_perdidas, clientes_perdidos), donde perder MÁS debe leerse como
 * variación positiva (y con momIsGoodWhenPositive=false pintarse en rojo).
 */
export function getMoMAbsAtMonth(
  kpi: DBKpiData,
  key: string,
  month: string
): number | null {
  const idx = kpi.months.indexOf(month);
  if (idx < 0) return null;
  const latest = getValueAtMonth(kpi, key, month);
  if (latest === null) return null;
  let prev: MetricValue = null;
  for (let i = idx - 1; i >= 0; i--) {
    const v = kpi.data[kpi.months[i]]?.[key];
    if (v !== null && v !== undefined) {
      prev = v;
      break;
    }
  }
  if (prev === null) return null;
  const a = Math.abs(latest);
  const p = Math.abs(prev);
  if (p === 0) return null;
  return ((a - p) / p) * 100;
}

export function getLtvCacLatest(kpi: DBKpiData): MetricValue {
  for (let i = kpi.months.length - 1; i >= 0; i--) {
    const v = ltvCacAt(kpi, kpi.months[i]);
    if (v !== null) return v;
  }
  return null;
}

export function getLtvCacMoM(kpi: DBKpiData): number | null {
  const pts = getLtvCacSeries(kpi).filter((p) => p.value !== null);
  if (pts.length < 2) return null;
  const latest = pts[pts.length - 1].value as number;
  const prev = pts[pts.length - 2].value as number;
  if (prev === 0) return null;
  return ((latest - prev) / Math.abs(prev)) * 100;
}
