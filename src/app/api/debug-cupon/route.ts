import { NextResponse } from "next/server";
import { readSheetValues } from "@/lib/sheetsClient";

export const dynamic = "force-dynamic";

/**
 * Endpoint TEMPORAL de diagnóstico para la hoja "Cupon".
 * Devuelve la fila de encabezados y las primeras ~20 filas CRUDAS (sin parsear)
 * para ver la estructura real: qué columnas existen (cupones totales, ingresos
 * extra, descuento, ROI...) antes de decidir qué tarjetas de C10 son viables.
 * Borrar una vez diagnosticado.
 *
 * Uso: abrir /api/debug-cupon en el navegador y pegar el JSON.
 */
export async function GET() {
  try {
    const rows = await readSheetValues("Cupon");
    if (rows === null) {
      return NextResponse.json({
        ok: false,
        reason:
          'readSheetValues devolvió null: la hoja "Cupon" no existe con ese nombre exacto, o falló la auth/permiso de Sheets.',
        rows: null,
      });
    }
    return NextResponse.json({
      ok: true,
      sheet: "Cupon",
      totalRows: rows.length,
      header: rows[0] ?? [],
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
