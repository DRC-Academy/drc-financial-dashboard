"use client";

import { useState, type ReactNode } from "react";
import { useLiveData } from "@/hooks/useLiveData";
import { useMesActivo } from "@/hooks/useMesActivo";
import { PageHeader } from "@/components/ui/PageHeader";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { MonthSelect } from "@/components/ui/MonthSelect";
import { KpiCard } from "@/components/ui/KpiCard";
import { ParcialBadge } from "@/components/ui/ParcialBadge";
import { Panel } from "@/components/ui/Panel";
import { MultiTrendChart } from "@/components/ui/MultiTrendChart";
import { ComposedBarLineChart } from "@/components/ui/ComposedBarLineChart";
import { DonutChart } from "@/components/ui/DonutChart";
import { RangeFilter, applyRange } from "@/components/ui/RangeFilter";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getValueAtMonth,
  getMoMAtMonth,
  getDeltaAtMonth,
  getAlertaOperativa,
  getAlertaObjetivo,
  getRoiCanalLatest,
  CPL_LIMITE,
  CAC_LIMITE,
  CR_OBJETIVO,
  CR_LIMITE,
  CHURN_OBJETIVO,
  CHURN_LIMITE,
  monthLabelToApiMonth,
  formatCurrency,
  formatCurrencyDelta,
  formatNumber,
  formatNumberDelta,
  formatPercent,
  formatPointsDelta,
} from "@/lib/kpiHelpers";
import {
  avisoParcialMes,
  facturacionTotalDe,
  margenTotalDe,
} from "@/lib/profesoresHelpers";
import {
  getBlock,
  rankAtMonth,
  EMPTY_PRODUCTO_KPI,
  type ProductoKpiData,
} from "@/lib/productoKpiHelpers";
import { CAT, GASTO, INGRESO, NEUTRO } from "@/lib/chartColors";
import type { DBKpiData } from "@/types/kpi";
import type { PayoutsMonth, PayoutsSummary } from "@/types/profesores";
import type { SubscriptionsSnapshot } from "@/types/suscripciones";

/**
 * Pie de las tarjetas con umbral fijo: objetivo arriba, límite debajo. El
 * objetivo puede venir del Sheet (CPL_obj/CAC_obj/CR_obj); el límite es siempre
 * una constante de negocio (ver CPL_LIMITE y compañía en kpiHelpers).
 */
function ObjetivoLimite({
  objetivo,
  limite,
}: {
  objetivo: string | null;
  limite: string;
}) {
  return (
    <>
      {objetivo && <div>Objetivo: {objetivo}</div>}
      <div>Límite: {limite}</div>
    </>
  );
}

/**
 * Aviso amarillo de "ojo con esto": el dato no está mal, hay algo que mirar.
 * Mismo tono y misma caja que el aviso de cifra parcial de Profesores, para que
 * un aviso se reconozca como aviso en todo el dashboard.
 */
function Aviso({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-drc-yellow/40 bg-drc-yellow/10 px-4 py-2.5 text-xs text-drc-ink">
      <strong>{titulo}</strong> — {children}
    </div>
  );
}

/**
 * Estados de suscripción de WooCommerce que SE MUESTRAN, en el orden en que se
 * leen: primero los que dan acceso (y por tanto facturan), después los que
 * todavía pueden darlo.
 *
 * `cancelled` queda FUERA a propósito: son bajas ya consumadas y esta sección
 * mira quién está activo hoy, no el cementerio (que además es el número más
 * grande de todos —161 sobre 315— y se comía la lectura de la lista). Por eso
 * las filas visibles no suman el total de WooCommerce, y por eso el pie ya no
 * da ese total: invitaría a una resta que no significa nada.
 *
 * `pending-cancel` sí se queda, y no como "cancelada": pidieron la baja pero
 * siguen pagando hasta que termine el ciclo, así que cuentan en «Dan acceso» y
 * sin ellas ese total no cuadraría con nada de lo que se ve.
 */
const ESTADO_WOO_ORDEN = [
  "active",
  "pending-cancel",
  "on-hold",
  "scheduled",
  "expired",
] as const;

const ESTADO_WOO_LABEL: Record<string, string> = {
  active: "Activas",
  "pending-cancel": "Con baja pedida, acceso hasta fin de ciclo",
  "on-hold": "En espera",
  scheduled: "Programadas",
  expired: "Vencidas",
};

export default function ResumenPage() {
  const { data, loading, error, fetchedAt } = useLiveData<DBKpiData>(
    "/api/kpi",
    60_000
  );
  // Sólo para el bloque "Oportunidad del mes": el producto más vendido sale de
  // la hoja "KPI Producto" (misma fuente que la página Producto), no de DB_KPI.
  const producto = useLiveData<ProductoKpiData>("/api/producto-kpi", 60_000);

  const kpi = data ?? { months: [], keys: [], data: {} };
  const months = kpi.months;
  const hasAnyData = months.length > 0;

  // Desplegable de mes: controla SOLO las tarjetas KPI. Si no hay elección
  // válida, cae al mes más reciente disponible (ver useMesActivo).
  const [activeMonth, setMonthChoice] = useMesActivo(months);

  // Rangos independientes por gráfico (no afectan las tarjetas).
  const [ingRange, setIngRange] = useState(0);
  const [pedRange, setPedRange] = useState(0);
  const [cliRange, setCliRange] = useState(0);

  /**
   * MARGEN BRUTO REAL — la única cosa de esta página que NO sale del Sheet.
   *
   * Viene del mismo endpoint que la página Profesores (`margen_total` de
   * /api/profesores?month=YYYY-MM): facturación real de los alumnos vía
   * WooCommerce menos lo que se le paga a los profesores.
   *
   * Los dos formatos de mes NO son el mismo: el desplegable de arriba habla el
   * "mmm-yy" del Sheet y el endpoint espera "YYYY-MM". El puente es
   * monthLabelToApiMonth, el mismo que ya usa el desplegable de Profesores para
   * el camino de vuelta; acá no se escribe ninguna conversión nueva.
   *
   * La serie (/api/profesores/summary) se pide sólo para saber QUÉ MESES cubre
   * DRC Gestión. Sin ella se le pediría el mes a ciegas: el Sheet arranca mucho
   * antes que las liquidaciones, así que la mayoría de los meses del desplegable
   * no tienen nada del otro lado y no vale la pena hacerle recalcular 27
   * profesores para que conteste ceros. Es la misma llamada que ya hace la
   * página Profesores, y el cache del servidor es compartido: sale gratis.
   */
  const mesApi = activeMonth ? monthLabelToApiMonth(activeMonth) : null;
  const { data: serieProfes } = useLiveData<PayoutsSummary>(
    "/api/profesores/summary",
    60_000
  );
  const mesEnProfesores =
    mesApi !== null &&
    (serieProfes?.series ?? []).some((p) => p.month_year === mesApi);

  // Con url null, useLiveData no pide nada (ni la primera vez ni en el polling).
  const { data: profesRaw } = useLiveData<PayoutsMonth>(
    mesEnProfesores ? `/api/profesores?month=${mesApi}` : null,
    60_000
  );

  /**
   * El hook conserva el último `data` que llegó, así que al cambiar de mes (o al
   * dejar de pedir, porque el mes nuevo no existe del otro lado) el payload
   * viejo sigue ahí un rato. `month_year` dice a qué mes corresponde de verdad:
   * si no es el que se está mirando, no es el dato de este mes y se descarta.
   * Sin este guardia la tarjeta enseñaría el margen de julio bajo el título de
   * agosto, que es peor que no enseñar nada.
   */
  const profesMes =
    profesRaw && profesRaw.month_year === mesApi ? profesRaw : null;

  // margen_total y facturacion_total SIEMPRE por los helpers: cuando ningún
  // alumno tiene precio resuelto el endpoint manda 0, y ese 0 significa "no lo
  // sabemos" (ver lib/profesoresHelpers).
  const margenReal = profesMes ? margenTotalDe(profesMes) : null;
  const facturacionReal = profesMes ? facturacionTotalDe(profesMes) : null;
  const avisoReal = profesMes ? avisoParcialMes(profesMes) : null;
  // Margen sobre la facturación que pasa por profesores. Es lo ÚNICO que se
  // deriva acá, y sólo con datos del propio endpoint: sirve para leer la
  // tarjeta de al lado —que está en %— sin tener que dividir a ojo.
  const margenRealPct =
    margenReal !== null && facturacionReal !== null && facturacionReal !== 0
      ? margenReal / facturacionReal
      : null;

  /**
   * POR QUÉ no hay margen real, o null si sí lo hay. Los cuatro motivos se
   * arreglan de forma distinta y no se pueden fundir en un "sin datos" genérico:
   * uno es de configuración nuestra, otro es del calendario, otro es que falta
   * cargar precios del otro lado y el último es que todavía no contestó.
   */
  /**
   * SUSCRIPCIONES Y ALUMNOS ACTIVOS — la otra cosa que no sale del Sheet.
   *
   * `/api/subscriptions` no lleva parámetros porque el recuento es una FOTO DEL
   * PRESENTE: el endpoint no sabe cuántos activos había en marzo. Por eso este
   * bloque NO depende del desplegable de mes y no se grafica en el tiempo —
   * igual que "Profesores activos ahora". La serie histórica sigue siendo la del
   * Sheet.
   */
  const {
    data: susc,
    loading: suscLoading,
    error: suscError,
  } = useLiveData<SubscriptionsSnapshot>("/api/subscriptions", 60_000);

  /**
   * Woo caído. El otro lado NO descarta la respuesta entera por esto: lo que
   * sale de su base (activaciones manuales y Oritalk) sigue llegando bien, y
   * sólo se anula lo que depende de WooCommerce. La UI respeta esa distinción:
   * "—" en lo que falta, el resto se muestra.
   */
  const wooCaido = susc !== null && susc.woocommerce.ok !== true;
  const activosLive = susc?.alumnos.activos ?? null;

  const motivoSinMargenReal: string | null = !serieProfes
    ? "Sin respuesta de DRC Gestión: no hay margen real que mostrar. El resto de la página lee del Sheet y no se ve afectado."
    : !mesEnProfesores
      ? `El histórico de liquidaciones de DRC Gestión no llega a ${
          activeMonth || "este mes"
        }. No es 0 €: es un mes sin datos del otro lado.`
      : !profesMes
        ? "Pidiéndole el mes a DRC Gestión…"
        : margenReal === null
          ? "Ningún alumno con precio de plan resuelto en DRC Gestión este mes, así que no hay margen que calcular. No es 0 €: es un dato que falta."
          : null;

  // ---- Fila 1 · Ingresos ----
  const ingresos = getValueAtMonth(kpi, "ingresos_netos", activeMonth);
  const ingresosDelta = getDeltaAtMonth(kpi, "ingresos_netos", activeMonth);

  const b2c = getValueAtMonth(kpi, "ingresos_B2C_netos", activeMonth);
  const b2b = getValueAtMonth(kpi, "ingresos_B2B", activeMonth);
  // "DRC Academy" = B2C neto + B2B. No es columna del Sheet: se suma acá.
  const drcAcademy = b2c === null && b2b === null ? null : (b2c ?? 0) + (b2b ?? 0);

  // ---- Fila 2 · Pedidos ----
  const pedidos = getValueAtMonth(kpi, "pedidos", activeMonth);
  const pedidosDelta = getDeltaAtMonth(kpi, "pedidos", activeMonth);

  // ---- Fila 3 · MRR ----
  // MRR_MoM ya es la variación calculada en el Sheet, en fracción (0.053 = 5,3%)
  // igual que el resto de tasas → ×100 para el badge, que espera puntos.
  const mrrMoM = getValueAtMonth(kpi, "MRR_MoM", activeMonth);
  const suscActivas = getValueAtMonth(kpi, "suscripciones_activas", activeMonth);
  const suscActivasDelta = getDeltaAtMonth(
    kpi,
    "suscripciones_activas",
    activeMonth
  );
  const churn = getValueAtMonth(kpi, "clientes_churn", activeMonth);
  const churnObj = getValueAtMonth(kpi, "churn_obj", activeMonth);

  // ---- Fila 4 ----
  const arpc = getValueAtMonth(kpi, "ARPC", activeMonth);
  const ltv = getValueAtMonth(kpi, "LTV", activeMonth);
  const ltvObj = getValueAtMonth(kpi, "LTV_obj", activeMonth);
  const cpl = getValueAtMonth(kpi, "CPL_ads", activeMonth);
  const cplObj = getValueAtMonth(kpi, "CPL_obj", activeMonth);
  const cac = getValueAtMonth(kpi, "CAC", activeMonth);
  const cacObj = getValueAtMonth(kpi, "CAC_obj", activeMonth);
  const cr = getValueAtMonth(kpi, "CR_clientes", activeMonth);
  // CR sí tiene columna de objetivo en DB_KPI (CR_obj = 0,28), y coincide con
  // el umbral de "EN OBJETIVO" del sistema de alertas. Usamos la columna y
  // caemos a la constante sólo si el Sheet no la trae, para no inventar nada
  // ni duplicar el número.
  const crObj = getValueAtMonth(kpi, "CR_obj", activeMonth) ?? CR_OBJETIVO;

  /**
   * MARGEN BRUTO — columna "%margenbruto" (sin guion bajo tras el %), en
   * FRACCIÓN 0-1 como el resto de tasas del Sheet. No existe ninguna columna
   * "margen_bruto": lo que hay es ésta y CF_margenbruto, que es el importe en €.
   *
   * Mismo guardia que en Situación Financiera: en los meses sin cuadro de
   * resultados cargado la columna puede venir en 0 (no vacía), y sin mirar
   * CF_ingresos la tarjeta mostraría un "0%" que no es un margen del cero por
   * ciento sino un mes sin cerrar.
   */
  const cfIngresos = getValueAtMonth(kpi, "CF_ingresos", activeMonth);
  const margenBruto =
    cfIngresos === null || cfIngresos === 0
      ? null
      : getValueAtMonth(kpi, "%margenbruto", activeMonth);
  const mbObj = getValueAtMonth(kpi, "MB_obj", activeMonth);

  // ---- Gráficos (usan su propio rango, sobre el dataset completo) ----
  const ingresosMrrSeries = applyRange(months, ingRange).map((month) => ({
    month,
    ingresos_netos: kpi.data[month]?.["ingresos_netos"] ?? null,
    MRR: kpi.data[month]?.["MRR"] ?? null,
  }));

  const pedidosAovRows = applyRange(months, pedRange).map((month) => ({
    month,
    pedidos_nuevos: kpi.data[month]?.["pedidos_nuevos"] ?? null,
    pedidos_recurrentes: kpi.data[month]?.["pedidos_recurrentes"] ?? null,
    AOV: kpi.data[month]?.["AOV"] ?? null,
  }));

  const clientesRows = applyRange(months, cliRange).map((month) => {
    const perdidos = kpi.data[month]?.["clientes_perdidos"] ?? null;
    return {
      month,
      clientes_nuevos: kpi.data[month]?.["clientes_nuevos"] ?? null,
      clientes_recurrentes: kpi.data[month]?.["clientes_recurrentes"] ?? null,
      // clientes_perdidos viene en negativo (convención de "pérdida"): magnitud.
      clientes_perdidos: perdidos === null ? null : Math.abs(perdidos),
      retention_rate: kpi.data[month]?.["retention_rate"] ?? null,
    };
  });

  // ---- Oportunidad del mes (mejor canal por ROI del último mes) ----
  const roiGoogle = getRoiCanalLatest(kpi, "google");
  const roiMeta = getRoiCanalLatest(kpi, "meta");
  let mejorCanal: string | null = null;
  if (roiGoogle !== null && roiMeta !== null) {
    mejorCanal = roiGoogle >= roiMeta ? "Google Ads" : "Meta Ads";
  } else if (roiGoogle !== null) {
    mejorCanal = "Google Ads";
  } else if (roiMeta !== null) {
    mejorCanal = "Meta Ads";
  }

  // Producto más vendido = el nº 1 por INGRESOS del bloque "Ingresos" de la hoja
  // "KPI Producto" — el mismo criterio que la tarjeta "Más vendido (ingresos)"
  // de la página Producto, para que las dos no puedan discrepar. "KPI Producto"
  // tiene su propia lista de meses: si el mes elegido arriba no está en ella,
  // caemos a su mes más reciente (y no dejamos la ficha vacía por un desfase de
  // calendario entre hojas).
  const productoKpi = producto.data ?? EMPTY_PRODUCTO_KPI;
  const productoMonth = productoKpi.months.includes(activeMonth)
    ? activeMonth
    : productoKpi.months[productoKpi.months.length - 1] ?? "";
  const topProducto =
    rankAtMonth(getBlock(productoKpi, "Ingresos"), productoKpi.months, productoMonth)[0] ??
    null;

  return (
    <>
      <PageHeader
        eyebrow="01 · Resumen ejecutivo"
        title="Cómo está el negocio, de un vistazo"
        description="Elegí el mes para las tarjetas KPI; cada gráfico tiene su propio rango temporal."
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
        <EmptyState label='No se encontraron datos en la hoja "DB_KPI". Verificá el Sheet ID y las credenciales.' />
      )}

      {hasAnyData && (
        <div className="space-y-6">
          {/*
            Filas 1-3 comparten una única grilla de 7 columnas para que la
            tarjeta titular (T, span 3) quede alineada a lo ancho en las tres:
            con grillas separadas los gaps distintos la desalinean unos píxeles.
          */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4">
            {/* --- Fila 1 · Ingresos --- */}
            <KpiCard
              className="sm:col-span-2 lg:col-span-3"
              size="titular"
              label="Ingresos netos"
              value={formatCurrency(ingresos)}
              mom={getMoMAtMonth(kpi, "ingresos_netos", activeMonth)}
              subValues={[
                { label: "vs. mes anterior", value: formatCurrencyDelta(ingresosDelta) },
              ]}
            />
            <KpiCard
              className="lg:col-span-2"
              label="DRC Academy"
              value={formatCurrency(drcAcademy)}
              subValues={[
                { label: "B2C", value: formatCurrency(b2c) },
                { label: "B2B", value: formatCurrency(b2b) },
              ]}
            />
            {/* ingresos_oritalk: negocio paralelo, al lado de DRC Academy. */}
            <KpiCard
              className="lg:col-span-2"
              label="Oritalk"
              value={formatCurrency(getValueAtMonth(kpi, "ingresos_oritalk", activeMonth))}
              mom={getMoMAtMonth(kpi, "ingresos_oritalk", activeMonth)}
            />

            {/* --- Fila 2 · Pedidos --- */}
            <KpiCard
              className="sm:col-span-2 lg:col-span-3"
              size="titular"
              label="Pedidos"
              value={formatNumber(pedidos)}
              mom={getMoMAtMonth(kpi, "pedidos", activeMonth)}
              subValues={[
                { label: "vs. mes anterior", value: formatNumberDelta(pedidosDelta) },
              ]}
            />
            <KpiCard
              className="lg:col-span-2"
              label="AOV"
              value={formatCurrency(getValueAtMonth(kpi, "AOV", activeMonth))}
              mom={getMoMAtMonth(kpi, "AOV", activeMonth)}
            />
            {/* "ventas" es el TOTAL del mes y cuadra con el embudo de ads
                (CAC ≈ ads_captacion/ventas, CR_clientes ≈ ventas/leads). El
                desglose por comercial (ventas_hugo + ventas_martin, que suman
                exactamente esta columna) vive en Captación, que es donde se
                mira quién cierra. */}
            <KpiCard
              className="lg:col-span-2"
              label="Ventas"
              value={formatNumber(getValueAtMonth(kpi, "ventas", activeMonth))}
              mom={getMoMAtMonth(kpi, "ventas", activeMonth)}
            />

            {/* --- Fila 3 · MRR --- */}
            <KpiCard
              className="sm:col-span-2 lg:col-span-3"
              size="titular"
              label="MRR"
              value={formatCurrency(getValueAtMonth(kpi, "MRR", activeMonth))}
              mom={mrrMoM === null ? null : mrrMoM * 100}
              subValues={[
                {
                  label: "MRR neto",
                  value: formatCurrency(getValueAtMonth(kpi, "MRR_net", activeMonth)),
                },
              ]}
            />
            {/* "(Sheet)" en el título por lo mismo que en margen bruto: más
                abajo hay un recuento EN VIVO de alumnos activos, y sin decir de
                dónde sale cada uno los dos números se leen como si uno
                corrigiera al otro. */}
            <KpiCard
              className="lg:col-span-2"
              label="Suscripciones activas (Sheet)"
              value={formatNumber(suscActivas)}
              mom={getMoMAtMonth(kpi, "suscripciones_activas", activeMonth)}
              subValues={[
                {
                  label: "vs. mes anterior",
                  value: formatNumberDelta(suscActivasDelta),
                },
              ]}
            />
            {/* clientes_churn es una TASA (0.76 → "76%"), no un conteo.
                Umbrales fijos (> 25% peligro · 20-25% mejorable · ≤ 20% bien)
                en vez del semáforo por ratio contra churn_obj: son los del
                churn MENSUAL y no aplican al churn a 3 meses de Retención, que
                mide otra ventana y sigue sin alerta. El objetivo del hint
                (20%) sale de la columna churn_obj y coincide con el corte. */}
            <KpiCard
              className="lg:col-span-2"
              label="Clientes en churn"
              value={formatPercent(churn)}
              mom={getMoMAtMonth(kpi, "clientes_churn", activeMonth)}
              momIsGoodWhenPositive={false}
              alerta={getAlertaOperativa("clientes_churn", churn)}
              hint={
                <ObjetivoLimite
                  objetivo={
                    churnObj !== null
                      ? formatPercent(churnObj)
                      : formatPercent(CHURN_OBJETIVO)
                  }
                  limite={formatPercent(CHURN_LIMITE)}
                />
              }
            />
          </div>

          {/* --- Fila 4 · Unit economics ---
              El margen bruto salió de esta fila y tiene la suya: ahora son dos
              tarjetas que se leen juntas (Sheet y real), y como una tercera
              parte de una fila de seis no se comparan, se comparten. */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* ARPC abre la fila: es el ingreso por cliente del que sale el LTV.
                DB_KPI no trae columna de objetivo para ARPC, así que va sin
                alerta ni hint (mismo criterio que en Retención). */}
            <KpiCard
              label="ARPC"
              value={formatCurrency(arpc)}
              mom={getMoMAtMonth(kpi, "ARPC", activeMonth)}
            />
            <KpiCard
              label="LTV"
              value={formatCurrency(ltv)}
              mom={getMoMAtMonth(kpi, "LTV", activeMonth)}
              alerta={getAlertaObjetivo(ltv, ltvObj, false)}
              hint={ltvObj !== null ? `Objetivo: ${formatCurrency(ltvObj)}` : undefined}
            />
            <KpiCard
              label="CPL"
              value={formatCurrency(cpl)}
              mom={getMoMAtMonth(kpi, "CPL_ads", activeMonth)}
              momIsGoodWhenPositive={false}
              alerta={getAlertaOperativa("CPL_ads", cpl)}
              hint={
                <ObjetivoLimite
                  objetivo={cplObj !== null ? formatCurrency(cplObj) : null}
                  limite={formatCurrency(CPL_LIMITE)}
                />
              }
            />
            <KpiCard
              label="CAC"
              value={formatCurrency(cac)}
              mom={getMoMAtMonth(kpi, "CAC", activeMonth)}
              momIsGoodWhenPositive={false}
              alerta={getAlertaOperativa("CAC", cac)}
              hint={
                <ObjetivoLimite
                  objetivo={cacObj !== null ? formatCurrency(cacObj) : null}
                  limite={formatCurrency(CAC_LIMITE)}
                />
              }
            />
            {/* CR_clientes se compara en fracción (0-1) y se muestra en %. */}
            <KpiCard
              label="CR"
              value={formatPercent(cr)}
              mom={getMoMAtMonth(kpi, "CR_clientes", activeMonth)}
              alerta={getAlertaOperativa("CR_clientes", cr)}
              hint={
                <ObjetivoLimite
                  objetivo={formatPercent(crObj)}
                  limite={formatPercent(CR_LIMITE)}
                />
              }
            />
          </div>

          {/* --- Fila 5 · Margen bruto: el del Sheet y el real ---
              Las dos tarjetas miden lo mismo (lo que queda después del coste de
              dar el servicio) pero NO son la misma cifra ni salen de la misma
              fuente, así que van etiquetadas por origen y no se restan ni se
              comparan por código: se ponen al lado y las lee quien mira. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Margen bruto contra su objetivo del Sheet (MB_obj), mismo patrón
                que LTV: alerta por ratio real/objetivo y el objetivo en el pie.
                La comparativa va en PUNTOS porcentuales, no en % relativo — es
                un margen, igual que en Situación Financiera. */}
            <KpiCard
              label="Margen bruto (Sheet)"
              value={formatPercent(margenBruto)}
              momDelta={(() => {
                const d = getDeltaAtMonth(kpi, "%margenbruto", activeMonth);
                return d === null ? null : d * 100;
              })()}
              formatDelta={formatPointsDelta}
              alerta={getAlertaObjetivo(margenBruto, mbObj, false)}
              hint={
                <>
                  <div>
                    Columna %margenbruto del cuadro de resultados de DB_KPI, con
                    todos los costes del servicio dentro.
                  </div>
                  {mbObj !== null && <div>Objetivo: {formatPercent(mbObj)}</div>}
                </>
              }
            />

            {/*
              MARGEN BRUTO REAL — mismo mes, otra fuente (DRC Gestión).

              Sin `alerta` y con `semaforo` explícito, igual que la tarjeta
              "Margen total" de la página Profesores: acá no hay objetivo que
              cumplir, lo único que significa algo es el signo, y ése lo pone la
              propia resta.

              El ⚠ va en `action` (el sitio del chip de alerta, que esta tarjeta
              no usa) con el MISMO badge y el mismo criterio que la tabla de
              Profesores: la cifra es un mínimo, no un cierre.
            */}
            <KpiCard
              label="Margen bruto real (profesores)"
              value={formatCurrency(margenReal)}
              semaforo={
                margenReal === null ? "neutral" : margenReal >= 0 ? "green" : "red"
              }
              action={avisoReal ? <ParcialBadge aviso={avisoReal} /> : undefined}
              subValues={[
                {
                  label: "Facturación vía profesores",
                  value: formatCurrency(facturacionReal),
                },
                {
                  label: "Margen / facturación",
                  value: formatPercent(margenRealPct),
                },
              ]}
              hint={
                motivoSinMargenReal ? (
                  <div>{motivoSinMargenReal}</div>
                ) : (
                  <>
                    <div>
                      Facturación real de los alumnos (WooCommerce) − lo que se
                      paga a sus profesores, calculado por DRC Gestión. Es el
                      mismo número de la tarjeta «Margen total» de Profesores.
                    </div>
                    <div>
                      Cubre sólo lo que pasa por un profesor con alumnos
                      asignados: no es la cuenta entera de la academia, así que su
                      % no se lee contra el objetivo MB_obj de al lado.
                    </div>
                  </>
                )
              }
            />
          </div>

          {/* --- Alumnos activos AHORA (DRC Gestión, no el Sheet) ---
              Va pegado a las tarjetas KPI y no al final de la página: es el
              contrapunto en vivo del "Suscripciones activas" de la fila 3, y
              separarlos con tres gráficos en medio sería esconder justo la
              comparación que da sentido a la sección. */}
          <Panel
            title="Alumnos activos ahora · WooCommerce + reglas de DRC Gestión"
            description="Foto del PRESENTE, no del mes elegido arriba: el recuento se hace hoy y no cambia con el desplegable. Un alumno cuenta como activo si tiene suscripción de WooCommerce vigente, activación manual en curso o es de Oritalk — la misma regla que decide si puede entrar a clase."
          >
            {suscLoading && !susc && (
              <div className="text-sm text-drc-ink-soft">
                Cargando suscripciones…
              </div>
            )}

            {/* Degradación total: mismo EmptyState que el resto del dashboard.
                El motivo real (401/500/timeout) queda en los logs del servidor. */}
            {!suscLoading && !susc && (
              <EmptyState label="Sin datos de suscripciones: DRC Gestión no respondió" />
            )}

            {susc && (
              <div className="space-y-4">
                {/* Woo caído NO vacía la sección: las activaciones manuales y
                    Oritalk salen de la base del otro lado y siguen siendo
                    válidas. Sólo se cae lo que depende de WooCommerce. */}
                {wooCaido && (
                  <Aviso titulo="Sin conexión con WooCommerce">
                    DRC Gestión no pudo leer las suscripciones
                    {susc.woocommerce.error ? ` (${susc.woocommerce.error})` : ""}
                    , así que el total de activos y los que entran por suscripción
                    quedan en «—». Los activados a mano y los de Oritalk sí se
                    muestran: salen de su base y no dependen de WooCommerce. No
                    son ceros, es un dato que falta.
                  </Aviso>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <KpiCard
                    label="Alumnos activos ahora (DRC Gestión)"
                    value={formatNumber(activosLive)}
                    subValues={[
                      {
                        label: "Alumnos en el sistema",
                        value: formatNumber(susc.alumnos.en_base),
                      },
                      {
                        label: "Inactivos",
                        value: formatNumber(susc.alumnos.inactivos),
                      },
                    ]}
                    hint="Cuenta PERSONAS con acceso hoy, por cualquiera de los tres orígenes. Es el mismo número que decide quién puede entrar a clase."
                  />
                  <KpiCard
                    label={`Suscripciones activas${
                      activeMonth ? ` · ${activeMonth}` : ""
                    } (Sheet)`}
                    value={formatNumber(suscActivas)}
                    hint="Columna suscripciones_activas de DB_KPI, del mes elegido arriba. Cuenta SUSCRIPCIONES de un mes cerrado, no personas de hoy."
                  />
                </div>

                {/* La aclaración va siempre: los dos números miden cosas
                    distintas aunque coincidan, y una coincidencia casual sería
                    aún más engañosa que una diferencia. */}
                <p className="text-[11px] text-drc-ink-soft">
                  No son el mismo dato y no tienen por qué coincidir: el de la
                  izquierda son <strong>personas con acceso hoy</strong> (en vivo,
                  incluye manuales y Oritalk); el de la derecha son{" "}
                  <strong>suscripciones del mes cerrado</strong> que cargamos en el
                  Sheet. Una persona puede tener más de una suscripción, y una
                  activación manual no tiene ninguna.
                </p>

                {/* Las dos columnas van en `flex flex-col` + `flex-1` y no en
                    un div a secas: EmptyState se estira con `h-full`, y dentro
                    de una celda de grid con un título encima eso da el 100% de
                    la FILA, no del hueco que queda bajo el título — se desborda
                    justo lo que mide el título y se come el aviso de abajo. */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="flex flex-col">
                    <h4 className="text-xs uppercase tracking-wide text-drc-ink-soft mb-3">
                      Por dónde entra el acceso
                    </h4>
                    {/* Con Woo caído no se dibuja: el trozo de "suscripción"
                        vendría en null y la dona pintaría manual+Oritalk como si
                        fueran el total de activos, que es justo la lectura
                        equivocada. Las tres categorías son excluyentes y suman
                        `activos`, por eso el centro de la dona es ese total. */}
                    <div className="flex-1">
                    {activosLive === null ? (
                      <EmptyState label="Sin WooCommerce no se puede repartir el total" />
                    ) : (
                      <>
                        <DonutChart
                          height={200}
                          centerLabel="activos"
                          valueFormatter={(v) => formatNumber(v)}
                          data={[
                            {
                              name: "Suscripción de WooCommerce",
                              value: susc.alumnos.por_origen.suscripcion,
                              color: CAT.verde,
                            },
                            {
                              name: "Activación manual",
                              value: susc.alumnos.por_origen.manual.total,
                              color: CAT.oro,
                            },
                            {
                              name: "Oritalk",
                              value: susc.alumnos.por_origen.oritalk,
                              color: CAT.verdeClaro,
                            },
                          ]}
                        />
                        {susc.alumnos.por_origen.manual.total > 0 && (
                          <p className="mt-3 text-[11px] text-drc-ink-soft">
                            De los{" "}
                            {formatNumber(susc.alumnos.por_origen.manual.total)}{" "}
                            manuales,{" "}
                            {formatNumber(
                              susc.alumnos.por_origen.manual.plan_empresa
                            )}{" "}
                            son plan de empresa (la fecha la calcula el sistema) y{" "}
                            {formatNumber(susc.alumnos.por_origen.manual.a_mano)}{" "}
                            activaciones puestas a mano.
                          </p>
                        )}
                      </>
                    )}
                    </div>
                  </div>

                  <div className="flex flex-col">
                    <h4 className="text-xs uppercase tracking-wide text-drc-ink-soft mb-3">
                      Suscripciones en WooCommerce
                    </h4>
                    <div className="flex-1">
                    {wooCaido ? (
                      <EmptyState label="WooCommerce no respondió" />
                    ) : (
                      <>
                        <dl className="divide-y divide-drc-line/60 text-xs">
                          {ESTADO_WOO_ORDEN.filter(
                            (e) => susc.woocommerce.por_estado[e] !== undefined
                          ).map((estado) => (
                            <div
                              key={estado}
                              className="flex items-baseline justify-between gap-4 py-1.5"
                            >
                              <dt className="text-drc-ink-soft">
                                {ESTADO_WOO_LABEL[estado]}
                              </dt>
                              <dd className="tabular font-medium text-drc-ink">
                                {formatNumber(susc.woocommerce.por_estado[estado])}
                              </dd>
                            </div>
                          ))}
                          {/* Estados que el otro lado no mapea. Se muestran
                              crudos y en gris: inventarles una traducción sería
                              afirmar que sabemos qué significan. */}
                          {Object.entries(susc.woocommerce.otros_estados).map(
                            ([estado, n]) => (
                              <div
                                key={estado}
                                className="flex items-baseline justify-between gap-4 py-1.5"
                              >
                                <dt className="text-drc-ink-soft">
                                  {estado}{" "}
                                  <span className="opacity-70">(sin mapear)</span>
                                </dt>
                                <dd className="tabular font-medium text-drc-ink-soft">
                                  {formatNumber(n)}
                                </dd>
                              </div>
                            )
                          )}
                          <div className="flex items-baseline justify-between gap-4 border-t-2 border-drc-line pt-2 font-semibold text-drc-ink">
                            <dt>Dan acceso</dt>
                            <dd className="tabular">
                              {formatNumber(susc.woocommerce.dan_acceso)}
                            </dd>
                          </div>
                        </dl>
                        {/* Sin el total de WooCommerce a propósito: las bajas
                            consumadas no se listan, así que un total invitaría a
                            restar y sacar un número que no está a la vista. */}
                        <p className="mt-3 text-[11px] text-drc-ink-soft">
                          Cuenta SUSCRIPCIONES, no personas. «Dan acceso» son las
                          activas más las que pidieron la baja y siguen dentro de
                          su ciclo pagado.
                        </p>
                      </>
                    )}
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-drc-ink-soft">
                  Recuento del {susc.today_madrid} (hora de España).
                  {suscError
                    ? " No se pudo contactar con DRC Gestión: los números de arriba son los últimos que llegaron."
                    : ""}
                </p>
              </div>
            )}
          </Panel>

          {/* Dos datos y nada más: dónde invertir y qué se está vendiendo. Los
              ROI por canal que antes vivían acá están completos en Captación.
              Va pegado a las tarjetas KPI, antes de los gráficos: es la lectura
              accionable del mes y se quiere ver sin scrollear. */}
          <Panel
            title="Oportunidad del mes"
            description="Mejor canal de adquisición según ROI del último mes disponible, y el producto que más ingresos deja."
          >
            <div className="flex flex-wrap gap-x-12 gap-y-4">
              <div>
                <div className="text-xs text-drc-ink-soft">Canal recomendado</div>
                <div className="text-lg font-semibold text-drc-green">
                  {mejorCanal ?? "Sin datos"}
                </div>
              </div>
              <div>
                <div className="text-xs text-drc-ink-soft">
                  Producto más vendido
                  {topProducto && productoMonth ? ` · ${productoMonth}` : ""}
                </div>
                <div className="text-lg font-semibold text-drc-green">
                  {topProducto?.label ?? "Sin datos"}
                </div>
              </div>
            </div>
          </Panel>

          <Panel
            title="Ingresos netos y MRR en el tiempo"
            description="Evolución conjunta sobre la misma línea temporal."
            action={<RangeFilter value={ingRange} onChange={setIngRange} />}
          >
            <MultiTrendChart
              data={ingresosMrrSeries}
              series={[
                { key: "ingresos_netos", label: "Ingresos netos", color: INGRESO.fuerte },
                { key: "MRR", label: "MRR", color: INGRESO.medio },
              ]}
              valueFormatter={(v) => formatCurrency(v)}
            />
          </Panel>

          <Panel
            title="Pedidos y ticket medio (AOV)"
            description="Pedidos nuevos + recurrentes (apilados, eje izq.) y AOV como línea sobre eje derecho en € — escalas distintas, por eso el eje dual."
            action={<RangeFilter value={pedRange} onChange={setPedRange} />}
          >
            <ComposedBarLineChart
              data={pedidosAovRows}
              stacked
              /* Recharts apila en orden de declaración: el primero abajo. Para
                 que "nuevos" quede ARRIBA, va declarado último. */
              bars={[
                { key: "pedidos_recurrentes", label: "Pedidos recurrentes", color: CAT.verdeClaro },
                { key: "pedidos_nuevos", label: "Pedidos nuevos", color: CAT.oro },
              ]}
              line={{ key: "AOV", label: "AOV", color: INGRESO.base }}
              barFormatter={(v) => formatNumber(v)}
              lineFormatter={(v) => formatCurrency(v)}
            />
          </Panel>

          <Panel
            title="Movimiento de clientes y retención"
            description="Altas, recurrentes y perdidos (magnitud, eje izq.) con la tasa de retención como línea (%) sobre eje derecho."
            action={<RangeFilter value={cliRange} onChange={setCliRange} />}
          >
            <ComposedBarLineChart
              data={clientesRows}
              bars={[
                { key: "clientes_nuevos", label: "Nuevos", color: CAT.verde },
                { key: "clientes_recurrentes", label: "Recurrentes", color: CAT.verdeClaro },
                { key: "clientes_perdidos", label: "Perdidos", color: GASTO.base },
              ]}
              line={{ key: "retention_rate", label: "Retención", color: NEUTRO.ink }}
              barFormatter={(v) => formatNumber(v)}
              lineFormatter={(v) => formatPercent(v)}
            />
          </Panel>

        </div>
      )}
    </>
  );
}
