import { NextResponse } from "next/server";
import { readSheetValues } from "@/lib/sheetsClient";
import { readProductoKPI } from "@/lib/productoKpi";

export const dynamic = "force-dynamic";

/**
 * Endpoint TEMPORAL de diagnóstico de la hoja "KPI Producto".
 *
 * Se deja vivo a propósito mientras afinamos la página de Producto: devuelve a
 * la vez las filas CRUDAS y el resultado del parser, que es lo que hace falta
 * para decidir qué bloques merecen visualización propia sin tener que abrir el
 * Sheet. Borrar cuando la página esté cerrada.
 *
 * Uso: abrir /api/debug-producto-kpi en el navegador.
 */
export async function GET() {
  try {
    const rows = await readSheetValues("KPI Producto");
    if (rows === null) {
      return NextResponse.json({
        ok: false,
        reason:
          'readSheetValues devolvió null: la hoja "KPI Producto" no existe con ese nombre exacto, o falló la auth/permiso de Sheets.',
        rows: null,
      });
    }

    const parsed = await readProductoKPI();

    return NextResponse.json({
      ok: true,
      sheet: "KPI Producto",
      totalRows: rows.length,
      // Filas crudas, con su índice real, para cotejar contra el parser.
      sample: rows.slice(0, 30).map((r, i) => ({ i, row: r })),
      // Resumen de lo que reconoce el parser: un bloque por tabla apilada.
      parsed: {
        months: parsed.months,
        productos: parsed.productos,
        blocks: parsed.blocks.map((b) => ({
          name: b.name,
          dimension: b.dimension,
          parent: b.parent,
          series: b.series.map((s) => s.label),
          totalesConDato: b.totals.filter((v) => v !== null).length,
        })),
      },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, reason: String(err), rows: null });
  }
}
