import type { ReactNode } from "react";
import clsx from "clsx";
import type { SemaforoColor } from "@/lib/kpiHelpers";

const SEMAFORO_BG: Record<SemaforoColor, string> = {
  green: "bg-drc-green",
  yellow: "bg-drc-yellow",
  red: "bg-drc-red",
  neutral: "bg-drc-line",
};

export function KpiCard({
  label,
  value,
  mom,
  momIsGoodWhenPositive = true,
  semaforo = "neutral",
  hint,
  size = "md",
  children,
}: {
  label: string;
  value: string;
  mom?: number | null;
  momIsGoodWhenPositive?: boolean;
  semaforo?: SemaforoColor;
  hint?: string;
  /** "lg" → tarjeta destacada (valor más grande), para la métrica principal. */
  size?: "md" | "lg";
  /** Contenido extra bajo el valor (p. ej. sub-valores B2C / B2B). */
  children?: ReactNode;
}) {
  const hasMom = mom !== undefined && mom !== null;
  const momPositive = hasMom && (mom as number) >= 0;
  const momGood = hasMom && momPositive === momIsGoodWhenPositive;
  const isLg = size === "lg";

  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-xl bg-drc-card border border-drc-line shadow-[0_1px_2px_rgba(20,35,26,0.04)]",
        isLg ? "pl-5 pr-5 py-5" : "pl-4 pr-4 py-4"
      )}
    >
      <span
        className={clsx(
          "absolute left-0 top-0 h-full w-1.5",
          SEMAFORO_BG[semaforo]
        )}
        aria-hidden
      />
      <div className="text-xs uppercase tracking-wide text-drc-ink-soft">
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span
          className={clsx(
            "tabular font-semibold text-drc-ink",
            isLg ? "text-4xl" : "text-2xl"
          )}
        >
          {value}
        </span>
        {hasMom && (
          <span
            className={clsx(
              "tabular text-xs font-medium rounded-full px-1.5 py-0.5",
              momGood
                ? "text-drc-green bg-drc-green/10"
                : "text-drc-red bg-drc-red/10"
            )}
          >
            {momPositive ? "▲" : "▼"} {Math.abs(mom as number).toFixed(1)}%
          </span>
        )}
      </div>
      {children && <div className="mt-2">{children}</div>}
      {hint && <div className="mt-1 text-[11px] text-drc-ink-soft">{hint}</div>}
    </div>
  );
}
