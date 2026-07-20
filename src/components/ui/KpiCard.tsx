import type { ReactNode } from "react";
import clsx from "clsx";
import {
  alertaToSemaforo,
  formatNumberDelta,
  formatPercentPoints,
} from "@/lib/kpiHelpers";
import type {
  AlertaColor,
  AlertaOperativa,
  SemaforoColor,
} from "@/lib/kpiHelpers";

/**
 * Tarjeta KPI con 4 niveles explícitos de jerarquía:
 *
 *  T  (titular)  → size="titular": valor ~1.5x, para la métrica que manda en la fila.
 *  n1 (principal)→ el `value` de una tarjeta normal. Es el comportamiento por defecto.
 *  n2 (secundario)→ `subValues`: valores subordinados dentro de la misma tarjeta,
 *                   debajo del n1 o a su derecha (`subValuesPosition`).
 *  n3 (comparativo)→ badge de variación (`mom` y/o `momDelta`) junto al valor.
 *                    El badge SIEMPRE dice contra qué período compara (`period`).
 *
 * `alerta` (por umbrales) va JUNTO AL TÍTULO y además pinta la pestañita/borde
 * lateral con su color (azul/verde/amarillo/rojo), salvo que se pase un
 * `semaforo` explícito distinto de "neutral".
 */

const SEMAFORO_BG: Record<SemaforoColor, string> = {
  green: "bg-drc-green",
  yellow: "bg-drc-yellow",
  red: "bg-drc-red",
  blue: "bg-drc-blue",
  neutral: "bg-drc-line",
};

/** Chips de alerta. El texto usa el tono "-deep" en amarillo: el de marca no
 *  contrasta lo suficiente sobre fondo claro. */
const ALERTA_CHIP: Record<AlertaColor, string> = {
  blue: "text-drc-blue bg-drc-blue/10",
  green: "text-drc-green bg-drc-green/10",
  yellow: "text-drc-yellow-deep bg-drc-yellow/25",
  red: "text-drc-red bg-drc-red/10",
};

/**
 * Etiqueta de período del comparativo n3. Hoy sólo generamos "MoM", pero el
 * componente lo recibe como prop para no tener que tocarlo cuando entren las
 * comparativas YoY. `(string & {})` en vez de `string` a secas para no perder
 * el autocompletado de "MoM" / "YoY".
 */
export type PeriodLabel = "MoM" | "YoY" | (string & {});

/** Nivel n2: un valor subordinado dentro de la tarjeta. */
export interface KpiSubValue {
  label: string;
  value: string;
}

export function KpiCard({
  label,
  value,
  size = "n1",
  mom,
  momDelta,
  formatDelta = formatNumberDelta,
  period = "MoM",
  momIsGoodWhenPositive = true,
  alerta,
  subValues,
  subValuesPosition = "below",
  semaforo = "neutral",
  hint,
  className,
  children,
}: {
  label: string;
  /** n1: el dato principal, ya formateado. */
  value: string;
  /** "titular" (T) → tarjeta grande, ~1.5x. "n1" (default) → tarjeta normal. */
  size?: "n1" | "titular";
  /** n3: variación en PUNTOS porcentuales (5.3 → "▲ 5,3% MoM"). */
  mom?: number | null;
  /** n3: delta absoluto en la unidad de la métrica. Combinable con `mom`. */
  momDelta?: number | null;
  /** Cómo formatear `momDelta` (p. ej. formatCurrencyDelta para métricas en €). */
  formatDelta?: (v: number) => string;
  /** Período contra el que compara el n3. Se pega al badge. */
  period?: PeriodLabel;
  momIsGoodWhenPositive?: boolean;
  /** Alerta por umbrales (getAlertaOperativa / getAlertaObjetivo). Se muestra
   *  junto al título y pinta el borde lateral. null/undefined → no pinta nada. */
  alerta?: AlertaOperativa | null;
  /** n2: sub-valores subordinados al n1. */
  subValues?: KpiSubValue[];
  /** Dónde se apilan los n2: debajo del n1 o a su derecha. */
  subValuesPosition?: "below" | "right";
  semaforo?: SemaforoColor;
  hint?: string;
  className?: string;
  /** Contenido extra libre bajo el valor. Para n2 preferí `subValues`. */
  children?: ReactNode;
}) {
  const isTitular = size === "titular";

  const hasMom = mom !== undefined && mom !== null;
  const hasDelta = momDelta !== undefined && momDelta !== null;
  const hasBadge = hasMom || hasDelta;
  // La dirección la marca el %, y si no hay %, el delta absoluto.
  const direction = hasMom ? mom : hasDelta ? momDelta : 0;
  const isPositive = (direction as number) >= 0;
  const isGood = isPositive === momIsGoodWhenPositive;

  const badgeParts: string[] = [];
  if (hasDelta) badgeParts.push(formatDelta(momDelta as number));
  if (hasMom) badgeParts.push(formatPercentPoints(Math.abs(mom as number)));

  // El borde/pestañita se pinta según la alerta (si hay) salvo que se pase un
  // semáforo explícito distinto de "neutral": así una sola prop `alerta` maneja
  // chip + color de borde de forma consistente (patrón de LTV/CPL/CAC/CR).
  const effectiveSemaforo: SemaforoColor =
    alerta && semaforo === "neutral" ? alertaToSemaforo(alerta.color) : semaforo;

  const toRight = subValuesPosition === "right";
  // Los n2 escalan con el nivel de la tarjeta: en una titular (T) pesan más que
  // en una normal, manteniendo la jerarquía T > n1 > n2 dentro de cada tamaño.
  const subs =
    subValues && subValues.length > 0 ? (
      <div className={clsx("flex flex-col gap-0.5", toRight && "items-end")}>
        {subValues.map((sv) => (
          <div key={sv.label} className="flex items-baseline gap-1.5">
            <span
              className={clsx(
                "text-drc-ink-soft",
                isTitular ? "text-xs" : "text-[11px]"
              )}
            >
              {sv.label}
            </span>
            <span
              className={clsx(
                "tabular font-medium text-drc-ink",
                isTitular ? "text-base" : "text-sm"
              )}
            >
              {sv.value}
            </span>
          </div>
        ))}
      </div>
    ) : null;

  const alertaChip = alerta ? (
    <span
      className={clsx(
        "text-[10px] font-semibold uppercase tracking-wide rounded-full px-1.5 py-0.5 whitespace-nowrap",
        ALERTA_CHIP[alerta.color]
      )}
    >
      {alerta.texto}
    </span>
  ) : null;

  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-xl bg-drc-card border border-drc-line shadow-[0_1px_2px_rgba(20,35,26,0.04)]",
        isTitular ? "px-5 py-5" : "px-4 py-4",
        className
      )}
    >
      <span
        className={clsx(
          "absolute left-0 top-0 h-full w-1.5",
          SEMAFORO_BG[effectiveSemaforo]
        )}
        aria-hidden
      />
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wide text-drc-ink-soft">
          {label}
        </div>
        {alertaChip}
      </div>

      <div
        className={clsx(
          "mt-1.5",
          toRight && "flex items-end justify-between gap-4"
        )}
      >
        <div>
          <div className="flex flex-wrap items-baseline gap-2">
            <span
              className={clsx(
                "tabular font-semibold text-drc-ink",
                isTitular ? "text-4xl" : "text-2xl"
              )}
            >
              {value}
            </span>
            {hasBadge && (
              <span
                className={clsx(
                  "tabular text-xs font-medium rounded-full px-1.5 py-0.5 whitespace-nowrap",
                  isGood
                    ? "text-drc-green bg-drc-green/10"
                    : "text-drc-red bg-drc-red/10"
                )}
              >
                {isPositive ? "▲" : "▼"} {badgeParts.join(" · ")}{" "}
                <span className="opacity-70">{period}</span>
              </span>
            )}
          </div>
          {subs && !toRight && <div className="mt-2">{subs}</div>}
        </div>
        {subs && toRight && subs}
      </div>

      {children && <div className="mt-2">{children}</div>}
      {hint && <div className="mt-1 text-[11px] text-drc-ink-soft">{hint}</div>}
    </div>
  );
}
