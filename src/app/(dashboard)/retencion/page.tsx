"use client";

import { useMemo, useState } from "react";
import { useLiveData } from "@/hooks/useLiveData";
import { PageHeader } from "@/components/ui/PageHeader";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { MonthSelect } from "@/components/ui/MonthSelect";
import { KpiCard } from "@/components/ui/KpiCard";
import { Panel } from "@/components/ui/Panel";
import { ComposedBarLineChart } from "@/components/ui/ComposedBarLineChart";
import { ComposedBarAreaChart } from "@/components/ui/ComposedBarAreaChart";
import { MultiTrendChart } from "@/components/ui/MultiTrendChart";
import { CohortHeatmap } from "@/components/ui/CohortHeatmap";
import { RankedBars } from "@/components/ui/RankedBars";
import { RangeFilter, applyRange } from "@/components/ui/RangeFilter";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getValueAtMonth,
  getMoMAtMonth,
  getMoMAbsAtMonth,
  getDeltaAtMonth,
  getLtvCacAtMonth,
  getAlertaOperativa,
  monthLabelToIndex,
  LTV_CAC_OBJETIVO,
  LTV_CAC_SANO,
  formatCurrency,
  formatNumber,
  formatNumberDelta,
  formatPercent,
  formatPercentPoints,
} from "@/lib/kpiHelpers";
import { CAT, GASTO, INGRESO, NEUTRO } from "@/lib/chartColors";
import type {
  CancelacionRow,
  CohortData,
  CuponRow,
  DBKpiData,
  MetricValue,
} from "@/types/kpi";

/** Referencia estable para cuando /api/cohortes todavía no respondió. */
const EMPTY_COHORT_DATA: CohortData = { cohorts: [], monthsOfLife: [] };

/**
 * El ratio LTV:CAC con DOS decimales, no con el único de formatNumber: los
 * cortes de la alerta caen en números redondos (2x, 3x, 4x) y a un decimal un
 * 2,95 se dibuja como "3x" al lado de un chip MEJORABLE — que es correcto pero
 * se lee como una contradicción con el "mínimo sano: 3x" del pie.
 */
function formatRatio(value: MetricValue): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function RetencionPage() {
  const { data, loading, error, fetchedAt } = useLiveData<DBKpiData>(
    "/api/kpi",
    60_000
  );
  const cohortes = useLiveData<CohortData>("/api/cohortes?tipo=clientes", 60_000);
  const cancelaciones = useLiveData<CancelacionRow[]>(
    "/api/relaciones?tipo=cancelaciones",
    60_000
  );
  const cupones = useLiveData<CuponRow[]>("/api/relaciones?tipo=cupones", 60_000);

  const kpi = data ?? { months: [], keys: [], data: {} };
  const months = kpi.months;
  const hasAnyData = months.length > 0;

  // Desplegable de mes → controla SOLO las tarjetas (igual que Resumen/Ingresos).
  const [monthChoice, setMonthChoice] = useState<string>("");
  const activeMonth =
    monthChoice && months.includes(monthChoice)
      ? monthChoice
      : months[months.length - 1] ?? "";

  // Rangos independientes por gráfico.
  const [movRange, setMovRange] = useState(0);
  const [permRange, setPermRange] = useState(0);
  const [churnRange, setChurnRange] = useState(0);
  const [arpcLtvRange, setArpcLtvRange] = useState(0);

  // Rango de cohortes del heatmap (por etiqueta de cohorte; "" = extremo).
  const [cohortFrom, setCohortFrom] = useState<string>("");
  const [cohortTo, setCohortTo] = useState<string>("");
  // false = clientes (absoluto) · true = % sobre el tamaño inicial de la cohorte.
  const [pctView, setPctView] = useState(false);

  // ---- Tarjetas (mes seleccionado) ----
  const suscActivas = getValueAtMonth(kpi, "suscripciones_activas", activeMonth);
  const suscPerdidasRaw = getValueAtMonth(kpi, "suscripciones_perdidas", activeMonth);
  // suscripciones_perdidas viene en negativo (convención de "pérdida"): magnitud.
  const suscPerdidas = suscPerdidasRaw === null ? null : Math.abs(suscPerdidasRaw);

  // permanencia puede venir como error de fórmula ("#VALUE!") en el Sheet; el
  // parseo numérico ya lo convierte a null, así que aquí sólo lo tratamos como
  // "sin dato" sin lógica extra.
  const permanencia = getValueAtMonth(kpi, "permanencia", activeMonth);

  const ltvCac = getLtvCacAtMonth(kpi, activeMonth);

  // ---- Gráfico C4 · clientes nuevos/recurrentes + retención ----
  const movRows = applyRange(months, movRange).map((month) => ({
    month,
    clientes_nuevos: kpi.data[month]?.["clientes_nuevos"] ?? null,
    clientes_recurrentes: kpi.data[month]?.["clientes_recurrentes"] ?? null,
    retention_rate: kpi.data[month]?.["retention_rate"] ?? null,
  }));

  // ---- Gráfico C5 · permanencia (misma nota de #VALUE! → null) ----
  const permRows = applyRange(months, permRange).map((month) => ({
    month,
    permanencia: kpi.data[month]?.["permanencia"] ?? null,
    permanencia_perdidos: kpi.data[month]?.["permanencia_perdidos"] ?? null,
  }));

  // ---- Gráfico C6 · churn (clientes y MRR, ambos como %) ----
  const churnRows = applyRange(months, churnRange).map((month) => ({
    month,
    clientes_churn: kpi.data[month]?.["clientes_churn"] ?? null,
    MRR_churn: kpi.data[month]?.["MRR_churn"] ?? null,
  }));

  // ---- Gráfico C7 · ARPC (barras) + LTV (área) ----
  const arpcLtvRows = applyRange(months, arpcLtvRange).map((month) => ({
    month,
    ARPC: kpi.data[month]?.["ARPC"] ?? null,
    LTV: kpi.data[month]?.["LTV"] ?? null,
  }));

  // ---- Motivos de cancelación (se deja tal cual) ----
  const motivos = useMemo(() => {
    const rows = cancelaciones.data ?? [];
    const counts = new Map<string, number>();
    rows.forEach((r) => {
      const key = r.motivo || "Sin especificar";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return Array.from(counts.entries()).map(([label, value]) => ({ label, value }));
  }, [cancelaciones.data]);

  const cuponRows = cupones.data ?? [];

  // ---- Heatmap C8 · rango de cohortes, vista de diferencia y toggle % ----
  // El fallback es una constante de módulo, no un {} literal: si no, cada render
  // sin datos crearía arrays nuevos y el useMemo de abajo no memorizaría nada.
  const cohortData = cohortes.data ?? EMPTY_COHORT_DATA;
  const cohortList = cohortData.cohorts;
  const monthsOfLife = cohortData.monthsOfLife;

  const cohortView = useMemo(() => {
    const vacio = {
      data: { cohorts: [], monthsOfLife: [] } as CohortData,
      totales: [] as MetricValue[],
      activos: [] as MetricValue[],
    };
    if (cohortList.length === 0) return vacio;

    let a = cohortFrom ? cohortList.findIndex((c) => c.cohort === cohortFrom) : 0;
    let b = cohortTo ? cohortList.findIndex((c) => c.cohort === cohortTo) : cohortList.length - 1;
    if (a < 0) a = 0;
    if (b < 0) b = cohortList.length - 1;
    if (a > b) [a, b] = [b, a];

    // Mes de vida que corresponde a HOY para cada cohorte = distancia en meses
    // hasta la cohorte más reciente de la tabla (que por construcción es el mes
    // en curso). Se calcula sobre la lista COMPLETA, no sobre el rango elegido:
    // recortar el rango no cambia en qué mes de vida está viviendo cada cohorte.
    //
    // Va por etiqueta y no por posición de fila porque la tabla dinámica omite
    // los grupos vacíos: si un mes no captó a nadie, su fila no existe y contar
    // filas desplazaría todas las cohortes anteriores un mes.
    const indices = cohortList.map((c) => monthLabelToIndex(c.cohort));
    const ultimoIdx = Math.max(
      ...indices.filter((i): i is number => i !== null),
      -Infinity
    );

    const seleccion = cohortList.slice(a, b + 1);
    const totales = seleccion.map((c) => c.values[0] ?? null);

    // Los que siguen activos hoy: el valor de la cohorte EN SU MES DE VIDA
    // ACTUAL. Celda vacía → 0 activos, no "sin dato": la tabla dinámica no
    // escribe los grupos de conteo cero, así que un hueco en el mes en curso
    // significa que no queda nadie. Si la etiqueta no se puede interpretar (no
    // debería pasar), se cae al último valor con dato, que es lo más cercano.
    const activos = seleccion.map((c, k) => {
      const idx = indices[a + k];
      if (idx === null || !Number.isFinite(ultimoIdx)) {
        for (let i = c.values.length - 1; i >= 0; i--) {
          if (c.values[i] !== null) return c.values[i];
        }
        return null;
      }
      const mesVida = ultimoIdx - idx;
      if (mesVida < 0 || mesVida >= c.values.length) return null;
      return c.values[mesVida] ?? 0;
    });

    // El grid arranca en m1: el m0 ya no es una celda del heatmap sino la
    // columna "Entraron" de la izquierda, y en vista de diferencia siempre
    // quedaba vacío por ser la base.
    const cohorts = seleccion.map((c, k) => {
      const total = totales[k];
      const base = total === null || total === 0 ? null : total;
      return {
        cohort: c.cohort,
        values: c.values.slice(1).map((v, i) => {
          // Diferencia respecto al mes de vida anterior: cuántos se pierden (o
          // se recuperan) en ESE mes concreto, no acumulado desde el origen.
          const prev = c.values[i];
          if (v === null || prev === null) return null;
          const diff = v - prev;
          // En % la diferencia se mide siempre contra el TAMAÑO INICIAL de la
          // cohorte, no contra los que quedaban vivos el mes anterior. Así toda
          // la fila habla de la misma base y las bajas mensuales más el % que
          // sigue activo suman el 100% de la cohorte.
          if (!pctView) return diff;
          return base === null ? null : (diff / base) * 100;
        }),
      };
    });

    return {
      data: { cohorts, monthsOfLife: monthsOfLife.slice(1) } as CohortData,
      totales,
      activos,
    };
  }, [cohortList, monthsOfLife, cohortFrom, cohortTo, pctView]);

  return (
    <>
      <PageHeader
        eyebrow="04 · Retención"
        title="Quién se queda, quién se va, y por qué"
        description="Elegí el mes para las tarjetas; cada gráfico tiene su propio rango temporal."
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
      {!loading && !hasAnyData && <EmptyState label="Sin datos de retención" />}

      {hasAnyData && (
        <div className="space-y-6">
          {/* --- Fila 1 · Suscripciones activas (T) + nuevas / perdidas --- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4">
            <KpiCard
              className="sm:col-span-2 lg:col-span-3"
              size="titular"
              label="Suscripciones activas"
              value={formatNumber(suscActivas)}
              mom={getMoMAtMonth(kpi, "suscripciones_activas", activeMonth)}
              subValues={[
                {
                  label: "vs. mes anterior",
                  value: formatNumberDelta(
                    getDeltaAtMonth(kpi, "suscripciones_activas", activeMonth)
                  ),
                },
              ]}
            />
            <KpiCard
              className="lg:col-span-2"
              label="Nuevas"
              value={formatNumber(
                getValueAtMonth(kpi, "suscripciones_nuevas", activeMonth)
              )}
              mom={getMoMAtMonth(kpi, "suscripciones_nuevas", activeMonth)}
            />
            <KpiCard
              className="lg:col-span-2"
              label="Perdidas"
              value={formatNumber(suscPerdidas)}
              mom={getMoMAbsAtMonth(kpi, "suscripciones_perdidas", activeMonth)}
              momIsGoodWhenPositive={false}
            />
          </div>

          {/* --- Fila 2 · ARPC · permanencia · LTV · churn 3M · LTV:CAC --- */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KpiCard
              label="ARPC"
              value={formatCurrency(getValueAtMonth(kpi, "ARPC", activeMonth))}
              mom={getMoMAtMonth(kpi, "ARPC", activeMonth)}
            />
            <KpiCard
              label="Permanencia media"
              value={permanencia !== null ? `${formatNumber(permanencia)} m` : "—"}
              mom={getMoMAtMonth(kpi, "permanencia", activeMonth)}
            />
            <KpiCard
              label="LTV"
              value={formatCurrency(getValueAtMonth(kpi, "LTV", activeMonth))}
              mom={getMoMAtMonth(kpi, "LTV", activeMonth)}
            />
            {/* churn_3m = clientes_churn_3m (tasa 0-1 → %). */}
            <KpiCard
              label="Churn 3M"
              value={formatPercent(getValueAtMonth(kpi, "clientes_churn_3m", activeMonth))}
              mom={getMoMAtMonth(kpi, "clientes_churn_3m", activeMonth)}
              momIsGoodWhenPositive={false}
            />
            {/* LTV:CAC calculado (LTV/CAC), no la columna cruda que da 0.
                Alerta por umbrales en vez del semáforo local: < 2x peligro ·
                2-3x mejorable · 3-4x bien · ≥ 4x en objetivo. Es la única
                tarjeta de LTV:CAC que queda en el dashboard (la de Situación
                financiera se sacó al vaciar su fila superior). */}
            <KpiCard
              label="LTV : CAC"
              value={ltvCac !== null ? `${formatRatio(ltvCac)}x` : "—"}
              alerta={getAlertaOperativa("LTV_CAC", ltvCac)}
              hint={
                <>
                  <div>Objetivo: ≥ {LTV_CAC_OBJETIVO}x</div>
                  <div>Mínimo sano: {LTV_CAC_SANO}x</div>
                </>
              }
            />
          </div>

          {/* --- C4 · Clientes nuevos/recurrentes + retención --- */}
          <Panel
            title="Clientes nuevos y recurrentes con retención"
            description="Clientes nuevos + recurrentes (apilados, eje izq.) y la tasa de retención como línea (%) sobre eje derecho."
            action={<RangeFilter value={movRange} onChange={setMovRange} />}
          >
            <ComposedBarLineChart
              data={movRows}
              stacked
              bars={[
                { key: "clientes_recurrentes", label: "Recurrentes", color: CAT.verdeClaro },
                { key: "clientes_nuevos", label: "Nuevos", color: CAT.oro },
              ]}
              line={{ key: "retention_rate", label: "Retención", color: NEUTRO.ink }}
              barFormatter={(v) => formatNumber(v)}
              lineFormatter={(v) => formatPercent(v)}
            />
          </Panel>

          {/* --- C5 · Permanencia --- */}
          <Panel
            title="Permanencia en el tiempo"
            description="Permanencia media de la base activa y de los clientes perdidos (en meses)."
            action={<RangeFilter value={permRange} onChange={setPermRange} />}
          >
            <MultiTrendChart
              data={permRows}
              series={[
                /* Permanencia es una DURACIÓN, no una pérdida de dinero: va en
                   categorías (verde/oro) y deja el rojo para el churn de abajo. */
                { key: "permanencia", label: "Permanencia", color: CAT.verde },
                { key: "permanencia_perdidos", label: "Permanencia perdidos", color: CAT.oro },
              ]}
              valueFormatter={(v) => `${formatNumber(v)} m`}
            />
          </Panel>

          {/* --- C6 · Churn --- */}
          <Panel
            title="Churn de clientes y de MRR"
            description="Tasa de churn de clientes y de MRR, ambas en %."
            action={<RangeFilter value={churnRange} onChange={setChurnRange} />}
          >
            <MultiTrendChart
              data={churnRows}
              series={[
                { key: "clientes_churn", label: "Churn clientes", color: GASTO.base },
                { key: "MRR_churn", label: "Churn MRR", color: GASTO.fuerte },
              ]}
              valueFormatter={(v) => formatPercent(v)}
            />
          </Panel>

          {/* --- C7 · ARPC + LTV --- */}
          <Panel
            title="ARPC y LTV"
            description="Barras: ARPC mensual (eje izq., €). Área: LTV mensual (eje der., €)."
            action={<RangeFilter value={arpcLtvRange} onChange={setArpcLtvRange} />}
          >
            <ComposedBarAreaChart
              data={arpcLtvRows}
              bar={{ key: "ARPC", label: "ARPC", color: INGRESO.suave }}
              area={{ key: "LTV", label: "LTV", color: INGRESO.fuerte }}
              barFormatter={(v) => formatCurrency(v)}
              areaFormatter={(v) => formatCurrency(v)}
            />
          </Panel>

          {/* --- C8 · Heatmap de cohortes (rango + diferencia mes a mes) --- */}
          <Panel
            title="Cohortes de clientes — pérdida mes a mes"
            description={
              pctView
                ? 'Cada celda es la baja de ESE mes concreto (no acumulada) medida sobre el tamaño inicial de la cohorte: rojo = se fueron, verde = se recuperaron. Al compartir base toda la fila, las bajas se suman entre sí y con el "% activos hoy" hasta el 100% de la cohorte — salvo en las cohortes cuyos últimos meses el Sheet deja en blanco, donde esa última caída no tiene celda donde pintarse. "Entraron" se deja en clientes: es la base, no un porcentaje de sí misma.'
                : 'Cada celda muestra la DIFERENCIA de clientes respecto al mes de vida anterior (rojo = pérdida, verde = ganancia). A los lados, en gris: cuántos entraron en la cohorte y cuántos siguen activos hoy — este último leído en el mes de vida que le toca a cada cohorte, contando el hueco de la tabla dinámica como cero.'
            }
            action={
              cohortList.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <div className="inline-flex rounded-lg border border-drc-line bg-white p-0.5">
                    {[
                      { label: "Clientes", pct: false },
                      { label: "%", pct: true },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => setPctView(opt.pct)}
                        className={
                          "px-2.5 py-1 text-xs rounded-md tabular transition-colors " +
                          (pctView === opt.pct
                            ? "bg-drc-green-deep text-white"
                            : "text-drc-ink-soft hover:text-drc-ink")
                        }
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-drc-ink-soft">Cohortes:</span>
                  <select
                    value={cohortFrom}
                    onChange={(e) => setCohortFrom(e.target.value)}
                    className="rounded-lg border border-drc-line bg-white px-2 py-1 text-drc-ink"
                  >
                    <option value="">Primera</option>
                    {cohortList.map((c) => (
                      <option key={c.cohort} value={c.cohort}>
                        {c.cohort}
                      </option>
                    ))}
                  </select>
                  <span className="text-drc-ink-soft">→</span>
                  <select
                    value={cohortTo}
                    onChange={(e) => setCohortTo(e.target.value)}
                    className="rounded-lg border border-drc-line bg-white px-2 py-1 text-drc-ink"
                  >
                    <option value="">Última</option>
                    {cohortList.map((c) => (
                      <option key={c.cohort} value={c.cohort}>
                        {c.cohort}
                      </option>
                    ))}
                  </select>
                </div>
              ) : undefined
            }
          >
            <CohortHeatmap
              data={cohortView.data}
              variant="diff"
              /* El "%" ya lo pone valueFormatter: si además se pasara como
                 sufijo, el tooltip diría "-52,8%%". */
              valueSuffix=""
              valueFormatter={
                pctView
                  ? (v) => `${v > 0 ? "+" : ""}${formatPercentPoints(v)}`
                  : undefined
              }
              leading={{
                header: "Entraron",
                title: "Clientes que entraron en la cohorte (mes de vida 0)",
                cells: cohortView.totales.map((v) => formatNumber(v)),
              }}
              trailing={{
                header: pctView ? "% activos hoy" : "Activos hoy",
                title:
                  "Clientes de la cohorte que siguen activos en el mes en curso",
                cells: cohortView.activos.map((v, i) => {
                  if (v === null) return "—";
                  if (!pctView) return formatNumber(v);
                  const total = cohortView.totales[i];
                  return total === null || total === 0
                    ? "—"
                    : formatPercentPoints((v / total) * 100);
                }),
              }}
            />
          </Panel>

          {/* --- C10 · Motivos de cancelación + cupones --- */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="Motivos de cancelación" description="Conteo por motivo declarado">
              <RankedBars items={motivos} color={GASTO.base} />
            </Panel>
            <Panel
              title="Cupones de retención"
              description="Últimos cupones aplicados en el flujo anticancelaciones (datos crudos de la hoja Cupon)."
            >
              {cuponRows.length === 0 ? (
                <EmptyState label='Sin datos en la hoja "Cupon"' />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-drc-ink-soft border-b border-drc-line">
                        <th className="py-2 pr-4 font-medium">Fecha</th>
                        <th className="py-2 pr-4 font-medium">Cupón</th>
                        <th className="py-2 pr-4 font-medium">Suscripción</th>
                        <th className="py-2 font-medium">Impacto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cuponRows.slice(0, 10).map((row, i) => (
                        <tr key={i} className="border-b border-drc-line/60">
                          <td className="py-2 pr-4 tabular text-drc-ink-soft">
                            {row.fecha ?? "—"}
                          </td>
                          <td className="py-2 pr-4">{row.cupon || "—"}</td>
                          <td className="py-2 pr-4 tabular">{row.suscripcion || "—"}</td>
                          <td className="py-2">{row.impacto || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
