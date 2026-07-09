import { NextResponse } from "next/server";
import { readGastos } from "@/lib/gastos";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await readGastos();
  return NextResponse.json({ ok: true, data, fetchedAt: Date.now() });
}
