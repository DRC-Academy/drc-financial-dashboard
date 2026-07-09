import { NextResponse } from "next/server";
import {
  readCancelaciones,
  readCupones,
  readRenovaciones,
} from "@/lib/relaciones";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get("tipo") ?? "cancelaciones";

  try {
    let data;
    if (tipo === "cupones") data = await readCupones();
    else if (tipo === "renovaciones") data = await readRenovaciones();
    else data = await readCancelaciones();

    return NextResponse.json({ ok: true, data, fetchedAt: Date.now() });
  } catch (err) {
    console.error("[/api/relaciones]", err);
    return NextResponse.json(
      { ok: false, error: "No se pudo leer los datos", data: null },
      { status: 200 }
    );
  }
}
