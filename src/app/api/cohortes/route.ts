import { NextResponse } from "next/server";
import { readCohortesClientes, readCohortesProducto } from "@/lib/cohortes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get("tipo") ?? "clientes";

  try {
    const data =
      tipo === "producto"
        ? await readCohortesProducto()
        : await readCohortesClientes();
    return NextResponse.json({ ok: true, data, fetchedAt: Date.now() });
  } catch (err) {
    console.error("[/api/cohortes]", err);
    return NextResponse.json(
      { ok: false, error: "No se pudo leer las cohortes", data: null },
      { status: 200 }
    );
  }
}
