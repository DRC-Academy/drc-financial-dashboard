import { NextResponse } from "next/server";
import { readDBKPI } from "@/lib/kpi";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await readDBKPI();
    return NextResponse.json({ ok: true, data, fetchedAt: Date.now() });
  } catch (err) {
    console.error("[/api/kpi]", err);
    return NextResponse.json(
      { ok: false, error: "No se pudo leer DB_KPI", data: null },
      { status: 200 }
    );
  }
}
