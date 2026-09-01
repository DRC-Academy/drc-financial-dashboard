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
import { BarComparison } from "@/components/ui/BarComparison";
import { RangeFilter, applyRange } from "@/components/ui/RangeFilter";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getValueAtMonth,
  getMoMAtMonth,
  clavesAusentes,
  esMesEnCurso,
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
  AVISO_MESES_RETROACTIVOS,
  avisoParcialMes,
  facturacionTotalDe,
  margenPctTotalDe,
  margenTotalDe,
} from "@/lib/profesoresHelpers";
import { VentanasDudosasNota } from "@/components/ui/VentanasDudosasNota";
import { wooPorEstado } from "@/lib/suscripcionesHelpers";
import {
  getBlock,
  rankAtMonth,
  EMPTY_PRODUCTO_KPI,
  type ProductoKpiData,
} from "@/lib/productoKpiHelpers";
import {
  EMPTY_DAILY_KPI,
  acumuladoPorDiaDelMes,
  aggregate,
  daysInRange,
  tramoMesAnterior,
  tramoTranscurrido,
} from "@/lib/kpiDiarioHelpers";
import { formatDayRangeShort } from "@/lib/isoDate";
import { CAT, GASTO, INGRESO, NEUTRO } from "@/lib/chartColors";
import type { DailyKpiData, DBKpiData } from "@/types/kpi";
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
 * COLUMNAS DE DB_KPI DE LAS QUE DEPENDE ESTA PÁGINA.
 *
 * Se listan para poder avisar cuando alguna NO LLEGA a la hoja, que es
 * distinto de que llegue vacía (ver clavesAusentes en kpiHelpers). DB_KPI se
 * arma con un FILTER sobre "KPI General" que descarta la fila entera de
 * cualquier métrica cuyo cálculo dé error, así que una fórmula rota río arriba
 * borra la columna en vez de devolver #N/A — y en pantalla eso es un “—”
 * idéntico al de un mes sin cargar.
 *
 * Si agregás un getValueAtMonth con una clave nueva, sumala acá. No pasa nada
 * si te olvidás: el guardia simplemente no la cubre.
 */
const COLUMNAS_DB_KPI = [
  "%margenbruto",
  "AOV",
  "ARPC",
  "CAC",
  "CAC_obj",
  "CF_ingresos",
  "CPL_ads",
  "CPL_obj",
  "CR_clientes",
  "CR_obj",
  "LTV",
  "LTV_obj",
  "MB_obj",
  "MRR",
  "MRR_MoM",
  "MRR_net",
  "churn_obj",
  "clientes_churn",
  "clientes_nuevos",
  "clientes_perdidos",
  "clientes_recurrentes",
  "ingresos_B2B",
  "ingresos_B2C_netos",
  "ingresos_netos",
  "ingresos_oritalk",
  "pedidos",
  "pedidos_nuevos",
  "pedidos_recurrentes",
  "retention_rate",
  "suscripciones_activas",
  "ventas",
];

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
 *
 * `pending` ("Pendientes de pago") entró en la auditoría del 28/08/2026. Hasta
 * entonces DRC Gestión no lo tenía en su mapa de estados y llegaba por
 * `otros_estados`, así que esta lista se lo saltaba y la fila salía cruda:
 * "pending (sin mapear) 4". Va PEGADO a `on-hold` porque son las dos caras del
 * mismo problema —un pago que no entró: acá nunca llegó a entrar, allá entró y
 * después falló— y separarlas obligaría a buscarlas en dos sitios de la lista.
 */
const ESTADO_WOO_ORDEN = [
  "active",
  "pending-cancel",
  "on-hold",
  "pending",
  "scheduled",
  "expired",
] as const;

/**
 * MÉTRICA DEL COMPARATIVO "MISMO TRAMO DEL MES" — columna de la hoja "KPI
 * Diario", no de DB_KPI.
 *
 * `clientes_nuevos` y no `clientes`: la hoja diaria trae las dos y NO son lo
 * mismo. `clientes` son todos los que compraron ese día (nuevos + recurrentes),
 * así que sube con las renovaciones y se lee como si hubieran entrado clientes
 * que ya estaban; `clientes_nuevos` son las ALTAS, que es lo que se quiere
 * comparar cuando la pregunta es "¿este mes estamos consiguiendo más clientes
 * que el pasado?". Las dos están cargadas los 608 días de la hoja, así que la
 * elección es de significado y no de disponibilidad. `clientes_recurrentes` es
 * el resto de la resta y `clientes_acumulados` es un stock (no se acumula).
 *
 * Tiene que ser una métrica de FLUJO (modo `sum` en kpiDiarioHelpers): el
 * gráfico dibuja el acumulado del tramo, y acumular un stock no significa nada.
 */
const METRICA_TRAMO = "clientes_nuevos";
const METRICA_TRAMO_LABEL = "Clientes nuevos";

const ESTADO_WOO_LABEL: Record<string, string> = {
  active: "Activas",
  "pending-cancel": "Con baja pedida, acceso hasta fin de ciclo",
  "on-hold": "En espera",
  // El mismo nombre que usa el admin de WooCommerce, a propósito: es contra esa
  // pantalla contra la que se cuadra esta lista cuando un número no cierra.
  pending: "Pendientes de pago",
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

  // Columnas que la página pide y que DB_KPI no trajo. Ver COLUMNAS_DB_KPI.
  const columnasAusentes = clavesAusentes(kpi, COLUMNAS_DB_KPI);

  // Desplegable de mes: controla SOLO las tarjetas KPI. Si no hay elección
  // válida, cae al mes más reciente disponible (ver useMesActivo).
  const [activeMonth, setMonthChoice] = useMesActivo(months);

  // Rangos independientes por gráfico (no afectan las tarjetas).
  const [ingRange, setIngRange] = useState(0);
  const [pedRange, setPedRange] = useState(0);
  const [cliRange, setCliRange] = useState(0);
  const [suscRange, setSuscRange] = useState(0);

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
  // Margen sobre la facturación que pasa por profesores: sirve para leer la
  // tarjeta de al lado —que está en %— sin tener que dividir a ojo. Ya NO se
  // calcula acá: la división vive en lib/profesoresHelpers, que es donde está
  // el criterio de cuándo el cociente no existe (facturación 0 o sin precios),
  // y ahora la comparten esta tarjeta, la de Profesores y la columna nueva de
  // la tabla. Con la resta escrita en tres sitios, el día que cambie el
  // criterio cambia en uno solo.
  const margenRealPct = profesMes ? margenPctTotalDe(profesMes) : null;

  /**
   * POR QUÉ no hay margen real, o null si sí lo hay. Los cuatro motivos se
   * arreglan de forma distinta y no se pueden fundir en un "sin datos" genérico:
   * uno es de configuración nuestra, otro es del calendario, otro es que falta
   * cargar precios del otro lado y el último es que todavía no contestó.
   */
  /**
   * SUSCRIPCIONES Y ALUMNOS ACTIVOS EN VIVO — la otra cosa que no sale del Sheet.
   *
   * LAS DOS FUENTES, porque se parecen y no son lo mismo:
   *
   *   · WooCommerce, vía `/api/subscriptions` (`alumnos.activos` y
   *     `woocommerce.por_estado.active`) — FOTO DEL PRESENTE. No lleva
   *     parámetro de mes y no puede llevarlo: cuando una suscripción cambia de
   *     estado, el estado viejo NO queda registrado en ningún lado, así que no
   *     hay forma de saber cuántas había activas en marzo. Atarlo al desplegable
   *     sería prometer un historial que la fuente no tiene — el número saldría
   *     idéntico para todos los meses y se leería como un bug. Ya pasó: lo
   *     reportaron como error y no lo era.
   *
   *   · DB_KPI del Sheet, columna `suscripciones_activas` — SÍ tiene historial,
   *     porque se anota a mano mes a mes. A cambio, el mes en curso puede estar
   *     incompleto: si un alumno todavía no renovó ni canceló, ese movimiento no
   *     existe aún en la hoja.
   *
   * Por eso son DOS paneles con título propio y no dos tarjetas vecinas: no son
   * el mismo dato con distinto corte temporal, son dos mediciones distintas de
   * cosas parecidas. El de arriba vive fuera del desplegable de mes (igual que
   * "Profesores activos ahora" en la página Profesores); el de abajo responde a
   * su propio rango, como el resto de los gráficos.
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

  /**
   * `por_origen.suscripcion` (las PERSONAS de nuestra base con suscripción
   * vigente: 133 hoy) ya no se muestra en la tarjeta de arriba — la decisión de
   * Facundo del 01/09/2026 fue que ese titular sea el recuento crudo de
   * WooCommerce, que es contra el que se cuadra.
   *
   * El número NO desaparece de la página: sigue siendo el trozo "Suscripción de
   * WooCommerce" de la dona del panel de abajo, que es donde reparte el total de
   * alumnos activos entre sus tres orígenes. Ahí sí está en su unidad —personas—
   * y junto a las otras dos porciones, que es lo que le da sentido.
   */

  /**
   * Los activos que NO entran en el MRR. Se suma acá porque el otro lado no
   * manda el total: son dos claves distintas de `por_origen`. Sobrevive a
   * WooCommerce caído a propósito — las dos salen de la base de DRC Gestión, no
   * de Woo, así que este número sigue siendo bueno justo cuando `activos` y
   * `suscripcion` vienen en null.
   */
  const sinSuscripcionLive =
    susc === null
      ? null
      : susc.alumnos.por_origen.manual.total + susc.alumnos.por_origen.oritalk;

  /**
   * EL RECUENTO CRUDO DE WOOCOMMERCE, en la tarjeta y no sólo en el panel de
   * abajo.
   *
   * No es otra versión del número principal: es OTRA UNIDAD. El principal cuenta
   * PERSONAS de nuestra base; éste cuenta SUSCRIPCIONES, tal cual las agrupa el
   * admin de WooCommerce en su filtro "Activas". Ya estaba en la página, pero a
   * media pantalla de distancia, y esa distancia es justo la que hacía que
   * alguien comparara el 133 de la tarjeta contra el filtro de Woo y concluyera
   * que el dashboard estaba mal. Dentro de la misma tarjeta, la comparación se
   * hace sola y con la etiqueta delante.
   *
   * `pending-cancel` (las que dan acceso sin estar "activas") NO se muestra acá:
   * se probó y sumaba una tercera unidad a una tarjeta que ya tenía dos. Vive en
   * el panel "Suscripciones en WooCommerce" de más abajo, con el resto de los
   * estados, que es donde se va a buscar por qué 127 y 133 no cuadran.
   *
   * Por wooPorEstado y no del payload: con Woo caído llegan ceros que no
   * significan cero (ver lib/suscripcionesHelpers).
   */
  const wooActivas = wooPorEstado(susc, "active");

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

  /**
   * SUSCRIPCIONES ACTIVAS, HISTÓRICO. Sale de DB_KPI y no del endpoint en vivo:
   * de las dos fuentes es la única que guarda el pasado (ver la nota de arriba).
   * Rango propio, como el resto de los gráficos.
   */
  const suscActivasRows = applyRange(months, suscRange).map((month) => ({
    month,
    suscripciones_activas: kpi.data[month]?.["suscripciones_activas"] ?? null,
  }));

  /**
   * MESES TODAVÍA ABIERTOS a la vista. El registro del Sheet se carga a mano y
   * el mes en curso sólo tiene los movimientos que ya ocurrieron: sin decirlo,
   * una barra corta al final se lee como una caída y no como un mes a medio
   * anotar. Se calcula por separado para la tarjeta (el mes del desplegable) y
   * para el gráfico (cualquier mes del rango visible, que en la práctica es el
   * último).
   */
  const activeMonthEnCurso = esMesEnCurso(activeMonth);
  const graficoSuscConMesEnCurso = suscActivasRows.some((fila) =>
    esMesEnCurso(fila.month)
  );

  /**
   * ---- MISMO TRAMO DEL MES, CONTRA EL MES PASADO ----
   *
   * La única cosa de esta página que lee la hoja "KPI Diario" (la que alimenta
   * Resumen Ejecutivo (D)), y la lee porque es la ÚNICA con granularidad de día:
   * DB_KPI sólo tiene el total del mes, así que con ella no se puede cortar "del
   * 1 al 23" y este comparativo no existiría.
   *
   * QUÉ MIDE, y en qué se diferencia del MoM que ya está en las tarjetas: el MoM
   * compara mes COMPLETO contra mes COMPLETO anterior, así que el mes en curso
   * siempre pierde —le faltan días—. Acá se compara el tramo transcurrido contra
   * EL MISMO TRAMO del mes anterior (1-23 ago vs 1-23 jul), que es la única
   * comparación que responde "¿vamos mejor?" sin que la respuesta dependa de en
   * qué día del mes estemos mirando.
   *
   * El corte lo pone el último día CON FILA en la hoja, no el reloj: ver
   * tramoTranscurrido() en kpiDiarioHelpers.
   */
  const diario = useLiveData<DailyKpiData>("/api/kpi-diario", 60_000);
  const kpiDiario = diario.data ?? EMPTY_DAILY_KPI;

  const tramoActual = tramoTranscurrido(kpiDiario.days);
  const tramoPrevio = tramoActual ? tramoMesAnterior(tramoActual) : null;

  const totalTramoActual = tramoActual
    ? aggregate(kpiDiario, METRICA_TRAMO, daysInRange(kpiDiario.days, tramoActual))
    : null;
  const totalTramoPrevio = tramoPrevio
    ? aggregate(kpiDiario, METRICA_TRAMO, daysInRange(kpiDiario.days, tramoPrevio))
    : null;

  const deltaTramo =
    totalTramoActual === null || totalTramoPrevio === null
      ? null
      : totalTramoActual - totalTramoPrevio;
  // En puntos (×100), que es lo que espera el badge de KpiCard. Con un tramo
  // previo de 0 no hay porcentaje que calcular y queda sólo el delta absoluto.
  const momTramo =
    deltaTramo === null || !totalTramoPrevio
      ? null
      : (deltaTramo / Math.abs(totalTramoPrevio)) * 100;

  /**
   * Las dos curvas superpuestas por DÍA DEL MES (no por fecha): el eje X va del
   * 1 al día de corte y cada punto es el acumulado hasta ahí, así la línea de
   * arriba es, literalmente, el mes que va ganando.
   *
   * El largo lo manda el tramo más largo de los dos. Cuando el mes anterior se
   * quedó corto (febrero contra un corte en 30), su serie termina antes y la
   * línea se corta: es exactamente lo que pasó, y taparlo repitiendo el último
   * valor dibujaría días que ese mes no tuvo.
   */
  const filasTramo = (() => {
    if (!tramoActual || !tramoPrevio) return [];
    const actual = acumuladoPorDiaDelMes(kpiDiario, METRICA_TRAMO, tramoActual);
    const previo = acumuladoPorDiaDelMes(kpiDiario, METRICA_TRAMO, tramoPrevio);
    const dias = Math.max(actual.length, previo.length);
    return Array.from({ length: dias }, (_, i) => ({
      dia: i + 1,
      actual: actual[i] ?? null,
      previo: previo[i] ?? null,
    }));
  })();

  const etiquetaTramoActual = tramoActual
    ? formatDayRangeShort(tramoActual.from, tramoActual.to)
    : "";
  const etiquetaTramoPrevio = tramoPrevio
    ? formatDayRangeShort(tramoPrevio.from, tramoPrevio.to)
    : "";

  /**
   * El mes anterior no llegó al día de corte (pasa con los cortes 29-31), así
   * que los dos tramos NO miden el mismo número de días y el total del actual
   * juega con días de ventaja. No se corrige recortando el actual —eso sería
   * esconder días que sí ocurrieron—: se avisa y se deja la lectura al que mira.
   */
  const tramosDeDistintoLargo =
    tramoActual !== null &&
    tramoPrevio !== null &&
    tramoPrevio.corte < tramoActual.corte;

  /**
   * El tramo previo cae fuera de lo que la hoja tiene cargado (el histórico
   * diario arranca después). Sin él no hay comparación: "sin datos" antes que
   * pintar el mes actual solo, que se leería como que el anterior fue 0.
   */
  const sinTramoPrevio = totalTramoPrevio === null;

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

      {/*
        ARRIBA DE TODO, y FUERA del `hasAnyData` que gobierna el resto de la
        página: son las dos cifras que primero se buscan al abrir el dashboard
        —cuánta gente hay dentro y cuánta paga— y no salen del Sheet, así que un
        DB_KPI vacío o caído no tiene por qué llevárselas por delante.

        Las dos vienen del MISMO recuento en vivo de DRC Gestión y una está
        dentro de la otra: total de alumnos con acceso y, dentro, los que pagan
        una suscripción de WooCommerce (los que componen el MRR). El desglose
        completo —por dónde entra el acceso y en qué estado están las
        suscripciones de Woo— sigue más abajo, en su panel.
      */}
      <div className="mb-8 space-y-3">
        {/* El LiveIndicator del encabezado habla del Sheet (lo dice su propio
            texto de error), así que acá NO se repite: estas dos tarjetas salen
            de DRC Gestión, y el momento del recuento lo da el pie de abajo con
            la fecha que manda el propio endpoint. */}
        <h3 className="text-xs uppercase tracking-wide text-drc-ink-soft">
          Ahora mismo · en vivo
        </h3>

        {suscLoading && !susc && (
          <div className="text-sm text-drc-ink-soft">
            Cargando suscripciones…
          </div>
        )}

        {!suscLoading && !susc && (
          <EmptyState label="Sin datos de suscripciones: DRC Gestión no respondió" />
        )}

        {susc && (
          <>
            {/* Woo caído NO vacía el bloque: las activaciones manuales y Oritalk
                salen de la base del otro lado y siguen siendo válidas. Sólo se
                cae lo que depende de WooCommerce. */}
            {wooCaido && (
              <Aviso titulo="Sin conexión con WooCommerce">
                DRC Gestión no pudo leer las suscripciones
                {susc.woocommerce.error ? ` (${susc.woocommerce.error})` : ""}, así
                que el total de activos y los que entran por suscripción quedan en
                «—». No son ceros, es un dato que falta.
              </Aviso>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <KpiCard
                size="titular"
                label="Alumnos activos (total)"
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
                hint={
                  <>
                    <div>
                      Cuenta PERSONAS con acceso hoy, por cualquiera de los tres
                      orígenes (suscripción, activación manual u Oritalk). Es el
                      mismo número que decide quién puede entrar a clase. NO todas
                      facturan como MRR.
                    </div>
                    <div>
                      Foto del PRESENTE, sin historial: no cambia con el
                      desplegable de mes
                      {activeMonth ? ` (ahora ${activeMonth})` : ""}.
                    </div>
                  </>
                }
              />
              {/* Los alumnos sin suscripción van de sub-valor acá y no en la
                  tarjeta del total: es a esta tarjeta a la que le falta ese
                  trozo del negocio —lo que entra sin suscripción de Woo—, y sin
                  él el titular se lee como si fuera todo lo que se cobra.
                  Además sobrevive a Woo caído (sale de la base del otro lado),
                  así que la tarjeta sigue diciendo algo aunque el titular quede
                  en «—». */}
              <KpiCard
                size="titular"
                /* EL TITULAR ES EL CRUDO DE WOOCOMMERCE (decisión de Facundo,
                   01/09/2026). Antes eran las personas de nuestra base con
                   suscripción vigente (133), que es un número más elaborado
                   —descuenta huérfanas y duplicadas— pero que no se puede cuadrar
                   contra ninguna pantalla: al lado del filtro "Activas" de Woo no
                   daba igual, y esa diferencia se leía como un error del
                   dashboard. Ahora el titular es exactamente lo que Woo enseña,
                   y las personas viven en la dona del panel de abajo.

                   Ojo con la UNIDAD, que cambió con el número: esta tarjeta ya
                   NO cuenta lo mismo que la de al lado. Ver el pie de las dos. */
                label="Suscripciones activas (en vivo)"
                value={formatNumber(wooActivas)}
                subValues={[
                  /* "Pago único y accesos manuales" y no "pago único" a secas:
                     de los 40 de hoy, 21 son de pago único, 13 no tienen tipo
                     de producto, 3 tienen suscripción pero entran por una
                     activación manual, y 3 son de Oritalk. Llamarlos a todos
                     pago único sería inventar el origen de la mitad.

                     Y son PERSONAS, no suscripciones: por eso la etiqueta dice
                     "alumnos" y no se resta del titular. */
                  {
                    label: "Alumnos de pago único y acceso manual",
                    value: formatNumber(sinSuscripcionLive),
                  },
                ]}
                hint={
                  <>
                    {/* Dos líneas y no cuatro: las unidades van dichas en las
                        propias etiquetas ("Suscripciones" arriba, "Alumnos"
                        abajo), así que el pie sólo tiene que confirmarlo y decir
                        dónde está el desglose. */}
                    <div>
                      Cuenta <strong>SUSCRIPCIONES</strong> de WooCommerce, tal
                      cual su filtro «Activas»: es el número que se cuadra contra
                      el admin de Woo. La línea de abajo son{" "}
                      <strong>ALUMNOS</strong>, otra unidad — no se resta de éste.
                      El desglose por estado está en el panel de más abajo.
                    </div>
                    <div>
                      Foto del PRESENTE: no cambia con el desplegable de mes. El
                      mes a mes sale del Sheet, más abajo.
                    </div>
                  </>
                }
              />
            </div>

            {/* La aclaración va siempre y no como tooltip: que un alumno activo
                no genere MRR es contraintuitivo, y nadie va a pasar el ratón por
                encima de un número que cree entender. */}
            <p className="text-[11px] text-drc-ink-soft">
              Las dos tarjetas salen del mismo recuento en vivo del{" "}
              {susc.today_madrid} (hora de España), pero{" "}
              <strong>no cuentan lo mismo</strong>: a la izquierda ALUMNOS con
              acceso, a la derecha SUSCRIPCIONES de WooCommerce. No se restan
              entre sí — una persona puede tener dos suscripciones a la vez, y
              los alumnos con{" "}
              <strong>
                acceso manual (plan de empresa o alta a mano) o de Oritalk
              </strong>{" "}
              están activos y reciben clases sin ninguna suscripción, así que no
              generan MRR vía WooCommerce.
            </p>
          </>
        )}
      </div>

      {loading && !hasAnyData && (
        <div className="text-sm text-drc-ink-soft">Cargando datos del Sheet…</div>
      )}

      {!loading && !hasAnyData && (
        <EmptyState label='No se encontraron datos en la hoja "DB_KPI". Verificá el Sheet ID y las credenciales.' />
      )}

      {hasAnyData && (
        <div className="space-y-6">
          {/* Va ARRIBA DE TODO y no al lado de cada tarjeta: cuando una
              columna falta, las tarjetas afectadas ya muestran “—”, y el
              lector necesita saber que ese guion no significa “agosto todavía
              no se cargó” antes de sacar conclusiones de la página entera. */}
          {columnasAusentes.length > 0 && (
            <Aviso titulo="Faltan columnas en DB_KPI">
              La hoja no trae{" "}
              <strong>{columnasAusentes.join(", ")}</strong>. No es que falte
              el dato de este mes: la columna no llegó para ninguno, así que las
              tarjetas que dependen de ella muestran «—» siempre. Suele ser una
              fórmula rota en «KPI General» (o río arriba, en las hojas que esa
              lee), que el FILTER de DB_KPI convierte en columna ausente en vez
              de en error visible.
            </Aviso>
          )}
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

            {/* --- Fila 2 · MRR ---
                Pedidos tenía esta fila y bajó a la de secundarias: es volumen,
                no dinero, y arriba compite con las dos cifras que sí mandan
                (ingresos y recurrente). AOV se fue con él —es el ticket DE esos
                pedidos y sueltos no se leen—; Ventas se queda arriba porque es
                el cierre del mes y cuadra con el embudo de ads. */}
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
                    {/* Esta tarjeta cambia de mes con el desplegable de arriba,
                        o sea que es una vista histórica: tiene que decir que un
                        mes cerrado puede no salir igual la próxima vez. */}
                    {profesMes?.is_current_month === false && (
                      <div>{AVISO_MESES_RETROACTIVOS}</div>
                    )}
                  </>
                )
              }
            />
          </div>

          {/* El aviso AZUL de ventanas dudosas, con el listado de alumnos
              detrás. Acá es más necesario que en Profesores: allí hay una tabla
              debajo donde cada profesor lleva su chip, y en esta página la
              tarjeta de margen está sola, así que sin este bloque el problema no
              se vería en ninguna parte. El ⚠ amarillo de cifra parcial sigue en
              la esquina de la tarjeta: son dos avisos distintos. */}
          {profesMes && (
            <VentanasDudosasNota
              mes={profesMes}
              coda="El detalle profesor por profesor está en la página Profesores."
            />
          )}

          {/* --- Fila 6 · Secundarias: volumen y registro mensual ---
              Todas las de esta fila SIGUEN estando (ninguna se borró), pero
              debajo de las principales y sin ninguna titular: son datos de
              apoyo, no la lectura del negocio.

              · Pedidos y AOV: volumen y ticket. Un pedido no es un cliente ni un
                euro de recurrente, y en la primera pantalla se leían como si
                fueran el titular del mes.
              · Suscripciones activas del Sheet: es la MISMA pregunta que la
                tarjeta en vivo de arriba pero con otra respuesta, y arriba,
                pegadas, se leían como si una desmintiera a la otra. Acá está
                lejos, etiquetada por lo que mide y con el pie diciendo en qué se
                diferencia. No se borra porque es la única de las dos fuentes con
                MESES PASADOS: WooCommerce no guarda el estado viejo de una
                suscripción, así que el histórico sólo existe en esta columna. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <KpiCard
              label="Pedidos"
              value={formatNumber(pedidos)}
              mom={getMoMAtMonth(kpi, "pedidos", activeMonth)}
              subValues={[
                { label: "vs. mes anterior", value: formatNumberDelta(pedidosDelta) },
              ]}
            />
            <KpiCard
              label="AOV"
              value={formatCurrency(getValueAtMonth(kpi, "AOV", activeMonth))}
              mom={getMoMAtMonth(kpi, "AOV", activeMonth)}
            />
            {/* "según registro mensual" y no "(Sheet)" a secas: arriba hay un
                recuento EN VIVO de suscripciones, y decir de qué fuente sale
                cada uno no alcanza — hay que decir QUÉ mide. Ésta es la del mes
                elegido en el desplegable, tal como quedó anotada en DB_KPI. */}
            <KpiCard
              label="Suscripciones activas · según registro mensual"
              value={formatNumber(suscActivas)}
              mom={getMoMAtMonth(kpi, "suscripciones_activas", activeMonth)}
              subValues={[
                {
                  label: "vs. mes anterior",
                  value: formatNumberDelta(suscActivasDelta),
                },
              ]}
              hint={
                <>
                  {activeMonthEnCurso ? (
                    <div>
                      {activeMonth} está EN CURSO: el mes actual puede estar
                      incompleto hasta que se registren todos los movimientos. Si
                      un alumno todavía no renovó ni canceló, eso no está anotado
                      aún — un número bajo acá no es una caída.
                    </div>
                  ) : (
                    <div>
                      Columna suscripciones_activas de DB_KPI, del mes elegido
                      arriba.
                    </div>
                  )}
                  <div>
                    NO es la tarjeta «Suscripciones activas (en vivo)» del
                    principio de la página. Las dos cuentan suscripciones, pero
                    de fuentes y momentos distintos: acá lo anotado en el Sheet
                    mes a mes, allá lo que WooCommerce contesta HOY. Ésta es la
                    única de las dos que tiene meses pasados.
                  </div>
                </>
              }
            />
          </div>

          {/* --- MISMO TRAMO DEL MES, MES CONTRA MES ---
              El primer panel de la página porque responde la pregunta que trae
              casi todo el que la abre —"¿vamos mejor que el mes pasado?"— y la
              responde SIN el sesgo del MoM de las tarjetas, que compara un mes a
              medio hacer contra uno cerrado y hace perder al actual por el solo
              hecho de que todavía no terminó. Ver la nota de tramoActual. */}
          <Panel
            title={`Mismo tramo del mes · ${METRICA_TRAMO_LABEL.toLowerCase()}`}
            description={
              tramoActual && tramoPrevio
                ? `Lo que va del mes contra el MISMO tramo de días del mes anterior: ${etiquetaTramoActual} contra ${etiquetaTramoPrevio}. Cada línea es el acumulado del mes desde su día 1, y el eje es el día del mes, no la fecha — la de arriba es la que va ganando.`
                : "Lo que va del mes contra el mismo tramo de días del mes anterior, con el acumulado día a día de los dos."
            }
          >
            {!tramoActual ? (
              <EmptyState label='Sin datos en la hoja "KPI Diario"' />
            ) : sinTramoPrevio ? (
              <EmptyState
                label={`El histórico diario no llega a ${etiquetaTramoPrevio}: no hay tramo anterior contra el que comparar`}
              />
            ) : (
              <>
                {/* Los dos totales antes del gráfico: el gráfico dice cómo se
                    llegó hasta acá, pero quién va ganando tiene que poder leerse
                    sin interpretar una curva. El badge lleva el tramo contra el
                    que compara pegado, igual que en la página diaria. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                  <KpiCard
                    size="titular"
                    label={`${METRICA_TRAMO_LABEL} · ${etiquetaTramoActual}`}
                    value={formatNumber(totalTramoActual)}
                    mom={momTramo}
                    momDelta={deltaTramo}
                    period={`vs. ${etiquetaTramoPrevio}`}
                    semaforo={
                      deltaTramo === null
                        ? "neutral"
                        : deltaTramo >= 0
                          ? "green"
                          : "red"
                    }
                  />
                  <KpiCard
                    label={`${METRICA_TRAMO_LABEL} · ${etiquetaTramoPrevio}`}
                    value={formatNumber(totalTramoPrevio)}
                    hint="El mismo tramo de días del mes anterior. Es la referencia contra la que se compara, no el total de ese mes."
                  />
                </div>

                <MultiTrendChart
                  data={filasTramo}
                  /* El eje X es el DÍA DEL MES (1, 2, 3…), que es lo que hace
                     que las dos series se puedan superponer: con fechas, julio
                     y agosto irían uno detrás del otro. minTickGap alto para que
                     recharts saltee ticks en vez de apretar 31 etiquetas. */
                  xKey="dia"
                  xMinTickGap={18}
                  legendInSeriesOrder
                  series={[
                    {
                      key: "actual",
                      label: etiquetaTramoActual,
                      color: CAT.verde,
                    },
                    {
                      key: "previo",
                      label: etiquetaTramoPrevio,
                      color: NEUTRO.gris,
                    },
                  ]}
                  valueFormatter={(v) => formatNumber(v)}
                />

                {/* Los cortes 29-31 no existen en todos los meses: addMonths ya
                    hace clamp, pero un total sobre 31 días contra otro sobre 28
                    no es un empate justo y hay que decirlo en vez de dejarlo en
                    la letra pequeña de las fechas. */}
                {tramosDeDistintoLargo && (
                  <div className="mt-4">
                    <Aviso titulo="Los dos tramos NO miden los mismos días">
                      El mes anterior se quedó sin días antes de llegar al día{" "}
                      {tramoActual.corte}: {etiquetaTramoPrevio} son{" "}
                      {tramoPrevio.corte} días contra {tramoActual.corte} de{" "}
                      {etiquetaTramoActual}. El total de este mes juega con{" "}
                      {tramoActual.corte - tramoPrevio.corte}{" "}
                      {tramoActual.corte - tramoPrevio.corte === 1
                        ? "día"
                        : "días"}{" "}
                      de ventaja, y la línea gris del gráfico termina antes por el
                      mismo motivo.
                    </Aviso>
                  </div>
                )}

                <p className="mt-4 text-[11px] text-drc-ink-soft">
                  Columna <strong>{METRICA_TRAMO}</strong> de la hoja «KPI
                  Diario», la única con granularidad de día (DB_KPI sólo tiene el
                  total del mes y no se puede cortar por día). Son las{" "}
                  <strong>altas</strong>: los clientes que compran por primera
                  vez, sin los recurrentes. El corte lo pone el último día CON
                  FILA en la hoja, no el reloj, para que un Sheet atrasado no
                  meta días vacíos de un solo lado.
                </p>
              </>
            )}
          </Panel>

          {/* --- EN VIVO · DESGLOSE de los activos y de las suscripciones ---
              Las dos cifras de este recuento (activos y suscripciones) subieron
              al principio de la página: son las que se buscan al abrir y no
              podían estar a media pantalla de scroll. Acá se queda el DESGLOSE,
              que es lo que sí necesita el espacio de un panel — por dónde entra
              el acceso y en qué estado están las suscripciones de Woo.

              Sigue inmediatamente encima del panel del histórico a propósito:
              son las dos mitades de la misma pregunta, y separadas por media
              página cualquiera de las dos se leería como "el" número de
              suscripciones activas. */}
          <Panel
            title="Desglose del recuento en vivo"
            description="Cómo se reparten los alumnos activos de arriba según por dónde les entra el acceso, y en qué estado están las suscripciones de WooCommerce. Foto del PRESENTE, sin historial: no cambia con el desplegable de mes. WooCommerce no guarda el estado viejo de una suscripción, así que no hay forma de saber cuántas había activas en un mes pasado — ese histórico sale del Sheet y está en el panel de abajo. Un alumno cuenta como activo si tiene suscripción de WooCommerce vigente, activación manual en curso o es de Oritalk: la misma regla que decide si puede entrar a clase."
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
                {/* El aviso de "Woo caído" NO se repite acá: ya está arriba, en
                    el bloque en vivo, y dos veces en la misma página se lee como
                    dos incidencias distintas. Lo que Woo se lleva puesto en este
                    panel lo dice cada mitad con su propio EmptyState. */}

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

          {/* --- HISTÓRICO · suscripciones activas mes a mes (DB_KPI) ---
              Gráfico de barras y no una tarjeta suelta: lo que hace valiosa a
              esta fuente es justamente que TIENE historial, y una tarjeta con un
              número lo tira. Además deja ver de un vistazo si el mes en curso
              viene por debajo de la serie sólo porque todavía se está anotando.
              Mismo componente y mismo RangeFilter que el resto de los gráficos
              de la página. */}
          <Panel
            title="Suscripciones activas (histórico) · según registro mensual"
            description="Columna suscripciones_activas de DB_KPI, que se anota a mano mes a mes: ésta SÍ tiene historial y sí responde al rango de la derecha. Cuenta SUSCRIPCIONES de cada mes, no personas de hoy."
            action={<RangeFilter value={suscRange} onChange={setSuscRange} />}
          >
            <BarComparison
              data={suscActivasRows}
              /* Una sola serie: la leyenda no identificaría nada que el título
                 del panel no diga ya (ver showLegend en BarComparison). */
              showLegend={false}
              series={[
                {
                  key: "suscripciones_activas",
                  label: "Suscripciones activas",
                  color: CAT.verde,
                },
              ]}
              valueFormatter={(v) => formatNumber(v)}
            />

            {/* El aviso aparece SIEMPRE que el mes en curso esté a la vista, y
                como aviso y no como tooltip: una última barra corta es
                exactamente lo que se lee como una caída, y nadie pasa el ratón
                por encima de algo que cree entender. */}
            {graficoSuscConMesEnCurso && (
              <div className="mt-4">
                <Aviso titulo="El mes actual puede estar incompleto">
                  Los movimientos se anotan en el Sheet a medida que pasan, así
                  que el mes en curso sólo tiene los que ya ocurrieron: si un
                  alumno todavía no renovó ni canceló este mes, ese movimiento no
                  existe todavía en el registro. La última barra puede quedar
                  corta por eso y no por una caída real.
                </Aviso>
              </div>
            )}

            {/* La comparación con el panel de arriba se explica acá y no allá:
                quien llega a este gráfico buscando "cuántas suscripciones
                activas hay" ya vio el número en vivo, y lo que necesita saber es
                por qué no coincide. */}
            <p className="mt-4 text-[11px] text-drc-ink-soft">
              No tiene por qué coincidir con «Suscripciones activas (en vivo)»
              del panel de arriba, y si coincide es casualidad: acá hay{" "}
              <strong>lo anotado en el Sheet mes a mes</strong> y allá{" "}
              <strong>lo que WooCommerce contesta hoy</strong>. Misma unidad, dos
              fuentes y dos momentos distintos.
            </p>
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
