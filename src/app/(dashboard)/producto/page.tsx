"use client";

import { useMemo, useState } from "react";
import { useLiveData } from "@/hooks/useLiveData";
import { PageHeader } from "@/components/ui/PageHeader";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { MonthSelect } from "@/components/ui/MonthSelect";
import { KpiCard } from "@/components/ui/KpiCard";
import { Panel } from "@/components/ui/Panel";
import { RankedBars } from "@/components/ui/RankedBars";
import { StackedBarChart } from "@/components/ui/StackedBarChart";
import { RangeFilter, applyRange } from "@/components/ui/RangeFilter";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  QuadrantChart,
  CUADRANTES,
  clasificar,
  medianaX,
  type CuadranteKey,
  type QuadrantPoint,
} from "@/components/ui/QuadrantChart";
import {
  formatCurrency,
  formatNumber,
  formatPercentPoints,
} from "@/lib/kpiHelpers";
import { INGRESO, NEUTRO } from "@/lib/chartColors";
import {
  getBlock,
  growthAtMonth,
  rankAtMonth,
  EMPTY_PRODUCTO_KPI,
  type ProductoKpiData,
} from "@/lib/productoKpiHelpers";

/** Cuántos productos se apilan en el mix antes de agrupar el resto en "Otros". */
const MIX_TOP_N = 3;

export default function ProductoPage() {
  const { data, loading, error, fetchedAt } = useLiveData<ProductoKpiData>(
    "/api/producto-kpi",
    60_000
  );

  const kpi = data ?? EMPTY_PRODUCTO_KPI;
  const months = kpi.months;
  const hasAnyData = months.length > 0;

  const [monthChoice, setMonthChoice] = useState<string>("");
  const activeMonth =
    monthChoice && months.includes(monthChoice)
      ? monthChoice
      : months[months.length - 1] ?? "";

  const [mixRange, setMixRange] = useState(0);

  const bIngresos = getBlock(kpi, "Ingresos");
  const bPedidos = getBlock(kpi, "Pedidos");
  const bLtv = getBlock(kpi, "LTV");
  const bVentas = getBlock(kpi, "Ventas");
  const bActivas = getBlock(kpi, "Suscripciones Activas");

  // ---- Rankings del mes elegido ----
  const rankIngresos = rankAtMonth(bIngresos, months, activeMonth);
  const rankPedidos = rankAtMonth(bPedidos, months, activeMonth);
  const rankLtv = rankAtMonth(bLtv, months, activeMonth);

  const totalIngresosMes = rankIngresos.reduce((s, r) => s + r.value, 0);
  const topIngresos = rankIngresos[0] ?? null;
  const topPedidos = rankPedidos[0] ?? null;
  const topLtv = rankLtv[0] ?? null;

  // ---- Cuadrante · ingresos del mes × crecimiento vs. mes anterior ----
  const crecimiento = useMemo(
    () => growthAtMonth(bIngresos, months, activeMonth),
    [bIngresos, months, activeMonth]
  );

  const puntos: QuadrantPoint[] = useMemo(
    () =>
      rankIngresos
        .map((r) => ({ label: r.label, x: r.value, y: crecimiento.get(r.label) }))
        .filter((p): p is QuadrantPoint => p.y !== null && p.y !== undefined),
    [rankIngresos, crecimiento]
  );

  // Misma clasificación que pinta el gráfico, para las fichas de debajo.
  const porCuadrante = useMemo(() => {
    const corte = medianaX(puntos);
    const map = new Map<CuadranteKey, QuadrantPoint[]>();
    for (const c of CUADRANTES) map.set(c.key, []);
    for (const p of puntos) map.get(clasificar(p, corte))!.push(p);
    for (const list of map.values()) list.sort((a, b) => b.x - a.x);
    return map;
  }, [puntos]);

  // ---- Mix de ingresos por producto en el tiempo ----
  // Con 10 productos no hay paleta que se distinga: se apilan los MIX_TOP_N
  // mayores del período y el resto se agrupa en "Otros" (gris, no compite como
  // categoría). Los top se eligen sobre la VENTANA visible, no sobre el mes,
  // para que la composición del gráfico no salte al mover el rango.
  const mixMonths = applyRange(months, mixRange);
  const { mixRows, mixKeys } = useMemo(() => {
    if (!bIngresos) return { mixRows: [], mixKeys: [] as string[] };
    const idx = mixMonths.map((m) => months.indexOf(m));
    const totales = bIngresos.series.map((s) => ({
      label: s.label,
      total: idx.reduce((acc, i) => acc + (s.values[i] ?? 0), 0),
    }));
    const top = totales
      .sort((a, b) => b.total - a.total)
      .slice(0, MIX_TOP_N)
      .map((t) => t.label);

    const rows = mixMonths.map((m, k) => {
      const i = idx[k];
      const row: Record<string, string | number | null> = { month: m };
      let otros = 0;
      for (const s of bIngresos.series) {
        const v = s.values[i] ?? 0;
        if (top.includes(s.label)) row[s.label] = s.values[i];
        else otros += v;
      }
      row["Otros"] = otros;
      return row;
    });
    return { mixRows: rows, mixKeys: [...top, "Otros"] };
  }, [bIngresos, mixMonths, months]);

  return (
    <>
      <PageHeader
        eyebrow="06 · Producto"
        title="Qué se vende, cuánto deja y qué está creciendo"
        description='Desglose por producto de la hoja "KPI Producto". Elegí el mes para las tarjetas y rankings; el mix tiene su propio rango.'
        right={
          <div className="flex flex-wrap items-center gap-3">
            {hasAnyData && (
              <MonthSelect
                months={months}
                value={activeMonth}
                onChange={setMonthChoice}
              />
            )}
            <LiveIndicator fetchedAt={fetchedAt} error={error} />
          </div>
        }
      />

      {loading && !hasAnyData && (
        <div className="text-sm text-drc-ink-soft">Cargando datos del Sheet…</div>
      )}
      {!loading && !hasAnyData && (
        <EmptyState label='Sin datos en la hoja "KPI Producto"' />
      )}

      {hasAnyData && (
        <div className="space-y-6">
          {/* --- Fila 1 · Los tres titulares del mes --- */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <KpiCard
              size="titular"
              label="Más vendido (ingresos)"
              value={topIngresos?.label ?? "—"}
              subValues={
                topIngresos
                  ? [
                      { label: "Ingresos", value: formatCurrency(topIngresos.value) },
                      {
                        label: "del mes",
                        value:
                          totalIngresosMes > 0
                            ? `${((topIngresos.value / totalIngresosMes) * 100).toFixed(0)}%`
                            : "—",
                      },
                    ]
                  : undefined
              }
            />
            <KpiCard
              size="titular"
              label="Más pedidos"
              value={topPedidos?.label ?? "—"}
              subValues={
                topPedidos
                  ? [{ label: "Pedidos", value: formatNumber(topPedidos.value) }]
                  : undefined
              }
            />
            <KpiCard
              size="titular"
              label="Mejor LTV"
              value={topLtv?.label ?? "—"}
              subValues={
                topLtv
                  ? [{ label: "LTV", value: formatCurrency(topLtv.value) }]
                  : undefined
              }
            />
          </div>

          {/* --- Fila 2 · Rankings del mes --- */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Panel
              title={`Ingresos por producto — ${activeMonth}`}
              description="Ranking del mes seleccionado, en €."
            >
              <RankedBars
                items={rankIngresos.map((r) => ({
                  label: r.label,
                  value: Math.round(r.value),
                }))}
                color={INGRESO.base}
              />
            </Panel>
            <Panel
              title={`Pedidos por producto — ${activeMonth}`}
              description="Ranking del mes seleccionado, en nº de pedidos."
            >
              <RankedBars items={rankPedidos} />
            </Panel>
          </div>

          {/* --- Fila 3 · LTV por producto --- */}
          <Panel
            title={`LTV por producto — ${activeMonth}`}
            description="La hoja SÍ trae LTV con granularidad de producto. Ojo: es un valor acumulado a la fecha, no del mes suelto, así que se mueve despacio."
          >
            {rankLtv.length === 0 ? (
              <EmptyState label="Sin LTV por producto en este mes" />
            ) : (
              <RankedBars
                items={rankLtv.map((r) => ({
                  label: r.label,
                  value: Math.round(r.value),
                }))}
                color={INGRESO.fuerte}
              />
            )}
          </Panel>

          {/* --- Fila 4 · Cuadrante de productos estrella --- */}
          <Panel
            title={`Productos estrella — ${activeMonth}`}
            description="Ingresos del mes (eje X) contra crecimiento vs. el mes anterior (eje Y). Los cortes son crecimiento 0 y la mediana de ingresos. Quedan fuera los productos sin base el mes anterior (no hay % que calcular)."
          >
            {puntos.length === 0 ? (
              <EmptyState label="No hay productos con dato en el mes y el anterior" />
            ) : (
              <>
                <QuadrantChart
                  data={puntos}
                  xLabel="Ingresos del mes"
                  yLabel="Crecimiento"
                  xFormatter={(v) => formatCurrency(v)}
                  yFormatter={(v) => formatPercentPoints(v)}
                />
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {CUADRANTES.map((c) => {
                    const items = porCuadrante.get(c.key) ?? [];
                    return (
                      <div key={c.key}>
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ background: c.color }}
                            aria-hidden
                          />
                          <span className="text-xs font-semibold text-drc-ink">
                            {c.label}
                          </span>
                          <span className="text-[11px] text-drc-ink-soft">
                            {c.desc}
                          </span>
                        </div>
                        <ul className="mt-1.5 space-y-1">
                          {items.length === 0 && (
                            <li className="text-[11px] text-drc-ink-soft">—</li>
                          )}
                          {items.map((p) => (
                            <li
                              key={p.label}
                              className="text-[11px] leading-snug text-drc-ink"
                            >
                              {p.label}{" "}
                              <span className="tabular text-drc-ink-soft">
                                ({formatPercentPoints(p.y)})
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Panel>

          {/* --- Fila 5 · Mix de ingresos por producto en el tiempo --- */}
          <Panel
            title="Mix de ingresos por producto"
            description={`Composición mensual apilada. Se muestran los ${MIX_TOP_N} productos con más ingresos del período y el resto agrupado en "Otros".`}
            action={<RangeFilter value={mixRange} onChange={setMixRange} />}
          >
            <StackedBarChart
              data={mixRows}
              keys={mixKeys}
              colors={[
                INGRESO.fuerte,
                INGRESO.medio,
                INGRESO.suave,
                NEUTRO.gris,
              ]}
              valueFormatter={(v) => formatCurrency(v)}
            />
          </Panel>

          {/* --- Fila 6 · Qué más trae la hoja --- */}
          <Panel
            title="Qué más hay en la hoja"
            description='"KPI Producto" no es una tabla sino varias tablas apiladas. Esto es todo lo que el parser reconoce hoy; lo que todavía no se grafica está acá para decidir qué vale la pena mostrar.'
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-drc-ink-soft border-b border-drc-line">
                    <th className="py-2 pr-4 font-medium">Bloque</th>
                    <th className="py-2 pr-4 font-medium">Desglose</th>
                    <th className="py-2 pr-4 font-medium">Series</th>
                    <th className="py-2 font-medium">Total del mes</th>
                  </tr>
                </thead>
                <tbody>
                  {kpi.blocks.map((b, i) => {
                    const mi = months.indexOf(activeMonth);
                    const total = mi >= 0 ? b.totals[mi] : null;
                    return (
                      <tr key={`${b.name}-${i}`} className="border-b border-drc-line/60">
                        <td className="py-2 pr-4 text-drc-ink">
                          {b.name}
                          {b.parent && (
                            <span className="text-drc-ink-soft">
                              {" "}
                              · desglosa {b.parent}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-drc-ink-soft">
                          {b.dimension === "horas" ? "por horas" : "por producto"}
                        </td>
                        <td className="py-2 pr-4 tabular">{b.series.length}</td>
                        <td className="py-2 tabular text-drc-ink-soft">
                          {total === null ? "—" : formatNumber(total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Suscripciones activas y Ventas quedan parseadas y disponibles pero
              todavía sin visualización propia: se listan arriba para decidirlo. */}
          {(bVentas === null || bActivas === null) && (
            <EmptyState label="Faltan bloques esperados en la hoja (Ventas / Suscripciones Activas)" />
          )}
        </div>
      )}
    </>
  );
}
