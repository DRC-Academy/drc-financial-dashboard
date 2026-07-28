import { NextResponse } from "next/server";
import { readKPISemanal } from "@/lib/kpiSemanal";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await readKPISemanal();
    return NextResponse.json({ ok: true, data, fetchedAt: Date.now() });
  } catch (err) {
    console.error("[/api/kpi-semanal]", err);
    return NextResponse.json(
      { ok: false, error: "No se pudo leer KPI Semanal", data: null },
      { status: 200 }
    );
  }
}
