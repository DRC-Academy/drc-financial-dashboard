"use client";

import clsx from "clsx";
import { formatPercentPoints } from "@/lib/kpiHelpers";

/**
 * Tarjeta grande (T) de un canal de ads (Google / Meta) con la misma jerarquía
 * tipográfica que KpiCard:
 *   - título del canal (label),
 *   - GASTO como dato más prominente (n1, ~text-3xl) con badge MoM,
 *   - resto de métricas como n2 en una grilla de 2 columnas (leads ads / mail
 *     en la primera fila), tamaños de letra menores que el n1.
 * La pestañita lateral usa el color de identidad del canal.
 */

export interface ChannelMetric {
  label: string;
  value: string;
}

export function ChannelAdsCard({
  title,
  accentColor,
  gastoLabel,
  gasto,
  gastoMom,
  gastoIsGoodWhenPositive = true,
  leads,
  metrics,
  className,
}: {
  title: string;
  /** Color (hex) de la pestañita lateral e identidad del canal. */
  accentColor: string;
  gastoLabel: string;
  gasto: string;
  gastoMom?: number | null;
  gastoIsGoodWhenPositive?: boolean;
  /** Fila superior de n2: dos valores lado a lado (leads ads / leads mail). */
  leads: [ChannelMetric, ChannelMetric];
  /** Resto de n2, en grilla de 2 columnas. */
  metrics: ChannelMetric[];
  className?: string;
}) {
  const hasMom = gastoMom !== undefined && gastoMom !== null;
  const isPositive = (gastoMom ?? 0) >= 0;
  const isGood = isPositive === gastoIsGoodWhenPositive;

  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-xl bg-drc-card border border-drc-line px-5 py-5 shadow-[0_1px_2px_rgba(20,35,26,0.04)]",
        className
      )}
    >
      <span
        className="absolute left-0 top-0 h-full w-1.5"
        style={{ background: accentColor }}
        aria-hidden
      />

      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: accentColor }}
          aria-hidden
        />
        <span className="text-sm font-semibold text-drc-ink">{title}</span>
      </div>

      {/* GASTO — n1 prominente */}
      <div className="mt-3">
        <div className="text-[11px] uppercase tracking-wide text-drc-ink-soft">
          {gastoLabel}
        </div>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
          <span className="tabular text-3xl font-semibold text-drc-ink">
            {gasto}
          </span>
          {hasMom && (
            <span
              className={clsx(
                "tabular text-xs font-medium rounded-full px-1.5 py-0.5 whitespace-nowrap",
                isGood
                  ? "text-drc-green bg-drc-green/10"
                  : "text-drc-red bg-drc-red/10"
              )}
            >
              {isPositive ? "▲" : "▼"} {formatPercentPoints(Math.abs(gastoMom as number))}{" "}
              <span className="opacity-70">MoM</span>
            </span>
          )}
        </div>
      </div>

      {/* Leads (n2) — dos valores lado a lado */}
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-drc-line pt-4">
        {leads.map((m) => (
          <Metric key={m.label} {...m} />
        ))}
        {metrics.map((m) => (
          <Metric key={m.label} {...m} />
        ))}
      </div>
    </div>
  );
}

/** Un valor n2: etiqueta pequeña + valor tabular medio. */
function Metric({ label, value }: ChannelMetric) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-drc-ink-soft">
        {label}
      </div>
      <div className="tabular text-lg font-semibold text-drc-ink">{value}</div>
    </div>
  );
}
