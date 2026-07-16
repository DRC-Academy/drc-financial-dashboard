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

export type SemaforoColor = "green" | "yellow" | "red" | "neutral";

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

export type AlertaColor = "green" | "yellow" | "orange" | "red";

export interface AlertaOperativa {
  texto: string;
  color: AlertaColor;
}

/** Métricas con umbrales de alerta definidos. */
export type AlertaKey = "CPL_ads" | "CAC" | "CR_clientes";

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
      if (value < 12) return { texto: "EN OBJETIVO", color: "green" };
      if (value < 15) return { texto: "BIEN", color: "yellow" };
      if (value < 20) return { texto: "MEJORABLE", color: "orange" };
      return { texto: "PELIGRO", color: "red" };
    case "CAC":
      if (value < 65) return { texto: "EN OBJETIVO", color: "green" };
      if (value < 80) return { texto: "BIEN", color: "yellow" };
      if (value < 120) return { texto: "MEJORABLE", color: "orange" };
      return { texto: "PELIGRO", color: "red" };
    case "CR_clientes":
      if (value < 0.2) return { texto: "PELIGRO", color: "red" };
      if (value < 0.25) return { texto: "MEJORABLE", color: "orange" };
      if (value < 0.28) return { texto: "BIEN", color: "yellow" };
      return { texto: "EN OBJETIVO", color: "green" };
  }
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
