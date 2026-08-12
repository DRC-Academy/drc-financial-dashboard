"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  WEEKDAYS_ES,
  addDays,
  addMonthKey,
  addMonths,
  clampIso,
  formatDayLabel,
  monthGrid,
  monthKey,
  monthKeyLabel,
  startOfMonth,
  startOfQuarter,
  startOfYear,
} from "@/lib/isoDate";

/**
 * Selector de rango de fechas con atajos + dos calendarios.
 *
 * Existe para la página diaria y sólo para ella: con un punto por día, las
 * píldoras "3M/6M/12M" del RangeFilter no permiten decir "del 3 al 17 de julio",
 * que es justo la pregunta que se le hace a una serie diaria. El resto del
 * dashboard sigue con RangeFilter a propósito.
 *
 * Reglas de la interacción:
 *  - El rango sólo se confirma con "Aplica". Todo lo que se toca antes vive en
 *    un borrador local, así que ningún click intermedio del calendario dispara
 *    un refetch ni deja los gráficos parpadeando a mitad de selección.
 *  - Cerrar sin aplicar (Escape o click fuera) descarta el borrador.
 *  - Los días fuera de `availableDays` van deshabilitados: no tiene sentido
 *    poder elegir un día del que no hay dato.
 */

export interface DayRange {
  from: string;
  to: string;
}

interface Draft {
  from: string | null;
  to: string | null;
}

/**
 * Atajos. Se anclan al ÚLTIMO DÍA CON DATO (`max`), no a la fecha real del
 * navegador: el Sheet suele ir uno o dos días por detrás, y anclar a "hoy de
 * verdad" haría que "Hoy" y "Últimos 7 días" cayeran fuera del dataset y
 * devolvieran un rango vacío.
 */
const SHORTCUTS: { label: string; of: (min: string, max: string) => DayRange }[] = [
  { label: "Hoy", of: (_min, max) => ({ from: max, to: max }) },
  { label: "Últimos 7 días", of: (_min, max) => ({ from: addDays(max, -6), to: max }) },
  { label: "Últimas 4 semanas", of: (_min, max) => ({ from: addDays(max, -27), to: max }) },
  { label: "Últimos 6 meses", of: (_min, max) => ({ from: addDays(addMonths(max, -6), 1), to: max }) },
  { label: "Últimos 12 meses", of: (_min, max) => ({ from: addDays(addMonths(max, -12), 1), to: max }) },
  { label: "Acumulado del mes", of: (_min, max) => ({ from: startOfMonth(max), to: max }) },
  { label: "Acumulado del trimestre", of: (_min, max) => ({ from: startOfQuarter(max), to: max }) },
  { label: "Acumulado del año", of: (_min, max) => ({ from: startOfYear(max), to: max }) },
  { label: "Siempre", of: (min, max) => ({ from: min, to: max }) },
];

export function DateRangePicker({
  value,
  onChange,
  availableDays,
  label = "Rango",
  className,
}: {
  value: DayRange;
  /** Se dispara SÓLO al pulsar "Aplica". */
  onChange: (range: DayRange) => void;
  /** Días con dato, en ISO y orden cronológico. Fuera de aquí, no clickeable. */
  availableDays: string[];
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({ from: value.from, to: value.to });
  const [hover, setHover] = useState<string | null>(null);
  const [leftMonth, setLeftMonth] = useState<string>(monthKey(value.to));
  const rootRef = useRef<HTMLDivElement>(null);

  const min = availableDays[0] ?? "";
  const max = availableDays[availableDays.length - 1] ?? "";
  const availableSet = useMemo(() => new Set(availableDays), [availableDays]);

  /** Deja un rango de atajo dentro de los días que existen de verdad. */
  const clampRange = (r: DayRange): DayRange => ({
    from: clampIso(r.from, min, max),
    to: clampIso(r.to, min, max),
  });

  /**
   * Abrir re-sincroniza el borrador con el valor aplicado y coloca la vista en
   * los dos meses del rango. Si el rango cabe en un solo mes, ese mes va a la
   * DERECHA y el anterior a la izquierda (es lo que se espera al abrir: el mes
   * en curso con algo de contexto hacia atrás).
   *
   * Va en el handler y no en un efecto a propósito: sincronizar estado al abrir
   * es una respuesta a un evento del usuario, no a un sistema externo, y hacerlo
   * en un useEffect encadena un render de más (lo marca react-hooks).
   */
  const openPicker = () => {
    setDraft({ from: value.from, to: value.to });
    setHover(null);
    const kFrom = monthKey(value.from);
    const kTo = monthKey(value.to);
    setLeftMonth(kFrom === kTo ? addMonthKey(kTo, -1) : kFrom);
    setOpen(true);
  };

  // Cerrar al hacer click fuera o con Escape. En los dos casos se descarta el
  // borrador (el efecto de arriba lo repone en la próxima apertura).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (availableDays.length === 0) return null;

  const rightMonth = addMonthKey(leftMonth, 1);
  const canGoBack = leftMonth > monthKey(min);
  const canGoFwd = rightMonth < monthKey(max);

  /**
   * Extremos EFECTIVOS del borrador para pintar. Mientras hay un solo extremo
   * elegido, el día bajo el cursor hace de segundo: es lo que da el "preview"
   * del rango antes de cerrar la selección.
   */
  const previewEnd = draft.from && !draft.to ? hover : null;
  const lo = draft.from && previewEnd && previewEnd < draft.from ? previewEnd : draft.from;
  const hi = draft.from && previewEnd && previewEnd < draft.from ? draft.from : (draft.to ?? previewEnd);

  // Updater funcional a propósito: dos clicks que caigan en el mismo lote de
  // React verían el mismo `draft` del closure, y el segundo empezaría una
  // selección nueva en vez de cerrar la que abrió el primero.
  const onDayClick = (day: string) => {
    setDraft((prev) => {
      // Primer click, o click nuevo con el rango ya cerrado → empieza de cero.
      if (!prev.from || prev.to) return { from: day, to: null };
      // Segundo click: cierra el rango, dando vuelta los extremos si hace falta.
      return day < prev.from
        ? { from: day, to: prev.from }
        : { from: prev.from, to: day };
    });
  };

  const applyDraft = () => {
    if (!draft.from) return;
    onChange({ from: draft.from, to: draft.to ?? draft.from });
    setOpen(false);
  };

  /** Atajo cuyo rango coincide con el borrador, para marcarlo como activo. */
  const activeShortcut = SHORTCUTS.find((s) => {
    if (!draft.from || !draft.to) return false;
    const r = clampRange(s.of(min, max));
    return r.from === draft.from && r.to === draft.to;
  })?.label;

  const triggerText =
    value.from === value.to
      ? formatDayLabel(value.from)
      : `${formatDayLabel(value.from)} → ${formatDayLabel(value.to)}`;

  return (
    <div ref={rootRef} className={clsx("relative", className)}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={clsx(
          "inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-xs transition-colors",
          open
            ? "border-drc-green text-drc-ink"
            : "border-drc-line text-drc-ink hover:border-drc-green/50"
        )}
      >
        <span className="uppercase tracking-wide text-drc-ink-soft">{label}</span>
        <span className="tabular font-medium">{triggerText}</span>
        <span className={clsx("text-drc-ink-soft transition-transform", open && "rotate-180")}>
          ▾
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Seleccionar rango de fechas"
          className="absolute right-0 z-30 mt-2 w-[min(43rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-drc-line bg-white shadow-[0_12px_32px_rgba(20,35,26,0.14)]"
        >
          <div className="flex flex-col sm:flex-row">
            {/* --- Izquierda · atajos --- */}
            <div className="shrink-0 border-b border-drc-line p-2 sm:w-48 sm:border-b-0 sm:border-r">
              <div className="flex gap-1 overflow-x-auto sm:block sm:overflow-visible">
                {SHORTCUTS.map((s) => {
                  const active = activeShortcut === s.label;
                  return (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => {
                        const r = clampRange(s.of(min, max));
                        setDraft(r);
                        setLeftMonth(
                          monthKey(r.from) === monthKey(r.to)
                            ? addMonthKey(monthKey(r.to), -1)
                            : monthKey(r.from)
                        );
                      }}
                      title={
                        s.label === "Hoy"
                          ? "El último día con dato en la hoja"
                          : undefined
                      }
                      className={clsx(
                        "w-full shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-left text-xs transition-colors",
                        active
                          ? "bg-drc-green/12 font-medium text-drc-green"
                          : "text-drc-ink-soft hover:bg-drc-bg hover:text-drc-ink"
                      )}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* --- Derecha · campos + calendarios --- */}
            <div className="min-w-0 flex-1 p-3">
              <div className="mb-3 flex flex-wrap items-end gap-3">
                <DateField
                  label="Inicio"
                  value={draft.from}
                  min={min}
                  max={max}
                  onChange={(v) =>
                    setDraft((d) => ({
                      from: v,
                      // Escribir un inicio posterior al fin dejaría un rango dado
                      // vuelta: se suelta el fin y se vuelve a "elegí el otro
                      // extremo", en vez de guardar un rango imposible.
                      to: d.to && v && v > d.to ? null : d.to,
                    }))
                  }
                />
                <span className="pb-1.5 text-drc-ink-soft">→</span>
                <DateField
                  label="Final"
                  value={draft.to}
                  min={draft.from ?? min}
                  max={max}
                  onChange={(v) => setDraft((d) => ({ ...d, to: v }))}
                />
              </div>

              <div className="mb-1 flex items-center justify-between">
                <NavButton
                  dir="prev"
                  disabled={!canGoBack}
                  onClick={() => setLeftMonth((m) => addMonthKey(m, -1))}
                />
                <NavButton
                  dir="next"
                  disabled={!canGoFwd}
                  onClick={() => setLeftMonth((m) => addMonthKey(m, 1))}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[leftMonth, rightMonth].map((mk) => (
                  <MonthCalendar
                    key={mk}
                    monthKeyValue={mk}
                    lo={lo}
                    hi={hi}
                    availableSet={availableSet}
                    onPick={onDayClick}
                    onHover={setHover}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-drc-line bg-drc-bg px-3 py-2">
            <span className="text-[11px] text-drc-ink-soft">
              {draft.from && !draft.to
                ? "Elegí el día final"
                : draft.from
                  ? `${formatDayLabel(draft.from)} → ${formatDayLabel(draft.to as string)}`
                  : "Sin selección"}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraft({ from: null, to: null });
                  setHover(null);
                }}
                className="rounded-lg px-3 py-1.5 text-xs text-drc-ink-soft transition-colors hover:bg-white hover:text-drc-ink"
              >
                Borra
              </button>
              <button
                type="button"
                onClick={applyDraft}
                disabled={!draft.from}
                className={clsx(
                  "rounded-lg px-4 py-1.5 text-xs font-medium transition-colors",
                  draft.from
                    ? "bg-drc-green text-white hover:bg-drc-green-deep"
                    : "cursor-not-allowed bg-drc-line text-white/70"
                )}
              >
                Aplica
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Campo de fecha editable. `type="date"` da el editor numérico día/mes/año del
 * sistema (y su validación de min/max) sin reimplementar tres inputs y su
 * parseo; el valor viaja en ISO, que es justo el formato del resto del módulo.
 */
function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string | null;
  min: string;
  max: string;
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-drc-ink-soft">
        {label}
      </span>
      <input
        type="date"
        value={value ?? ""}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value || null)}
        className="tabular rounded-lg border border-drc-line bg-white px-2.5 py-1.5 text-xs text-drc-ink focus:border-drc-green focus:outline-none"
      />
    </label>
  );
}

function NavButton({
  dir,
  disabled,
  onClick,
}: {
  dir: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Mes anterior" : "Mes siguiente"}
      className={clsx(
        "rounded-md px-2 py-0.5 text-sm transition-colors",
        disabled
          ? "cursor-not-allowed text-drc-line"
          : "text-drc-ink-soft hover:bg-drc-bg hover:text-drc-ink"
      )}
    >
      {dir === "prev" ? "‹" : "›"}
    </button>
  );
}

function MonthCalendar({
  monthKeyValue,
  lo,
  hi,
  availableSet,
  onPick,
  onHover,
}: {
  monthKeyValue: string;
  lo: string | null;
  hi: string | null;
  availableSet: Set<string>;
  onPick: (day: string) => void;
  onHover: (day: string | null) => void;
}) {
  const cells = monthGrid(monthKeyValue);

  return (
    <div onMouseLeave={() => onHover(null)}>
      <div className="mb-1 text-center text-xs font-medium capitalize text-drc-ink">
        {monthKeyLabel(monthKeyValue)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {WEEKDAYS_ES.map((w, i) => (
          <div
            key={`${w}-${i}`}
            className="pb-1 text-center text-[10px] uppercase text-drc-ink-soft"
          >
            {w}
          </div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />;

          const disabled = !availableSet.has(day);
          const isStart = lo === day;
          const isEnd = hi === day;
          const inRange = !!lo && !!hi && day > lo && day < hi;
          const isEdge = isStart || isEnd;

          return (
            <div
              key={day}
              className={clsx(
                // El fondo del rango va en el contenedor, no en el botón: así la
                // banda verde es continua entre celdas en vez de una fila de
                // cuadraditos con hueco.
                "flex justify-center",
                (inRange || (isEdge && lo !== hi)) && "bg-drc-green/12",
                isStart && lo !== hi && "rounded-l-full",
                isEnd && lo !== hi && "rounded-r-full"
              )}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(day)}
                onMouseEnter={() => onHover(day)}
                aria-label={formatDayLabel(day)}
                aria-pressed={isEdge}
                className={clsx(
                  "tabular flex h-7 w-7 items-center justify-center rounded-full text-[11px] transition-colors",
                  disabled && "cursor-not-allowed text-drc-line",
                  !disabled && isEdge && "bg-drc-green font-semibold text-white",
                  !disabled && !isEdge && inRange && "text-drc-ink",
                  !disabled && !isEdge && !inRange && "text-drc-ink hover:bg-drc-green/20"
                )}
              >
                {Number(day.slice(8))}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
