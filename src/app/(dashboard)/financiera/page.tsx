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
import { MonthRangeSelect } from "@/components/ui/MonthRangeSelect";
import { PeriodoToggle } from "@/components/ui/PeriodoToggle";
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
  getMoMAtMonth,
  getMoMAbsAtMonth,
  getAverageAtMonth,
  getDeltaAtMonth,
  getSeries,
  getValueAtMonth,
  getAlertaEbitda,
  getQuarterMonths,
  getPrevQuarterMonths,
  getRatioAtMonths,
  getSumAtMonths,
  monthToQuarterLabel,
  EBITDA_OBJETIVO_TEXTO,
  formatCurrency,
  formatNumber,
  formatPercent,
  formatPointsDelta,
  type PeriodoMargen,
} from "@/lib/kpiHelpers";
import type { DBKpiData, MetricValue } from "@/types/kpi";
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

/**
 * Mes de arranque por defecto del rango de ingresos acumulados: enero del año
 * del ÚLTIMO mes disponible ("lo que va del año"). Si ese enero no está en la
 * serie, el primer mes que sí esté de ese año; y si el dataset no llega a
 * cubrir el año, el primer mes de todos. El año sale del dato y no del reloj a
 * propósito: si el Sheet se queda atrás, el rango sigue mostrando un período
 * con datos en vez de uno vacío.
 */
function inicioDelAnio(months: string[]): string {
  const ultimo = months[months.length - 1] ?? "";
  if (!ultimo) return "";
  const anio = ultimo.slice(-2);
  const delAnio = months.filter((m) => m.endsWith(`-${anio}`));
  return delAnio.find((m) => m.startsWith("ene-")) ?? delAnio[0] ?? months[0];
}

export default function FinancieraPage() {
  const { data, loading, error, fetchedAt } = useLiveData<DBKpiData>(
    "/api/kpi",
    60_000
  );
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

  const clientesAcumulados = getLatest(kpi, "clientes_acumulados");

  const ingresosAcumSeries = getSeries(kpi, "ingresos_acumulados");
  const clientesAcumSeries = getSeries(kpi, "clientes_acumulados");

  const acumComparado = kpi.months.map((month) => ({
    month,
    left: kpi.data[month]?.["ingresos_acumulados"] ?? null,
    right: kpi.data[month]?.["clientes_acumulados"] ?? null,
  }));

  // Todos los meses del Sheet, sin el filtro de rango de la cabecera: los usan
  // el bloque de cashflow y la tarjeta de ingresos acumulados, que llevan sus
  // propios controles.
  const monthsAll = kpiAll.months;

  // ==========================================================================
  // INGRESOS ACUMULADOS — tarjeta con rango de fechas a medida.
  //
  // Vivía en la página de Ingresos y se mudó acá, junto a clientes acumulados:
  // los dos acumulados son la misma lectura (cuánto lleva sumado el negocio) y
  // ahora se leen de un vistazo. Mantiene su propio rango, independiente del
  // filtro de la cabecera y del desplegable de mes del cashflow.
  // ==========================================================================
  const [acumFromChoice, setAcumFromChoice] = useState<string>("");
  const [acumToChoice, setAcumToChoice] = useState<string>("");

  const acumInicio = monthsAll.includes(acumFromChoice)
    ? acumFromChoice
    : inicioDelAnio(monthsAll);
  const acumFin = monthsAll.includes(acumToChoice)
    ? acumToChoice
    : monthsAll[monthsAll.length - 1] ?? "";

  // ingresos_acumulados es un ACUMULADO CORRIDO desde el origen (verificado
  // contra el Sheet: es estrictamente creciente y cada salto mensual coincide al
  // céntimo con ingresos_B2C_netos de ese mes — ojo, con el B2C neto, NO con
  // ingresos_netos, que además incluye B2B y Oritalk). Siendo corrido, lo
  // acumulado DENTRO del rango es la resta de los dos extremos:
  //   acumulado(fin) − acumulado(mes anterior al inicio).
  const acumAlFin = getValueAtMonth(kpiAll, "ingresos_acumulados", acumFin);
  const acumBaseMonth = monthsAll[monthsAll.indexOf(acumInicio) - 1] ?? "";
  const acumBase = acumBaseMonth
    ? getValueAtMonth(kpiAll, "ingresos_acumulados", acumBaseMonth)
    : 0;
  const acumEnPeriodo = acumAlFin === null ? null : acumAlFin - (acumBase ?? 0);

  // Suma de ingresos_netos del mismo rango. NO tiene por qué coincidir con el
  // acumulado de arriba y no es un error: el acumulado del Sheet sólo suma el
  // B2C neto, así que la diferencia entre ambas cifras es exactamente el B2B y
  // el Oritalk del período.
  const netosEnPeriodo = getSumAtMonths(
    kpiAll,
    "ingresos_netos",
    monthsAll.slice(
      monthsAll.indexOf(acumInicio),
      monthsAll.indexOf(acumFin) + 1
    )
  );

  // ==========================================================================
  // CASHFLOW STATEMENT
  //
  // Bloque independiente del DateRangeFilter de arriba (que sigue mandando
  // sobre las tarjetas de acumulados y sus gráficos): sus tarjetas las controla
  // su propio desplegable de mes y cada gráfico su propio RangeFilter, sobre
  // TODOS los meses del Sheet (kpiAll).
  // ==========================================================================

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

  // ==========================================================================
  // COSTES Y MÁRGENES — mensual o trimestral
  //
  // El desplegable de mes sigue eligiendo el período; este toggle decide si las
  // cuatro tarjetas (COGS, margen bruto, OPEX, EBITDA) leen ese mes suelto o el
  // TRIMESTRE NATURAL que lo contiene. Se aplica al bloque entero y no sólo al
  // margen bruto a propósito: media fila en mensual y media en trimestral no se
  // puede leer.
  // ==========================================================================
  const [periodo, setPeriodo] = useState<PeriodoMargen>("mensual");
  const trimestral = periodo === "trimestral";

  // Meses que entran en el período elegido, y los del período anterior (mes
  // anterior o trimestre anterior) para el comparativo.
  const periodoMonths = trimestral
    ? getQuarterMonths(monthsAll, cfMonth)
    : [cfMonth];
  const prevPeriodoMonths = trimestral
    ? getPrevQuarterMonths(monthsAll, cfMonth)
    : [];
  const periodoLabel = trimestral
    ? monthToQuarterLabel(cfMonth) ?? cfMonth
    : cfMonth;
  const periodoBadge = trimestral ? "QoQ" : "MoM";

  /**
   * MÁRGENES EN % — columnas "%margenbruto" y "%ebitda" de DB_KPI (nombres
   * exactos, sin guion bajo tras el %, verificados contra la cabecera). Vienen
   * en FRACCIÓN 0-1 igual que el resto de tasas del Sheet.
   *
   * No existe ninguna columna "NM_ebitda": el margen EBITDA en % es %ebitda y
   * punto. Y cuadra con la cascada — jun-26: CF_EBITDA −1.705 € sobre
   * CF_ingresos 25.234 € = −6,8% = %ebitda. Lo mismo el bruto: 14.851 / 25.234
   * = 58,9% = %margenbruto.
   *
   * En los meses en los que el cuadro de resultados todavía no se cargó, esas
   * columnas traen 0 (no vacío): sin este guardia por CF_ingresos, un mes sin
   * P&L mostraría "0%" y dispararía la alerta roja de EBITDA por falta de dato.
   *
   * La comparativa va en PUNTOS porcentuales (momDelta), no en % relativo: el
   * EBITDA cruza el cero (de +9,5% en may-26 a −6,8% en jun-26) y ahí el %
   * relativo deja de significar nada.
   */
  const margenMensual = (pctKey: string, month: string): MetricValue => {
    const ingresos = getValueAtMonth(kpiAll, "CF_ingresos", month);
    if (ingresos === null || ingresos === 0) return null;
    return getValueAtMonth(kpiAll, pctKey, month);
  };

  /**
   * El margen del período: la columna de % si es un mes suelto, o la media
   * PONDERADA por ingresos si es un trimestre — suma(CF_x) / suma(CF_ingresos),
   * no el promedio de los tres porcentajes mensuales (ver getRatioAtMonths).
   */
  const margenPeriodo = (pctKey: string, cfKey: string): MetricValue =>
    trimestral
      ? getRatioAtMonths(kpiAll, cfKey, "CF_ingresos", periodoMonths)
      : margenMensual(pctKey, cfMonth);

  const MESES_PROMEDIO = 5;
  const margenBruto = margenPeriodo("%margenbruto", "CF_margenbruto");
  const ebitdaPct = margenPeriodo("%ebitda", "CF_EBITDA");

  const margenBrutoPrev = trimestral
    ? getRatioAtMonths(kpiAll, "CF_margenbruto", "CF_ingresos", prevPeriodoMonths)
    : null;
  const ebitdaPctPrev = trimestral
    ? getRatioAtMonths(kpiAll, "CF_EBITDA", "CF_ingresos", prevPeriodoMonths)
    : null;

  /** Delta en fracción contra el período anterior (mes anterior o trimestre anterior). */
  const deltaMargen = (
    actual: MetricValue,
    previo: MetricValue,
    pctKey: string
  ): MetricValue => {
    if (!trimestral) return getDeltaAtMonth(kpiAll, pctKey, cfMonth);
    if (actual === null || previo === null) return null;
    return actual - previo;
  };

  const margenBrutoDelta = deltaMargen(
    margenBruto,
    margenBrutoPrev,
    "%margenbruto"
  );
  const ebitdaPctDelta = deltaMargen(ebitdaPct, ebitdaPctPrev, "%ebitda");

  const margenBrutoAvg = getAverageAtMonth(
    kpiAll,
    "%margenbruto",
    cfMonth,
    MESES_PROMEDIO
  );
  const ebitdaPctAvg = getAverageAtMonth(
    kpiAll,
    "%ebitda",
    cfMonth,
    MESES_PROMEDIO
  );

  /** Importe de una partida de coste en el período, siempre en magnitud. */
  const importePeriodo = (key: string): MetricValue =>
    abs(
      trimestral
        ? getSumAtMonths(kpiAll, key, periodoMonths)
        : getValueAtMonth(kpiAll, key, cfMonth)
    );

  /** Variación del importe contra el período anterior, sobre magnitudes. */
  const momImporte = (key: string): number | null => {
    if (!trimestral) return getMoMAbsAtMonth(kpiAll, key, cfMonth);
    const actual = getSumAtMonths(kpiAll, key, periodoMonths);
    const previo = getSumAtMonths(kpiAll, key, prevPeriodoMonths);
    if (actual === null || previo === null || previo === 0) return null;
    return ((Math.abs(actual) - Math.abs(previo)) / Math.abs(previo)) * 100;
  };

  const cfOpex = importePeriodo("CF_OPEX");
  const cfCogs = importePeriodo("CF_cogs");
  const ingresosNetosPeriodo = trimestral
    ? getSumAtMonths(kpiAll, "ingresos_netos", periodoMonths)
    : getValueAtMonth(kpiAll, "ingresos_netos", cfMonth);

  /** % de una partida sobre los ingresos netos del período. No existe como columna. */
  const pctSobreIngresos = (v: MetricValue): MetricValue =>
    v === null || ingresosNetosPeriodo === null || ingresosNetosPeriodo === 0
      ? null
      : v / ingresosNetosPeriodo;

  const cashRows = applyRange(monthsAll, cashRange).map((month) => ({
    month,
    cash_in: kpiAll.data[month]?.["cash_in"] ?? null,
    cash_out: abs(kpiAll.data[month]?.["cash_out"] ?? null),
  }));

  const balanceRows = applyRange(monthsAll, balanceRange).map((month) => ({
    month,
    cash_balance: kpiAll.data[month]?.["cash_balance"] ?? null,
  }));

  /**
   * MÁRGENES EN % — el gráfico dejó de mostrar las tres series en euros
   * (CF_ingresos / CF_margenbruto / CF_EBITDA) porque el nivel de ingresos ya
   * está en el resto de la página: lo que no se veía era qué PORCIÓN de cada
   * euro facturado sobrevive a cada tramo de coste. Ahora son dos series en %
   * sobre los mismos ingresos, así que se comparan entre sí y entre meses sin
   * que el tamaño del mes las mueva.
   *
   * Se leen de "%margenbruto" y "%ebitda" con el mismo guardia por CF_ingresos
   * que las tarjetas: en los meses sin cuadro de resultados esas columnas traen
   * 0 y dibujarían un 0% falso en vez de un hueco.
   */
  const margenesRows = applyRange(monthsAll, cascadaRange).map((month) => ({
    month,
    "%margenbruto": margenMensual("%margenbruto", month),
    // El EBITDA sí puede ser negativo (jun-26 lo es) y se grafica tal cual.
    "%ebitda": margenMensual("%ebitda", month),
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
        description="Acumulados y cashflow statement. El filtro de rango de acá arriba manda sobre clientes acumulados y sus gráficos; los ingresos acumulados llevan su propio rango de fechas y el cashflow su propio desplegable de mes."
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
          {/*
            LOS DOS ACUMULADOS, y nada más.

            La fila de unit economics que vivía acá (ARPC, LTV, CAC, LTV:CAC,
            ingresos acumulados) duplicaba tarjeta por tarjeta lo que ya está
            —con su mes elegible y sus alertas— en Resumen, Captación y
            Retención. Se quedó sólo clientes acumulados, que no está en ninguna
            otra página, y al lado se mudaron los ingresos acumulados desde la
            página de Ingresos: los dos acumulados son la misma lectura y ahora
            se leen juntos.

            La tarjeta de ingresos acumulados trae su propio rango de fechas y
            trabaja sobre TODOS los meses del Sheet; clientes acumulados sigue
            el filtro de rango de la cabecera.
          */}
          {/* items-start: sin estirar, la tarjeta de clientes acumulados (un
              único número) no se infla al alto de la de ingresos, que lleva
              selector, sub-valores y pie. */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            <KpiCard
              label="Clientes acumulados"
              value={formatNumber(clientesAcumulados)}
            />
            <KpiCard
              className="lg:col-span-2"
              label="Ingresos acumulados"
              value={formatCurrency(acumEnPeriodo)}
              action={
                <MonthRangeSelect
                  months={monthsAll}
                  from={acumInicio}
                  to={acumFin}
                  onChange={(f, t) => {
                    setAcumFromChoice(f);
                    setAcumToChoice(t);
                  }}
                />
              }
              subValues={[
                {
                  label: "Suma de ingresos netos",
                  value: formatCurrency(netosEnPeriodo),
                },
                {
                  label: `Acumulado total a ${acumFin}`,
                  value: formatCurrency(acumAlFin),
                },
              ]}
              hint={
                <>
                  <div>
                    {acumInicio === acumFin
                      ? `Sólo ${acumFin}`
                      : `Rango ${acumInicio} → ${acumFin}`}
                    {acumBaseMonth
                      ? ` · acumulado(${acumFin}) − acumulado(${acumBaseMonth})`
                      : " · sin mes previo: incluye lo acumulado antes del Sheet"}
                  </div>
                  <div>
                    La columna ingresos_acumulados del Sheet suma el B2C neto; la
                    diferencia con los ingresos netos es el B2B y el Oritalk.
                  </div>
                </>
              }
            />
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

              {/* --- Costes y márgenes: COGS → margen bruto, OPEX → EBITDA ---
                  Cada fila lee de izquierda a derecha como la cascada: el coste
                  primero, el margen que deja después. */}
              <div>
                <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
                  <div>
                    <h4 className="text-sm font-semibold text-drc-ink">
                      Costes y márgenes · {periodoLabel}
                    </h4>
                    <p className="text-xs text-drc-ink-soft mt-0.5">
                      {trimestral
                        ? `Trimestre natural del mes elegido${
                            periodoMonths.length > 0
                              ? ` (${periodoMonths.join(", ")})`
                              : ""
                          }. Los importes se suman y los márgenes se ponderan por ingresos.`
                        : "Mes elegido en el desplegable de arriba."}
                    </p>
                  </div>
                  <PeriodoToggle value={periodo} onChange={setPeriodo} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <KpiCard
                    label="COGS"
                    value={formatCurrency(cfCogs)}
                    mom={momImporte("CF_cogs")}
                    momIsGoodWhenPositive={false}
                    period={periodoBadge}
                    subValues={[
                      {
                        label: "% s/ ingresos netos",
                        value: formatPercent(pctSobreIngresos(cfCogs)),
                      },
                    ]}
                  />
                  <KpiCard
                    label="Margen bruto"
                    value={formatPercent(margenBruto)}
                    momDelta={
                      margenBrutoDelta === null ? null : margenBrutoDelta * 100
                    }
                    formatDelta={formatPointsDelta}
                    period={periodoBadge}
                    subValues={[
                      trimestral
                        ? {
                            label: "Trimestre anterior",
                            value: formatPercent(margenBrutoPrev),
                          }
                        : {
                            label: `Promedio ${MESES_PROMEDIO}M`,
                            value: formatPercent(margenBrutoAvg),
                          },
                    ]}
                    hint="Lo que queda de cada euro facturado después del coste directo (COGS)."
                  />
                  <KpiCard
                    label="OPEX"
                    value={formatCurrency(cfOpex)}
                    mom={momImporte("CF_OPEX")}
                    momIsGoodWhenPositive={false}
                    period={periodoBadge}
                    subValues={[
                      {
                        label: "% s/ ingresos netos",
                        value: formatPercent(pctSobreIngresos(cfOpex)),
                      },
                    ]}
                  />
                  {/* El objetivo estacional va como TEXTO FIJO: el proyecto no
                      tiene definido qué meses son temporada alta y cuáles media
                      para DRC Academy, así que la tarjeta no intenta deducirlo
                      del mes elegido. La alerta sale sólo de los umbrales
                      numéricos (ver getAlertaEbitda). */}
                  <KpiCard
                    label="EBITDA"
                    value={formatPercent(ebitdaPct)}
                    momDelta={
                      ebitdaPctDelta === null ? null : ebitdaPctDelta * 100
                    }
                    formatDelta={formatPointsDelta}
                    period={periodoBadge}
                    alerta={getAlertaEbitda(ebitdaPct, periodo)}
                    subValues={[
                      trimestral
                        ? {
                            label: "Trimestre anterior",
                            value: formatPercent(ebitdaPctPrev),
                          }
                        : {
                            label: `Promedio ${MESES_PROMEDIO}M`,
                            value: formatPercent(ebitdaPctAvg),
                          },
                    ]}
                    hint={
                      <>
                        <div>
                          Lo que queda de cada euro facturado después del COGS y
                          del OPEX.
                        </div>
                        <div>
                          {trimestral
                            ? "Umbrales trimestrales: < 15% peligro · 15-22% mejorable · > 22% bien."
                            : `${EBITDA_OBJETIVO_TEXTO} · < 10% peligro · 10-18% mejorable · > 18% bien.`}
                        </div>
                      </>
                    }
                  />
                </div>
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

              {/* --- Márgenes en % sobre ingresos --- */}
              <Panel
                title="Margen bruto y EBITDA sobre ingresos"
                description="Las dos paradas de la cascada en PORCENTAJE de los ingresos del mes, no en euros: qué porción de cada euro facturado sobrevive al coste directo (margen bruto) y qué porción sobrevive además al OPEX (EBITDA). La distancia vertical entre las dos líneas es el peso del OPEX. Los meses sin cuadro de resultados cargado quedan sin punto."
                action={
                  <RangeFilter value={cascadaRange} onChange={setCascadaRange} />
                }
              >
                <MultiTrendChart
                  data={margenesRows}
                  legendInSeriesOrder
                  series={[
                    {
                      key: "%margenbruto",
                      label: "Margen bruto",
                      color: INGRESO.medio,
                    },
                    { key: "%ebitda", label: "EBITDA", color: CAT.verde },
                  ]}
                  valueFormatter={(v) => formatPercent(v)}
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

          {/* El panel "Estructura de gastos" que cerraba la página mostraba las
              categorías del placeholder de src/lib/gastos.ts, todas en 0 €:
              ocupaba pantalla sin decir nada, y el desglose real de coste ya
              está arriba (COGS, personal, marketing y G&A del Sheet). El módulo
              gastos.ts y su endpoint /api/gastos se dejan en el repo para
              cuando el software de gestión exponga gastos operativos. */}
        </div>
      )}
    </>
  );
}
