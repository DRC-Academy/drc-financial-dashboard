import { NextResponse } from "next/server";
import { readSheetValues } from "@/lib/sheetsClient";
import { readKPIDiario } from "@/lib/kpiDiario";
import { readDBKPI } from "@/lib/kpi";
import {
  aggregate,
  daysInRange,
  getRangeDelta,
  getRangeMoM,
  previousRange,
  type DayRange,
} from "@/lib/kpiDiarioHelpers";
import { getDeltaAtMonth, getMoMAtMonth, getValueAtMonth } from "@/lib/kpiHelpers";
import { formatDayRangeShort, parseSheetDay } from "@/lib/isoDate";

export const dynamic = "force-dynamic";

/**
 * Endpoint TEMPORAL de diagnóstico de la comparación de ingresos.
 *
 * Nace del bug del 24-ago-2026: la tarjeta "Ingresos netos" de /resumen-diario
 * mostraba +1.435 € para el rango 1-22 ago cuando contra Stripe el mes venía
 * ~2.500 € POR ABAJO. Devuelve, para el rango que se le pida y para su ventana
 * de comparación, TODO lo que hace falta para rehacer el cálculo a mano:
 * los valores crudos del Sheet, los días que entran en cada ventana, los
 * agregados y las tres comparaciones posibles (la que usa el código, mismo
 * tramo del mes anterior, mes anterior completo).
 *
 * Uso:
 *   /api/debug-kpi                       → rango por defecto 2026-08-01..2026-08-22
 *   /api/debug-kpi?from=2026-08-01&to=2026-08-22
 *
 * Borrar cuando el bug esté cerrado y verificado.
 */

/** Columnas de ingresos de "KPI Diario". */
const COLS_DIARIO = [
  "ingresos_netos",
  "ingresos_DRC",
  "ingresos_B2C_netos",
  "ingresos_B2B",
  "ingresos_oritalk",
  "ingresos_nuevos",
];

/** Columnas de ingresos de "DB_KPI" (las que pidió el diagnóstico). */
const COLS_MENSUAL = [
  "ingresos_netos",
  "ingresos_B2C_netos",
  "ingresos_B2B",
  "ingresos_B2C_brutos",
  "ingresos_DRC",
  "ingresos_oritalk",
  "stripe_neto",
  "stripe_dashboard",
  "stripe_fee",
  "%_stripe_fee",
  "fee_gestion",
  "%_fee_gestion",
  "refunds_num",
  "importe_refunds",
  "ingresos_MoM",
  "ingresos_nuevos",
  "intensivos",
  "ingresos_intensivos",
  "prorrateo_intensivos",
];

/** Encabezados con su índice REAL de columna, marcando los vacíos. */
function mapaDeCabeceras(headerRow: unknown[]) {
  return headerRow.map((h, i) => {
    const nombre = String(h ?? "").trim();
    return { index: i, header: nombre === "" ? null : nombre };
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? "2026-08-01";
    const to = url.searchParams.get("to") ?? "2026-08-22";
    const rango: DayRange = { from, to };

    /* ------------------------------ hojas crudas ----------------------------- */
    const rawDiario = await readSheetValues("KPI Diario");
    const rawMensual = await readSheetValues("DB_KPI");
    if (!rawDiario || !rawMensual) {
      return NextResponse.json({
        ok: false,
        reason: "readSheetValues devolvió null para alguna hoja (nombre exacto o auth).",
      });
    }

    /* --------------- filas repetidas: el array days[] las duplica -------------- */
    // readKPIDiario hace days.push(day) por FILA, no por día único: si el Sheet
    // trae dos filas con la misma fecha, ese día aparece dos veces en days[] y
    // sumOver() lo cuenta dos veces. Esto lo detecta.
    const filasPorDia: Record<string, number[]> = {};
    rawDiario.slice(1).forEach((row, i) => {
      const day = parseSheetDay(row[0]);
      if (!day) return;
      (filasPorDia[day] ??= []).push(i + 2); // +2 = nº de fila real en el Sheet
    });
    const diasRepetidos = Object.entries(filasPorDia)
      .filter(([, filas]) => filas.length > 1)
      .map(([day, filas]) => ({ day, filas }));

    /* ------------------------------ parser diario ---------------------------- */
    const diario = await readKPIDiario();

    const rangoDias = daysInRange(diario.days, rango);
    const prevRange = previousRange(diario.days, rango);
    const previoDias = daysInRange(diario.days, prevRange);

    const unicos = (ds: string[]) => Array.from(new Set(ds));

    /** Suma deduplicada: un día, una vez. Es la que NO hace el código hoy. */
    const sumaDedup = (key: string, ds: string[]) => {
      let t: number | null = null;
      for (const d of unicos(ds)) {
        const v = diario.data[d]?.[key];
        if (v === null || v === undefined) continue;
        t = (t ?? 0) + v;
      }
      return t;
    };

    const ventana = (label: string, r: DayRange) => {
      const ds = daysInRange(diario.days, r);
      const cols: Record<string, { codigo: number | null; dedup: number | null }> = {};
      for (const c of COLS_DIARIO) {
        cols[c] = { codigo: aggregate(diario, c, ds), dedup: sumaDedup(c, ds) };
      }
      return {
        label,
        range: r,
        nDiasSegunElCodigo: ds.length,
        nDiasReales: unicos(ds).length,
        dias: ds,
        agregados: cols,
      };
    };

    // Mismo tramo del mes anterior: from/to con el mes restado uno.
    const mesAnterior = (iso: string) => {
      const [y, m, d] = iso.split("-").map(Number);
      const target = new Date(Date.UTC(y, m - 2, 1));
      const ultimo = new Date(
        Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
      ).getUTCDate();
      target.setUTCDate(Math.min(d, ultimo));
      return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(target.getUTCDate()).padStart(2, "0")}`;
    };
    const mismoTramo: DayRange = { from: mesAnterior(from), to: mesAnterior(to) };
    const mesPrevioCompleto: DayRange = {
      from: `${mesAnterior(from).slice(0, 7)}-01`,
      to: `${mesAnterior(from).slice(0, 7)}-31`,
    };

    /* -------------------------- fila cruda día a día ------------------------- */
    const headDiario = mapaDeCabeceras(rawDiario[0]);
    const idxDiario: Record<string, number> = {};
    for (const { index, header } of headDiario) {
      if (header && !(header in idxDiario)) idxDiario[header] = index;
    }
    const crudoDiario = rawDiario
      .slice(1)
      .map((row, i) => ({ fila: i + 2, day: parseSheetDay(row[0]), row }))
      .filter((r) => r.day >= mesPrevioCompleto.from && r.day <= to)
      .map((r) => {
        const celdas: Record<string, unknown> = {};
        for (const c of COLS_DIARIO) celdas[c] = row(r.row, idxDiario[c]);
        return { fila: r.fila, day: r.day, ...celdas, col24_sin_header: row(r.row, 24) };
      });

    /* --------------------------------- DB_KPI -------------------------------- */
    const mensual = await readDBKPI();
    const MESES_ES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    const [anioTo, mesTo] = to.split("-").map(Number);
    const mesActual = `${MESES_ES[mesTo - 1]}-${String(anioTo).slice(2)}`;
    const mesesRelevantes = mensual.months.slice(-4);
    const dbkpi: Record<string, Record<string, unknown>> = {};
    for (const m of mesesRelevantes) {
      const fila: Record<string, unknown> = {};
      for (const c of COLS_MENSUAL) {
        fila[c] = getValueAtMonth(mensual, c, m);
      }
      fila.__mom_ingresos_netos_pct = getMoMAtMonth(mensual, "ingresos_netos", m);
      fila.__delta_ingresos_netos = getDeltaAtMonth(mensual, "ingresos_netos", m);
      dbkpi[m] = fila;
    }

    return NextResponse.json({
      ok: true,
      pedido: { from, to },

      /* --- 1. Encabezados: qué columnas ve el parser y cuáles quedan fuera --- */
      cabeceras: {
        KPI_Diario: {
          total: rawDiario[0].length,
          columnas: headDiario,
          sinHeader: headDiario.filter((c) => c.header === null).map((c) => c.index),
          keysQueReconoceElParser: diario.keys,
        },
        DB_KPI: {
          total: rawMensual[0].length,
          sinHeader: mapaDeCabeceras(rawMensual[0])
            .filter((c) => c.header === null)
            .map((c) => c.index),
          keysQueReconoceElParser: mensual.keys,
        },
      },

      /* --- 2. Filas duplicadas del Sheet diario --- */
      diasConFilaRepetida: {
        cuantos: diasRepetidos.length,
        detalle: diasRepetidos,
        filasConFecha: rawDiario.length - 1,
        diasUnicos: Object.keys(filasPorDia).length,
        entradasEnDaysDelCodigo: diario.days.length,
      },

      /* --- 3. Ventanas y agregados --- */
      ventanas: {
        rangoElegido: ventana("rango elegido", rango),
        comparaHoy: prevRange
          ? ventana("ventana de comparación que usa el código", prevRange)
          : null,
        mismoTramoMesAnterior: ventana("mismo tramo del mes anterior", mismoTramo),
        mesAnteriorCompleto: ventana("mes anterior completo", mesPrevioCompleto),
      },

      /* --- 4. Lo que muestra hoy la tarjeta --- */
      tarjetaIngresosNetos: {
        valor: aggregate(diario, "ingresos_netos", rangoDias),
        momPct: getRangeMoM(diario, "ingresos_netos", rangoDias, previoDias),
        delta: getRangeDelta(diario, "ingresos_netos", rangoDias, previoDias),
        etiquetaPeriodo: prevRange
          ? `vs. ${formatDayRangeShort(prevRange.from, prevRange.to)}`
          : "",
        b2c: aggregate(diario, "ingresos_B2C_netos", rangoDias),
        b2b: aggregate(diario, "ingresos_B2B", rangoDias),
        drcAcademy:
          (aggregate(diario, "ingresos_B2C_netos", rangoDias) ?? 0) +
          (aggregate(diario, "ingresos_B2B", rangoDias) ?? 0),
      },

      /* --- 5. Crudo día a día --- */
      crudoDiario,

      /* --- 6. DB_KPI mensual --- */
      dbkpi: { mesActual, meses: mensual.months, valores: dbkpi },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, reason: String(err) });
  }
}

/** Celda por índice, tolerando índice inexistente. */
function row(r: unknown[], i: number | undefined): unknown {
  return i === undefined ? undefined : (r[i] ?? null);
}
