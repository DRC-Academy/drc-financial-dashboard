"use client";

import { useMemo, useState } from "react";
import { useLiveData } from "@/hooks/useLiveData";
import { PageHeader } from "@/components/ui/PageHeader";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { KpiCard } from "@/components/ui/KpiCard";
import { Panel } from "@/components/ui/Panel";
import { TrendChart } from "@/components/ui/TrendChart";
import { DualAxisChart } from "@/components/ui/DualAxisChart";
import { MultiTrendChart } from "@/components/ui/MultiTrendChart";
import { StackedBarChart } from "@/components/ui/StackedBarChart";
import { BarComparison } from "@/components/ui/BarComparison";
import { MonthSelect } from "@/components/ui/MonthSelect";
import { RangeFilter, applyRange } from "@/components/ui/RangeFilter";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  filterKpi,
  filterMonths,
  DEFAULT_FILTER,
  type DateFilter,
} from "@/lib/dateFilter";
import {
  getLatest,
  getMoM,
  getMoMAtMonth,
  getMoMAbsAtMonth,
  getSemaforo,
  getSeries,
  getValueAtMonth,
  getLtvCacLatest,
  getLtvCacMoM,
  formatCurrency,
  formatNumber,
  formatPercent,
} from "@/lib/kpiHelpers";
import type { DBKpiData, MetricValue } from "@/types/kpi";
import type { GastosData } from "@/lib/gastos";
import { CAT, GASTO, GASTO_CAT, INGRESO } from "@/lib/chartColors";

/**
 * DB_KPI guarda los COSTES en negativo (cash_out, CF_cogs, CF_OPEX, CF_personal,
 * CF_marketing, CF_G&A, burn_rate). Las tarjetas y los gráficos muestran su
 * MAGNITUD — igual que ya hace la página de Ingresos con stripe_fee y refunds —
 * para que las barras crezcan hacia arriba y los % salgan positivos.
 */
function abs(v: MetricValue): MetricValue {
  return v === null ? null : Math.abs(v);
}

/**
 * Claves del bloque de cashflow. Sirven para elegir el mes por defecto del
 * desplegable: el último mes del Sheet puede estar todavía sin cerrar el
 * cashflow (jul-26 lo está), y arrancar en un mes entero vacío no muestra nada.
 */
const CASHFLOW_KEYS = [
  "cash_in",
  "cash_out",
  "cash_balance",
  "CF_ingresos",
  "CF_EBITDA",
];

export default function FinancieraPage() {
  const { data, loading, error, fetchedAt } = useLiveData<DBKpiData>(
    "/api/kpi",
    60_000
  );
  const gastos = useLiveData<GastosData>("/api/gastos", 60_000);
  const [filter, setFilter] = useState<DateFilter>(DEFAULT_FILTER);

  // Memoizado para que el objeto vacío del fallback no sea uno nuevo en cada
  // render: es la dependencia de todos los useMemo de la página.
  const kpiAll = useMemo<DBKpiData>(
    () => data ?? { months: [], keys: [], data: {} },
    [data]
  );
  const hasAnyData = kpiAll.months.length > 0;

  const visibleMonths = useMemo(
    () => filterMonths(kpiAll.months, filter),
    [kpiAll, filter]
  );
  const kpi = useMemo(
    () => filterKpi(kpiAll, visibleMonths),
    [kpiAll, visibleMonths]
  );

  const arpc = getLatest(kpi, "ARPC");
  const ltv = getLatest(kpi, "LTV");
  const cac = getLatest(kpi, "CAC");
  const ltvCac = getLtvCacLatest(kpi);
  const nmEbitda = getLatest(kpi, "NM_ebitda");
  const ingresosAcumulados = getLatest(kpi, "ingresos_acumulados");
  const clientesAcumulados = getLatest(kpi, "clientes_acumulados");

  const cacObj = getLatest(kpi, "CAC_obj");
  const ltvObj = getLatest(kpi, "LTV_obj");

  const ingresosAcumSeries = getSeries(kpi, "ingresos_acumulados");
  const clientesAcumSeries = getSeries(kpi, "clientes_acumulados");

  const acumComparado = kpi.months.map((month) => ({
    month,
    left: kpi.data[month]?.["ingresos_acumulados"] ?? null,
    right: kpi.data[month]?.["clientes_acumulados"] ?? null,
  }));

  const gastosData = gastos.data;
  const gastosTotal = gastosData?.categorias.reduce((s, c) => s + c.monto, 0) ?? 0;
  const maxGasto = Math.max(...(gastosData?.categorias.map((c) => c.monto) ?? [1]), 1);

  // ==========================================================================
  // CASHFLOW STATEMENT
  //
  // Bloque independiente del DateRangeFilter de arriba (que sigue mandando
  // sobre las tarjetas de unit economics y los gráficos de acumulados): sus
  // tarjetas las controla su propio desplegable de mes y cada gráfico su propio
  // RangeFilter, sobre TODOS los meses del Sheet (kpiAll).
  // ==========================================================================
  const monthsAll = kpiAll.months;

  const ultimoMesConCashflow = useMemo(() => {
    for (let i = monthsAll.length - 1; i >= 0; i--) {
      const rec = kpiAll.data[monthsAll[i]];
      if (CASHFLOW_KEYS.some((k) => rec?.[k] !== null && rec?.[k] !== undefined))
        return monthsAll[i];
    }
    return monthsAll[monthsAll.length - 1] ?? "";
  }, [kpiAll, monthsAll]);

  const [cfMonthChoice, setCfMonthChoice] = useState<string>("");
  const cfMonth =
    cfMonthChoice && monthsAll.includes(cfMonthChoice)
      ? cfMonthChoice
      : ultimoMesConCashflow;

  // Rangos independientes por gráfico.
  const [cashRange, setCashRange] = useState(0);
  const [balanceRange, setBalanceRange] = useState(0);
  const [cascadaRange, setCascadaRange] = useState(0);
  const [desgloseRange, setDesgloseRange] = useState(0);

  const cashIn = getValueAtMonth(kpiAll, "cash_in", cfMonth);
  const cashOut = abs(getValueAtMonth(kpiAll, "cash_out", cfMonth));
  const cashBalance = getValueAtMonth(kpiAll, "cash_balance", cfMonth);
  const burnRate = abs(getValueAtMonth(kpiAll, "burn_rate", cfMonth));

  /**
   * "runway" NO es una columna de DB_KPI (verificado sobre las 111 cabeceras):
   * se deriva como los meses de caja que aguanta el ritmo de quema actual,
   * cash_balance / |burn_rate|. burn_rate sólo trae valor en los meses de EBITDA
   * negativo; en los meses en que la empresa no quema caja no hay runway que
   * calcular y la tarjeta queda en "—", que es la lectura correcta.
   */
  const runway =
    cashBalance !== null && burnRate !== null && burnRate !== 0
      ? cashBalance / burnRate
      : null;

  const cfOpex = abs(getValueAtMonth(kpiAll, "CF_OPEX", cfMonth));
  const cfCogs = abs(getValueAtMonth(kpiAll, "CF_cogs", cfMonth));
  const ingresosNetosMes = getValueAtMonth(kpiAll, "ingresos_netos", cfMonth);

  /** % de una partida sobre los ingresos netos del mes. No existe como columna. */
  const pctSobreIngresos = (v: MetricValue): MetricValue =>
    v === null || ingresosNetosMes === null || ingresosNetosMes === 0
      ? null
      : v / ingresosNetosMes;

  const cashRows = applyRange(monthsAll, cashRange).map((month) => ({
    month,
    cash_in: kpiAll.data[month]?.["cash_in"] ?? null,
    cash_out: abs(kpiAll.data[month]?.["cash_out"] ?? null),
  }));

  const balanceRows = applyRange(monthsAll, balanceRange).map((month) => ({
    month,
    cash_balance: kpiAll.data[month]?.["cash_balance"] ?? null,
  }));

  const cascadaRows = applyRange(monthsAll, cascadaRange).map((month) => ({
    month,
    CF_ingresos: kpiAll.data[month]?.["CF_ingresos"] ?? null,
    CF_margenbruto: kpiAll.data[month]?.["CF_margenbruto"] ?? null,
    // El EBITDA sí puede ser negativo (jun-26 lo es) y se grafica tal cual.
    CF_EBITDA: kpiAll.data[month]?.["CF_EBITDA"] ?? null,
  }));

  // "CF_G&A" lleva el & literal en la cabecera del Sheet, así que la clave del
  // objeto va entrecomillada y se lee con record["CF_G&A"], no con dot notation.
  const desgloseRows = applyRange(monthsAll, desgloseRange).map((month) => ({
    month,
    CF_cogs: abs(kpiAll.data[month]?.["CF_cogs"] ?? null),
    CF_personal: abs(kpiAll.data[month]?.["CF_personal"] ?? null),
    CF_marketing: abs(kpiAll.data[month]?.["CF_marketing"] ?? null),
    "CF_G&A": abs(kpiAll.data[month]?.["CF_G&A"] ?? null),
  }));

  /**
   * PROFESORES — sin dato en el Sheet.
   * Ni "num_profes" ni "gasto_profes" existen en DB_KPI (111 columnas revisadas)
   * ni en ninguna otra pestaña. La hoja "Profesores" es un listado de ALUMNOS
   * con el profe asignado a cada uno: no trae el nº de profesores activos ni
   * ningún importe pagado a profesores. Las tarjetas se dejan montadas y en "—"
   * hasta que el dato exista; conectar un software externo de gestión de
   * profesores queda fuera del alcance del proyecto.
   */
  const numProfes: MetricValue = null;
  const costeMedioProfe: MetricValue = null;

  return (
    <>
      <PageHeader
        eyebrow="05 · Situación financiera"
        title="La foto financiera completa"
        description="Unit economics, acumulados, cashflow statement y estructura de gastos. El filtro de rango afecta a las tarjetas y gráficos de unit economics; el cashflow tiene sus propios controles."
        right={<LiveIndicator fetchedAt={fetchedAt} error={error} />}
        filter={
          hasAnyData ? (
            <DateRangeFilter
              months={kpiAll.months}
              filter={filter}
              onChange={setFilter}
            />
          ) : undefined
        }
      />

      {loading && !hasAnyData && (
        <div className="text-sm text-drc-ink-soft">Cargando datos del Sheet…</div>
      )}
      {!loading && !hasAnyData && <EmptyState label="Sin datos financieros" />}

      {hasAnyData && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="ARPC" value={formatCurrency(arpc)} mom={getMoM(kpi, "ARPC")} />
            <KpiCard
              label="LTV"
              value={formatCurrency(ltv)}
              mom={getMoM(kpi, "LTV")}
              semaforo={getSemaforo(ltv, ltvObj, false)}
            />
            <KpiCard
              label="CAC"
              value={formatCurrency(cac)}
              mom={getMoM(kpi, "CAC")}
              momIsGoodWhenPositive={false}
              semaforo={getSemaforo(cac, cacObj, true)}
            />
            <KpiCard
              label="LTV : CAC"
              value={ltvCac !== null ? `${formatNumber(ltvCac)}x` : "—"}
              mom={getLtvCacMoM(kpi)}
            />
            <KpiCard
              label="Margen neto (EBITDA)"
              value={nmEbitda !== null ? `${formatNumber(nmEbitda)}%` : "—"}
              mom={getMoM(kpi, "NM_ebitda")}
            />
            <KpiCard label="Ingresos acumulados" value={formatCurrency(ingresosAcumulados)} />
            <KpiCard label="Clientes acumulados" value={formatNumber(clientesAcumulados)} />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="Ingresos acumulados">
              <TrendChart
                data={ingresosAcumSeries}
                color={INGRESO.base}
                valueFormatter={(v) => formatCurrency(v)}
              />
            </Panel>
            <Panel title="Clientes acumulados">
              <TrendChart data={clientesAcumSeries} color={CAT.verde} />
            </Panel>
          </div>

          <Panel
            title="Ingresos vs. clientes acumulados"
            description="Relación entre el crecimiento de la base de clientes y los ingresos (ejes duales)."
          >
            <DualAxisChart
              data={acumComparado}
              left={{
                label: "Ingresos acumulados",
                color: INGRESO.base,
                valueFormatter: (v) => formatCurrency(v),
              }}
              right={{
                label: "Clientes acumulados",
                color: CAT.verde,
                valueFormatter: (v) => formatNumber(v),
              }}
            />
          </Panel>

          {/* ================= CASHFLOW STATEMENT ================= */}
          <section className="pt-2">
            <div className="flex flex-wrap items-end justify-between gap-3 border-t border-drc-line pt-6 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-drc-ink">
                  Cashflow statement
                </h3>
                <p className="text-xs text-drc-ink-soft mt-0.5 max-w-xl">
                  Caja y cuenta de resultados del Sheet. Estas tarjetas las
                  controla el desplegable de mes de aquí al lado (no el filtro de
                  rango de arriba), y cada gráfico lleva su propio rango.
                </p>
              </div>
              <MonthSelect
                months={monthsAll}
                value={cfMonth}
                onChange={setCfMonthChoice}
              />
            </div>

            <div className="space-y-6">
              {/* --- Caja: entradas, salidas, saldo, quema y pista --- */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <KpiCard
                  label="Cash in"
                  value={formatCurrency(cashIn)}
                  mom={getMoMAtMonth(kpiAll, "cash_in", cfMonth)}
                />
                <KpiCard
                  label="Cash out"
                  value={formatCurrency(cashOut)}
                  mom={getMoMAbsAtMonth(kpiAll, "cash_out", cfMonth)}
                  momIsGoodWhenPositive={false}
                />
                <KpiCard
                  label="Cash balance"
                  value={formatCurrency(cashBalance)}
                  mom={getMoMAtMonth(kpiAll, "cash_balance", cfMonth)}
                />
                <KpiCard
                  label="Burn rate"
                  value={formatCurrency(burnRate)}
                  mom={getMoMAbsAtMonth(kpiAll, "burn_rate", cfMonth)}
                  momIsGoodWhenPositive={false}
                  hint="Sólo hay quema de caja en los meses de EBITDA negativo."
                />
                <KpiCard
                  label="Runway"
                  value={runway !== null ? `${formatNumber(runway)} meses` : "—"}
                  hint="Derivado: cash balance ÷ burn rate. Sin quema, no hay runway."
                />
              </div>

              {/* --- OPEX y COGS, cada uno con su peso sobre ingresos netos --- */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <KpiCard
                  label="OPEX"
                  value={formatCurrency(cfOpex)}
                  mom={getMoMAbsAtMonth(kpiAll, "CF_OPEX", cfMonth)}
                  momIsGoodWhenPositive={false}
                  subValues={[
                    {
                      label: "% s/ ingresos netos",
                      value: formatPercent(pctSobreIngresos(cfOpex)),
                    },
                  ]}
                />
                <KpiCard
                  label="COGS"
                  value={formatCurrency(cfCogs)}
                  mom={getMoMAbsAtMonth(kpiAll, "CF_cogs", cfMonth)}
                  momIsGoodWhenPositive={false}
                  subValues={[
                    {
                      label: "% s/ ingresos netos",
                      value: formatPercent(pctSobreIngresos(cfCogs)),
                    },
                  ]}
                />
              </div>

              {/* --- Entradas vs. salidas de caja --- */}
              <Panel
                title="Entradas vs. salidas de caja"
                description="Cash in y cash out mes a mes. El cash out se grafica en magnitud (el Sheet lo guarda en negativo) para poder compararlo con el cash in en la misma escala."
                action={
                  <RangeFilter value={cashRange} onChange={setCashRange} />
                }
              >
                <MultiTrendChart
                  data={cashRows}
                  series={[
                    { key: "cash_in", label: "Cash in", color: INGRESO.base },
                    { key: "cash_out", label: "Cash out", color: GASTO.base },
                  ]}
                  valueFormatter={(v) => formatCurrency(v)}
                  yAxisWidth={72}
                />
              </Panel>

              {/* --- Saldo de caja --- */}
              <Panel
                title="Saldo de caja"
                description="Evolución mensual del cash balance."
                action={
                  <RangeFilter value={balanceRange} onChange={setBalanceRange} />
                }
              >
                <BarComparison
                  data={balanceRows}
                  series={[
                    {
                      key: "cash_balance",
                      label: "Cash balance",
                      color: INGRESO.base,
                    },
                  ]}
                  showLegend={false}
                  valueFormatter={(v) => formatCurrency(v)}
                  yAxisWidth={72}
                />
              </Panel>

              {/* --- Cascada ingresos → margen bruto → EBITDA --- */}
              <Panel
                title="De ingresos a EBITDA"
                description="Las tres paradas de la cascada en el tiempo: lo que entra, lo que queda después del coste directo (margen bruto) y lo que queda después del OPEX (EBITDA). La distancia vertical entre líneas es cada tramo de coste."
                action={
                  <RangeFilter value={cascadaRange} onChange={setCascadaRange} />
                }
              >
                <MultiTrendChart
                  data={cascadaRows}
                  series={[
                    {
                      key: "CF_ingresos",
                      label: "Ingresos",
                      color: INGRESO.fuerte,
                    },
                    {
                      key: "CF_margenbruto",
                      label: "Margen bruto",
                      color: INGRESO.medio,
                    },
                    { key: "CF_EBITDA", label: "EBITDA", color: CAT.verde },
                  ]}
                  valueFormatter={(v) => formatCurrency(v)}
                  yAxisWidth={72}
                />
              </Panel>

              {/* --- Desglose de gastos apilado --- */}
              <Panel
                title="Desglose de gastos"
                description="Las cuatro partidas de coste apiladas mes a mes, en magnitud: coste directo (COGS), personal, marketing y generales y administrativos (G&A)."
                action={
                  <RangeFilter value={desgloseRange} onChange={setDesgloseRange} />
                }
              >
                <StackedBarChart
                  data={desgloseRows}
                  keys={["CF_cogs", "CF_personal", "CF_marketing", "CF_G&A"]}
                  colors={[
                    GASTO_CAT.cogs,
                    GASTO_CAT.personal,
                    GASTO_CAT.marketing,
                    GASTO_CAT.generales,
                  ]}
                  labels={["COGS", "Personal", "Marketing", "G&A"]}
                  valueFormatter={(v) => formatCurrency(v)}
                  yAxisWidth={72}
                />
              </Panel>

              {/* --- Profesores: sin dato en el Sheet --- */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <KpiCard
                  label="Profesores activos"
                  value={formatNumber(numProfes)}
                  hint='Sin datos: el Sheet no expone el nº de profesores activos. La hoja "Profesores" lista alumnos y su profe asignado, no la plantilla.'
                />
                <KpiCard
                  label="Coste medio por profesor"
                  value={formatCurrency(costeMedioProfe)}
                  hint="Sin datos: no hay ninguna columna de gasto en profesores en el Sheet."
                />
              </div>
            </div>
          </section>

          <Panel
            title="Estructura de gastos"
            description={
              gastosData?.esPlaceholder
                ? "Módulo desacoplado y listo — placeholder hasta conectar la API interna de gastos."
                : undefined
            }
          >
            {!gastosData || gastosData.categorias.length === 0 ? (
              <EmptyState label="Sin datos de gastos" />
            ) : (
              <>
                {gastosData.esPlaceholder && (
                  <div className="mb-4 rounded-lg border border-drc-yellow/40 bg-drc-yellow/10 px-3 py-2 text-xs text-drc-ink">
                    Estos valores son un placeholder (todos en 0€). Cuando el
                    software propio de gestión exponga gastos operativos, este
                    panel se conecta reemplazando <code className="tabular">readGastos()</code>{" "}
                    en <code className="tabular">src/lib/gastos.ts</code> — la UI no cambia.
                  </div>
                )}
                <div className="space-y-2.5">
                  {gastosData.categorias.map((cat) => (
                    <div key={cat.nombre}>
                      <div className="flex items-baseline justify-between text-xs mb-1">
                        <span className="text-drc-ink">{cat.nombre}</span>
                        <span className="tabular text-drc-ink-soft">
                          {formatCurrency(cat.monto)}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-drc-bg overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(cat.monto / maxGasto) * 100}%`,
                            background: GASTO.base,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 mt-2 border-t border-drc-line flex justify-between text-sm font-medium">
                    <span>Total</span>
                    <span className="tabular">{formatCurrency(gastosTotal)}</span>
                  </div>
                </div>
              </>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
