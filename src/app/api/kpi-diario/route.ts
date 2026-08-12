import { NextResponse } from "next/server";
import { readKPIDiario } from "@/lib/kpiDiario";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await readKPIDiario();
    return NextResponse.json({ ok: true, data, fetchedAt: Date.now() });
  } catch (err) {
    console.error("[/api/kpi-diario]", err);
    return NextResponse.json(
      { ok: false, error: 'No se pudo leer "KPI Diario"', data: null },
      { status: 200 }
    );
  }
}
