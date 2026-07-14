import { NextResponse } from "next/server";
import { readSheetValues } from "@/lib/sheetsClient";

export const dynamic = "force-dynamic";

/**
 * Endpoint TEMPORAL de diagnóstico para la hoja "KPI Producto".
 * Devuelve las primeras ~20 filas CRUDAS (sin transponer ni parsear) para ver
 * la estructura real: nombre de hoja correcto, si hay varias tablas apiladas,
 * si la primera fila son productos, etc. Borrar una vez diagnosticado.
 *
 * Uso: abrir /api/debug-producto-kpi en el navegador y pegar el JSON.
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
    return NextResponse.json({
      ok: true,
      sheet: "KPI Producto",
      totalRows: rows.length,
      firstRowLength: rows[0]?.length ?? 0,
      // primeras 20 filas crudas tal como las devuelve Sheets
      sample: rows.slice(0, 20),
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      reason: String(err),
      rows: null,
    });
  }
}
