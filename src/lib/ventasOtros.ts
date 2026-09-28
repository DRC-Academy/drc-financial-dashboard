import type { MetricValue, MonthRecord } from "@/types/kpi";

/**
 * Desglose del canal "Otros" de ventas — lo que no vino de Google ni de Meta.
 * Client-safe (sin googleapis): lo usan Captación y Captación Semanal.
 *
 * El Sheet trae tres columnas de atribución (mismos nombres en DB_KPI y en
 * KPI Semanal):
 *  - ventas_otros    → IAs, otros canales…
 *  - ventas_exalumno → ex-alumnos
 *  - ventas_referido → referidos (amigos, familiares, conocidos…)
 *
 * Esas tres NO siempre cubren todo el resto: hay ventas sin canal cargado
 * (sep-26: total 66 = 11 google + 21 meta + 13 atribuidas + 21 sin canal). Ese
 * hueco va como "Sin atribuir" = total − google − meta − (suma de las tres), y
 * "Otros" = las tres + sin atribuir, para que la dona sume siempre el total.
 */

/** Columna de ventas totales en cada hoja: se llaman distinto. */
export type VentasTotalKey = "ventas" | "ventas_total";

/**
 * Primer período con el desglose por canal cargado en cada hoja. La w12 queda
 * fuera a propósito: es de carga parcial (15 ventas, sólo 2 google + 1 meta, e
 * ingresos_otros en 0), y "Sin atribuir" daría 12 de 15 con ticket medio 0 €.
 */
export const DESGLOSE_DESDE_MES = "abr-26";
export const DESGLOSE_DESDE_SEMANA = "2026_w13";

export const SIN_ATRIBUIR_HINT =
  "Ventas sin canal cargado en el Sheet: no es un canal más, es lo que falta atribuir.";

export interface VentasOtros {
  /** ventas_otros + ventas_exalumno + ventas_referido + sinAtribuir. */
  total: MetricValue;
  otros: MetricValue;
  exalumno: MetricValue;
  referido: MetricValue;
  /** null si es 0, si no hay desglose en el período o si faltan columnas. */
  sinAtribuir: number | null;
}

/**
 * ¿El período ya tiene el desglose por canal cargado? Antes del corte la hoja
 * deja google/meta/otros en 0 (o con restos sueltos), y "Sin atribuir" sería
 * el total entero. Si el corte no está en la lista, se asume que sí.
 */
export function tieneDesglose(
  periods: string[],
  period: string,
  desde: string
): boolean {
  const corte = periods.indexOf(desde);
  if (corte < 0) return true;
  return periods.indexOf(period) >= corte;
}

export function getVentasOtros(
  record: MonthRecord | undefined,
  totalKey: VentasTotalKey,
  conDesglose: boolean
): VentasOtros {
  const get = (k: string): MetricValue => record?.[k] ?? null;
  const otros = get("ventas_otros");
  const exalumno = get("ventas_exalumno");
  const referido = get("ventas_referido");

  // Columna vacía → se excluye de la suma; si las tres vienen vacías, null.
  const partes = [otros, exalumno, referido].filter(
    (v): v is number => v !== null
  );
  const atribuidas = partes.length ? partes.reduce((a, b) => a + b, 0) : null;

  let sinAtribuir: number | null = null;
  const ventas = get(totalKey);
  const google = get("ventas_google");
  const meta = get("ventas_meta");
  if (
    conDesglose &&
    ventas !== null &&
    google !== null &&
    meta !== null &&
    atribuidas !== null
  ) {
    const resto = ventas - google - meta - atribuidas;
    // Negativo = las atribuidas superan al resto: el Sheet está descuadrado.
    // No se muestra como número negativo ni se resta de "Otros".
    if (resto > 0) sinAtribuir = resto;
  }

  const total =
    atribuidas === null && sinAtribuir === null
      ? null
      : (atribuidas ?? 0) + (sinAtribuir ?? 0);

  return { total, otros, exalumno, referido, sinAtribuir };
}

/** Sub-series de la barra "Otros" que el tooltip muestra desglosadas. */
export const OTROS_BREAKDOWN = [
  { key: "ventas_otros", label: "Otros (IAs, otros canales…)" },
  { key: "ventas_exalumno", label: "Ex-alumnos" },
  { key: "ventas_referido", label: "Referidos" },
  { key: "ventas_sin_atribuir", label: "Sin atribuir" },
];

/** Columnas de la fila del gráfico de ventas para la barra "Otros". */
export function otrosRow(o: VentasOtros) {
  return {
    ventas_otros_total: o.total,
    ventas_otros: o.otros,
    ventas_exalumno: o.exalumno,
    ventas_referido: o.referido,
    ventas_sin_atribuir: o.sinAtribuir,
  };
}
