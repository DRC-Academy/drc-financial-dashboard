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

export function formatCurrency(value: MetricValue, currency = "EUR"): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: MetricValue): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(
    value
  );
}

export function formatPercent(value: MetricValue): string {
  if (value === null) return "—";
  return `${new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 1,
  }).format(value)}%`;
}
