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
}: {
  label: string;
  value: string;
  mom?: number | null;
  momIsGoodWhenPositive?: boolean;
  semaforo?: SemaforoColor;
  hint?: string;
}) {
  const hasMom = mom !== undefined && mom !== null;
  const momPositive = hasMom && (mom as number) >= 0;
  const momGood = hasMom && (momPositive === momIsGoodWhenPositive);

  return (
    <div className="relative overflow-hidden rounded-xl bg-drc-card border border-drc-line pl-4 pr-4 py-4 shadow-[0_1px_2px_rgba(20,35,26,0.04)]">
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
        <span className="tabular text-2xl font-semibold text-drc-ink">
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
      {hint && <div className="mt-1 text-[11px] text-drc-ink-soft">{hint}</div>}
    </div>
  );
}
