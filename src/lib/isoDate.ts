/**
 * Utilidades de fecha en formato ISO "YYYY-MM-DD", el que usa la página diaria
 * y el DateRangePicker.
 *
 * Por qué strings ISO y no Date: son ordenables lexicográficamente (a < b es la
 * comparación cronológica), sirven de clave de objeto sin ambigüedad y no
 * arrastran zona horaria. Toda la aritmética que necesita un Date de verdad se
 * hace en UTC: con hora local, un país en DST puede hacer que sumar 1 día caiga
 * en el mismo día (23h) o se salte uno (25h), y la serie diaria se corre.
 *
 * Módulo puro y client-safe: no toca Sheets ni googleapis.
 */

const MS_DAY = 86_400_000;

/** Meses abreviados en español, en el mismo estilo que kpiHelpers. */
export const MONTHS_ES_SHORT = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/** Meses completos, para el encabezado de los calendarios. */
export const MONTHS_ES_LONG = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Iniciales de los días, semana que EMPIEZA EN LUNES (convención es-ES). */
export const WEEKDAYS_ES = ["L", "M", "X", "J", "V", "S", "D"];

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: string | null | undefined): s is string {
  return !!s && ISO_RE.test(s);
}

/** "2026-08-12" → Date en UTC a medianoche. */
export function isoToUTC(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Date → "YYYY-MM-DD" leyendo los campos UTC. */
export function utcToIso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

/**
 * Serial de fecha de Google Sheets → "YYYY-MM-DD".
 * Epoch de los seriales = 1899-12-30 (el bug del año bisiesto de Lotus 1-2-3
 * que Sheets heredó); en UTC para no desfasar un día.
 */
export function serialToIsoDate(serial: number): string {
  return utcToIso(new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * MS_DAY));
}

/**
 * Normaliza el valor de la columna "day" del Sheet a ISO "YYYY-MM-DD".
 * Acepta el serial sin formatear (45657, que es lo que devuelve la API con
 * UNFORMATTED_VALUE), un ISO ya hecho, o el texto "DD/MM/YYYY" por si la hoja
 * cambia de formato. Devuelve "" si no se puede interpretar.
 */
export function parseSheetDay(raw: unknown): string {
  if (raw === null || raw === undefined) return "";

  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 30000 ? serialToIsoDate(raw) : "";
  }

  const s = String(raw).trim();
  if (s === "") return "";
  if (ISO_RE.test(s)) return s;

  const n = Number(s);
  if (Number.isFinite(n) && n >= 30000) return serialToIsoDate(n);

  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return "";
}

/** Suma (o resta, con n negativo) días a una fecha ISO. */
export function addDays(iso: string, n: number): string {
  return utcToIso(new Date(isoToUTC(iso).getTime() + n * MS_DAY));
}

/**
 * Suma meses conservando el día, con clamp al último día del mes destino:
 * addMonths("2026-03-31", -1) → "2026-02-28" y no el "2026-03-03" que daría
 * el desbordamiento natural de Date.
 */
export function addMonths(iso: string, n: number): string {
  const d = isoToUTC(iso);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return utcToIso(target);
}

/** Días de diferencia entre dos ISO (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((isoToUTC(b).getTime() - isoToUTC(a).getTime()) / MS_DAY);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function startOfQuarter(iso: string): string {
  const d = isoToUTC(iso);
  const q = Math.floor(d.getUTCMonth() / 3) * 3;
  return `${d.getUTCFullYear()}-${String(q + 1).padStart(2, "0")}-01`;
}

export function startOfYear(iso: string): string {
  return `${iso.slice(0, 4)}-01-01`;
}

/** "2026-08" — la clave de mes que usan los calendarios para navegar. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function addMonthKey(key: string, n: number): string {
  return monthKey(addMonths(`${key}-01`, n));
}

/** "2026-08" → "agosto 2026", para el encabezado del calendario. */
export function monthKeyLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS_ES_LONG[m - 1]} ${y}`;
}

/** "2026-08-12" → "12 ago 2026". */
export function formatDayLabel(iso: string): string {
  if (!isIsoDate(iso)) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_ES_SHORT[m - 1]} ${y}`;
}

/** "2026-08-12" → "12 ago". Para los ticks del eje X, donde el año sobra. */
export function formatDayShort(iso: string): string {
  if (!isIsoDate(iso)) return iso;
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_ES_SHORT[m - 1]}`;
}

/**
 * Celdas de un calendario mensual, en semanas de lunes a domingo. Las posiciones
 * anteriores al día 1 y posteriores al último se rellenan con null para que la
 * grilla de 7 columnas quede alineada.
 */
export function monthGrid(key: string): (string | null)[] {
  const first = `${key}-01`;
  const d = isoToUTC(first);
  // getUTCDay() es 0=domingo; lo giramos para que 0=lunes.
  const lead = (d.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
  ).getUTCDate();

  const cells: (string | null)[] = new Array(lead).fill(null);
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push(`${key}-${String(i).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** Deja `iso` dentro de [min, max]. */
export function clampIso(iso: string, min: string, max: string): string {
  if (iso < min) return min;
  if (iso > max) return max;
  return iso;
}
