"use client";

import clsx from "clsx";
import { formatPercentPoints } from "@/lib/kpiHelpers";
import type { AlertaColor, AlertaOperativa } from "@/lib/kpiHelpers";
import type { PeriodLabel } from "./KpiCard";

/**
 * Tarjeta grande (T) de un canal de ads (Google / Meta) con la misma jerarquía
 * tipográfica que KpiCard:
 *   - título del canal (label),
 *   - GASTO como dato prominente (n1, ~text-3xl) con badge MoM; opcionalmente un
 *     segundo titular (INGRESOS) al MISMO nivel, a su lado. El gasto es OPCIONAL:
 *     el canal "Otros" agrupa lo que no vino de Google ni de Meta y por lo tanto
 *     no tiene inversión en ads que atribuirle, así que su único titular son los
 *     ingresos. Se omite en vez de mostrar "—" para no sugerir un dato que falta.
 *   - resto de métricas como n2 en una grilla de 2 columnas (leads ads / mail
 *     en la primera fila), tamaños de letra menores que el n1.
 *   - cada n2 puede llevar un chip de alerta (EN OBJETIVO / BIEN / ...).
 * La pestañita lateral usa el color de identidad del canal.
 */

/** Chips de alerta (mismo criterio de color que KpiCard). */
const ALERTA_CHIP: Record<AlertaColor, string> = {
  blue: "text-drc-blue bg-drc-blue/10",
  green: "text-drc-green bg-drc-green/10",
  yellow: "text-drc-yellow-deep bg-drc-yellow/25",
  red: "text-drc-red bg-drc-red/10",
};

export interface ChannelMetric {
  label: string;
  value: string;
  /** Alerta por umbrales (getAlertaOperativa). Se muestra como chip junto al valor. */
  alerta?: AlertaOperativa | null;
}

/** Un titular (n1): etiqueta + valor grande + badge MoM opcional. */
export interface ChannelHeadline {
  label: string;
  value: string;
  mom?: number | null;
  isGoodWhenPositive?: boolean;
}

export function ChannelAdsCard({
  title,
  accentColor,
  gastoLabel,
  gasto,
  gastoMom,
  gastoIsGoodWhenPositive = true,
  ingreso,
  leads,
  metrics,
  period = "MoM",
  className,
}: {
  title: string;
  /** Color (hex) de la pestañita lateral e identidad del canal. */
  accentColor: string;
  /** Titular de gasto. Se omite en canales sin inversión atribuible (ver arriba). */
  gastoLabel?: string;
  gasto?: string;
  gastoMom?: number | null;
  gastoIsGoodWhenPositive?: boolean;
  /** Segundo titular opcional (ingresos), al mismo nivel visual que el gasto. */
  ingreso?: ChannelHeadline;
  /**
   * Fila superior de n2. Con granularidad mensual son dos (leads ads / leads
   * mail); la hoja semanal no trae ese desglose, así que admite uno solo.
   */
  leads: ChannelMetric[];
  /** Resto de n2, en grilla de 2 columnas. */
  metrics: ChannelMetric[];
  /** Período contra el que compara el badge de los titulares (MoM, WoW, ...). */
  period?: PeriodLabel;
  className?: string;
}) {
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

      {/* Titulares — n1 prominentes: gasto y (opcional) ingresos al mismo nivel */}
      {(() => {
        const tieneGasto = gasto !== undefined;
        return (
          <div
            className={clsx(
              "mt-3 grid gap-4",
              tieneGasto && ingreso ? "grid-cols-2" : "grid-cols-1"
            )}
          >
            {tieneGasto && (
              <Headline
                label={gastoLabel ?? "Inversión"}
                value={gasto}
                mom={gastoMom}
                isGoodWhenPositive={gastoIsGoodWhenPositive}
                period={period}
              />
            )}
            {ingreso && <Headline period={period} {...ingreso} />}
          </div>
        );
      })()}

      {/* Leads + métricas (n2) — grilla de 2 columnas */}
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

/** Un titular n1: etiqueta pequeña + valor grande + badge de variación opcional. */
function Headline({
  label,
  value,
  mom,
  isGoodWhenPositive = true,
  period = "MoM",
}: ChannelHeadline & { period?: PeriodLabel }) {
  const hasMom = mom !== undefined && mom !== null;
  const isPositive = (mom ?? 0) >= 0;
  const isGood = isPositive === isGoodWhenPositive;

  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-drc-ink-soft">
        {label}
      </div>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
        <span className="tabular text-3xl font-semibold text-drc-ink">{value}</span>
        {hasMom && (
          <span
            className={clsx(
              "tabular text-xs font-medium rounded-full px-1.5 py-0.5 whitespace-nowrap",
              isGood
                ? "text-drc-green bg-drc-green/10"
                : "text-drc-red bg-drc-red/10"
            )}
          >
            {isPositive ? "▲" : "▼"} {formatPercentPoints(Math.abs(mom as number))}{" "}
            <span className="opacity-70">{period}</span>
          </span>
        )}
      </div>
    </div>
  );
}

/** Un valor n2: etiqueta pequeña (con chip de alerta opcional) + valor tabular. */
function Metric({ label, value, alerta }: ChannelMetric) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-drc-ink-soft">
          {label}
        </span>
        {alerta && (
          <span
            className={clsx(
              "text-[9px] font-semibold uppercase tracking-wide rounded-full px-1 py-0.5 whitespace-nowrap",
              ALERTA_CHIP[alerta.color]
            )}
          >
            {alerta.texto}
          </span>
        )}
      </div>
      <div className="tabular text-lg font-semibold text-drc-ink">{value}</div>
    </div>
  );
}
