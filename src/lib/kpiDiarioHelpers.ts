import type { DailyKpiData, MetricValue } from "@/types/kpi";
import { addDays, addMonths, diffDays } from "./isoDate";

/**
 * Helpers PUROS de la hoja "KPI Diario" (client-safe: la página los importa sin
 * arrastrar googleapis, igual que kpiHelpers respecto de kpi.ts).
 *
 * Lo que resuelve este módulo, y que la versión mensual no necesita: en la
 * página diaria el usuario elige un RANGO de días, no un día suelto, así que
 * cada tarjeta tiene que agregar N días en un número. Y no todas las métricas se
 * agregan igual — sumar un MRR día a día daría un disparate.
 */

export const EMPTY_DAILY_KPI: DailyKpiData = { days: [], keys: [], data: {} };

/** Rango de días cerrado por ambos extremos, en ISO "YYYY-MM-DD". */
export interface DayRange {
  from: string;
  to: string;
}

/* -------------------------------------------------------------------------- */
/* Cómo se agrega cada métrica sobre un rango                                  */
/* -------------------------------------------------------------------------- */

/**
 *  - `sum`      FLUJO: lo que pasó ese día y se acumula (ingresos, pedidos,
 *               leads, gasto en ads). El total del rango es la suma.
 *
 *  - `last`     STOCK o acumulado: la foto a una fecha (MRR, suscripciones
 *               activas, ingresos_acumulados, LTV). Sumarlos no significa nada:
 *               el valor del rango es el del ÚLTIMO día con dato.
 *
 *  - `ratio`    Cociente cuyo numerador y denominador SÍ son flujos: se
 *               recalcula como suma(num)/suma(den). No es una media de medias:
 *               es la misma fórmula que usa el Sheet, aplicada al agregado, y
 *               por eso para un rango de un solo día devuelve exactamente el
 *               valor de la celda. Las fórmulas de abajo están verificadas
 *               contra la hoja (coinciden al 100% en los últimos 300 días).
 *
 *  - `weighted` Ratio cuya fórmula exacta del Sheet NO se pudo reproducir
 *               (AOV/ARPC dan 91% de coincidencia: la hoja excluye algún
 *               importe que no está en ninguna columna). Se promedia la propia
 *               columna del Sheet ponderada por su denominador natural, así el
 *               número NUNCA contradice a la hoja —para un día devuelve la
 *               celda tal cual— y para varios queda correctamente ponderado en
 *               vez de dar el mismo peso a un día de 2 pedidos que a uno de 40.
 */
type AggSpec =
  | { mode: "sum" }
  | { mode: "last" }
  | { mode: "ratio"; num: string; den: string; minusDen?: boolean }
  | { mode: "weighted"; weight: string };

const SUM: AggSpec = { mode: "sum" };
const LAST: AggSpec = { mode: "last" };

const AGG: Record<string, AggSpec> = {
  // --- Flujos ---
  ingresos_netos: SUM,
  ingresos_DRC: SUM,
  ingresos_B2C_netos: SUM,
  ingresos_B2B: SUM,
  ingresos_oritalk: SUM,
  ingresos_nuevos: SUM,
  pedidos: SUM,
  pedidos_nuevos: SUM,
  pedidos_recurrentes: SUM,
  clientes: SUM,
  clientes_nuevos: SUM,
  clientes_recurrentes: SUM,
  suscripciones_nuevas: SUM,
  suscripciones_perdidas: SUM,
  suscripciones_canceladas: SUM,
  neto_suscripciones: SUM,
  MRR_new: SUM,
  MRR_lost: SUM,
  MRR_net: SUM,
  ads_total: SUM,
  ads_captacion: SUM,
  ads_google: SUM,
  ads_meta: SUM,
  ads_capt_meta: SUM,
  leads_ads: SUM,
  leads_mail: SUM,
  leads_google_ads: SUM,
  leads_google_mail: SUM,
  leads_meta_ads: SUM,
  leads_meta_mail: SUM,
  ventas: SUM,
  ventas_hugo: SUM,
  ventas_martin: SUM,
  ventas_otros: SUM,
  ventas_google: SUM,
  ventas_meta: SUM,
  ingresos_ventas: SUM,
  ingresos_hugo: SUM,
  ingresos_martin: SUM,
  ingresos_otros: SUM,
  ingresos_google: SUM,
  ingresos_meta: SUM,

  // --- Stocks / acumulados: la foto del último día del rango ---
  MRR: LAST,
  MRR_churn: LAST,
  suscripciones_activas: LAST,
  ingresos_acumulados: LAST,
  clientes_acumulados: LAST,
  // LTV = ingresos_acumulados / clientes_acumulados (verificado 100%): es un
  // acumulado desde el origen, no una métrica del día.
  LTV: LAST,
  // Sin fórmula reproducible y con valores > 1 en el día suelto (llega a 4):
  // no es una tasa acotada a escala diaria. Ver nota en la página.
  retention_rate: LAST,
  pedidos_promedio: LAST,
  CR_hugo: LAST,
  CR_martin: LAST,

  // --- Ratios recalculables (fórmula verificada contra el Sheet) ---
  CPL_google: { mode: "ratio", num: "ads_google", den: "leads_google_ads" },
  CAC_google: { mode: "ratio", num: "ads_google", den: "ventas_google" },
  CR_google: { mode: "ratio", num: "ventas_google", den: "leads_google_ads" },
  ROI_google: { mode: "ratio", num: "ingresos_google", den: "ads_google", minusDen: true },
  // Ojo con Meta: el CPL se calcula contra leads_meta_MAIL y el CR contra
  // leads_meta_ADS. No es un typo — es lo que hace la hoja, verificado.
  CPL_meta: { mode: "ratio", num: "ads_capt_meta", den: "leads_meta_mail" },
  CAC_meta: { mode: "ratio", num: "ads_capt_meta", den: "ventas_meta" },
  CR_meta: { mode: "ratio", num: "ventas_meta", den: "leads_meta_ads" },
  ROI_meta: { mode: "ratio", num: "ingresos_meta", den: "ads_capt_meta", minusDen: true },

  // --- Ratios ponderados por su denominador natural ---
  AOV: { mode: "weighted", weight: "pedidos" },
  AOV_nuevos: { mode: "weighted", weight: "pedidos_nuevos" },
  ARPC: { mode: "weighted", weight: "clientes" },
  recurrent_rate: { mode: "weighted", weight: "clientes" },
};

/**
 * Por defecto, `last`. Una clave que no esté en la tabla es una que nadie
 * clasificó: devolver el último valor es lo único que no puede inventar un
 * número (sumar una tasa desconocida sí).
 */
function specFor(key: string): AggSpec {
  return AGG[key] ?? LAST;
}

/* -------------------------------------------------------------------------- */
/* Lectura                                                                     */
/* -------------------------------------------------------------------------- */

/** Valor de una métrica en un día concreto. */
export function getDayValue(
  kpi: DailyKpiData,
  key: string,
  day: string
): MetricValue {
  if (!day) return null;
  const v = kpi.data[day]?.[key];
  return v === null || v === undefined ? null : v;
}

/** Días del dataset dentro de [from, to], en orden. */
export function daysInRange(days: string[], range: DayRange | null): string[] {
  if (!range) return days;
  return days.filter((d) => d >= range.from && d <= range.to);
}

function sumOver(kpi: DailyKpiData, key: string, days: string[]): MetricValue {
  let total: number | null = null;
  for (const d of days) {
    const v = kpi.data[d]?.[key];
    if (v === null || v === undefined) continue;
    total = (total ?? 0) + v;
  }
  return total;
}

function lastOver(kpi: DailyKpiData, key: string, days: string[]): MetricValue {
  for (let i = days.length - 1; i >= 0; i--) {
    const v = kpi.data[days[i]]?.[key];
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

/**
 * Valor de una métrica AGREGADO sobre un conjunto de días, según su modo.
 * Es la función que alimenta las tarjetas KPI de la página diaria.
 */
export function aggregate(
  kpi: DailyKpiData,
  key: string,
  days: string[]
): MetricValue {
  if (days.length === 0) return null;
  const spec = specFor(key);

  switch (spec.mode) {
    case "sum":
      return sumOver(kpi, key, days);

    case "last":
      return lastOver(kpi, key, days);

    case "ratio": {
      const num = sumOver(kpi, spec.num, days);
      const den = sumOver(kpi, spec.den, days);
      if (num === null || den === null || den === 0) return null;
      // Los ROI se guardan como (ingresos - gasto) / gasto.
      return spec.minusDen ? (num - den) / den : num / den;
    }

    case "weighted": {
      let acc = 0;
      let pesos = 0;
      for (const d of days) {
        const v = kpi.data[d]?.[key];
        const w = kpi.data[d]?.[spec.weight];
        if (v === null || v === undefined || w === null || w === undefined) continue;
        acc += v * w;
        pesos += w;
      }
      if (pesos === 0) return null;
      return acc / pesos;
    }
  }
}

/**
 * Ventana ANTERIOR contra la que compara el comparativo de las tarjetas.
 *
 * ES EL MISMO TRAMO DEL MES ANTERIOR, no los N días inmediatamente previos:
 * 1-22 ago compara contra 1-22 jul. Esa distinción no es cosmética. La
 * facturación de este negocio está cargada al principio de mes (las
 * renovaciones caen por día del mes), así que deslizar la ventana hacia atrás
 * cambia QUÉ tramo del ciclo se mide. Con datos reales de 2026: 1-22 ago
 * (14.449 €) contra los 22 días previos —10-31 jul, 12.944 €— daba +1.505 €,
 * mientras que contra el mismo tramo —1-22 jul, 16.556 €— da −2.107 €. El signo
 * entero dependía de por dónde cortaba la ventana.
 *
 * addMonths() hace clamp al último día del mes destino, así que 29-31 mar
 * compara contra 28 feb en vez de desbordar a marzo. El tramo previo puede
 * quedar más corto que el actual; la página lo dice mostrando las fechas
 * exactas contra las que compara, en vez de dejarlo implícito.
 *
 * EXCEPCIÓN — rangos de más de un mes: ahí retroceder un mes se solaparía con el
 * propio rango (los "últimos 6 meses" contra "los 6 meses que empiezan un mes
 * antes" comparten cinco), y comparar un período contra sí mismo no dice nada.
 * Para esos se mantiene la ventana deslizada de igual largo, que sí es disjunta.
 *
 * Se recorta a los días que existen en el dataset: si el tramo previo cae
 * entero antes del primer día cargado, devuelve null y el comparativo no se
 * muestra (en vez de inventar un cero).
 */
export function previousRange(
  days: string[],
  range: DayRange | null
): DayRange | null {
  if (!range || days.length === 0) return null;

  const mismoTramoMesAnterior: DayRange = {
    from: addMonths(range.from, -1),
    to: addMonths(range.to, -1),
  };

  // Se solapa con el rango actual → el rango dura más de un mes.
  const previo: DayRange =
    mismoTramoMesAnterior.to < range.from
      ? mismoTramoMesAnterior
      : ventanaDeslizada(range);

  if (previo.to < days[0]) return null;
  return previo;
}

/** Los N días inmediatamente anteriores al rango, con N = largo del rango. */
function ventanaDeslizada(range: DayRange): DayRange {
  const largo = diffDays(range.from, range.to) + 1;
  const to = addDays(range.from, -1);
  return { from: addDays(to, -(largo - 1)), to };
}

/**
 * Variación porcentual del rango contra la ventana previa, en PUNTOS (×100),
 * que es lo que espera el badge de KpiCard. null si falta alguno de los dos.
 */
export function getRangeMoM(
  kpi: DailyKpiData,
  key: string,
  actual: string[],
  previo: string[]
): number | null {
  const a = aggregate(kpi, key, actual);
  const p = aggregate(kpi, key, previo);
  if (a === null || p === null || p === 0) return null;
  return ((a - p) / Math.abs(p)) * 100;
}

/**
 * Delta ABSOLUTO del rango contra la ventana previa, en la unidad de la métrica.
 * A diferencia de getRangeMoM sí devuelve valor cuando el período previo es 0.
 */
export function getRangeDelta(
  kpi: DailyKpiData,
  key: string,
  actual: string[],
  previo: string[]
): number | null {
  const a = aggregate(kpi, key, actual);
  const p = aggregate(kpi, key, previo);
  if (a === null || p === null) return null;
  return a - p;
}

/** Serie temporal de varias claves sobre los días indicados, para los gráficos. */
export function buildSeries(
  kpi: DailyKpiData,
  days: string[],
  keys: string[]
): Record<string, string | number | null>[] {
  return days.map((day) => {
    const row: Record<string, string | number | null> = { day };
    for (const k of keys) row[k] = kpi.data[day]?.[k] ?? null;
    return row;
  });
}
