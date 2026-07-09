import { NextResponse } from "next/server";
import { readProductoKPI } from "@/lib/productoKpi";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await readProductoKPI();
    return NextResponse.json({ ok: true, data, fetchedAt: Date.now() });
  } catch (err) {
    console.error("[/api/producto-kpi]", err);
    return NextResponse.json(
      { ok: false, error: "No se pudo leer KPI Producto", data: null },
      { status: 200 }
    );
  }
}
