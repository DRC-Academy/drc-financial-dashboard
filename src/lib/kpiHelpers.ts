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
export type AlertaKey = "CPL_ads" | "CAC" | "CR_clientes";

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
  }
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
