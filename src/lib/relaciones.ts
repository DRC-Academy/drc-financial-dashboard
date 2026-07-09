import { readSheetValues } from "./sheetsClient";
import { cached } from "./cache";
import type { CancelacionRow, CuponRow, RenovacionRow } from "@/types/kpi";

/**
 * Estas hojas tienen headers descriptivos (no claves técnicas como DB_KPI),
 * así que buscamos las columnas por nombre aproximado en la fila 1,
 * en lugar de asumir una posición fija. Esto es más tolerante a que
 * alguien reordene columnas en el Sheet.
 */
function findColumn(header: string[], candidates: string[]): number {
  const normalized = header.map((h) => String(h).trim().toLowerCase());
  for (const candidate of candidates) {
    const idx = normalized.findIndex((h) => h.includes(candidate));
    if (idx !== -1) return idx;
  }
  return -1;
}

export async function readCancelaciones(): Promise<CancelacionRow[]> {
  return cached("Cancelaciones", async () => {
    const rows = await readSheetValues("Cancelaciones");
    if (!rows || rows.length < 2) return [];

    const [header, ...body] = rows;
    const fechaIdx = findColumn(header, ["fecha"]);
    const motivoIdx = findColumn(header, ["motivo"]);
    const suscripcionIdx = findColumn(header, ["suscripcion", "suscripción"]);

    return body
      .filter((row) => row.some((c) => c !== undefined && c !== ""))
      .map((row) => ({
        fecha: fechaIdx >= 0 ? String(row[fechaIdx] ?? "") || null : null,
        motivo: motivoIdx >= 0 ? String(row[motivoIdx] ?? "Sin especificar") : "Sin especificar",
        suscripcion: suscripcionIdx >= 0 ? String(row[suscripcionIdx] ?? "") : "",
      }));
  });
}

export async function readCupones(): Promise<CuponRow[]> {
  return cached("Cupon", async () => {
    const rows = await readSheetValues("Cupon");
    if (!rows || rows.length < 2) return [];

    const [header, ...body] = rows;
    const fechaIdx = findColumn(header, ["fecha"]);
    const cuponIdx = findColumn(header, ["cupon", "cupón"]);
    const suscripcionIdx = findColumn(header, ["suscripcion", "suscripción"]);
    const impactoIdx = findColumn(header, ["impacto", "retencion", "retención"]);

    return body
      .filter((row) => row.some((c) => c !== undefined && c !== ""))
      .map((row) => ({
        fecha: fechaIdx >= 0 ? String(row[fechaIdx] ?? "") || null : null,
        cupon: cuponIdx >= 0 ? String(row[cuponIdx] ?? "") : "",
        suscripcion: suscripcionIdx >= 0 ? String(row[suscripcionIdx] ?? "") : "",
        impacto: impactoIdx >= 0 ? String(row[impactoIdx] ?? "") : "",
      }));
  });
}

export async function readRenovaciones(): Promise<RenovacionRow[]> {
  return cached("Renovaciones", async () => {
    const rows = await readSheetValues("Renovaciones");
    if (!rows || rows.length < 2) return [];

    const [header, ...body] = rows;
    const suscripcionIdx = findColumn(header, ["suscripcion", "suscripción"]);
    const estadoIdx = findColumn(header, ["estado"]);
    const fechaIdx = findColumn(header, ["fecha"]);

    return body
      .filter((row) => row.some((c) => c !== undefined && c !== ""))
      .map((row) => ({
        suscripcion: suscripcionIdx >= 0 ? String(row[suscripcionIdx] ?? "") : "",
        estado: estadoIdx >= 0 ? String(row[estadoIdx] ?? "") : "",
        fecha: fechaIdx >= 0 ? String(row[fechaIdx] ?? "") || null : null,
      }));
  });
}
