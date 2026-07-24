"use client";

import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  Cell,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { EmptyState } from "./EmptyState";
import { CAT, GASTO, NEUTRO } from "@/lib/chartColors";

/**
 * Los 4 cuadrantes, cruzando volumen (eje X) con crecimiento (eje Y). Es una
 * codificación de ESTADO, no una categórica: cada color dice en qué situación
 * está el producto, y por eso puede usar el rojo (cae y además pesa poco) sin
 * romper la reserva de rojo=pérdida.
 */
export const CUADRANTES = [
  { key: "estrella", label: "Estrella", desc: "pesa y crece", color: CAT.verde },
  { key: "promesa", label: "Promesa", desc: "crece pero pesa poco", color: CAT.oro },
  { key: "maduro", label: "Maduro", desc: "pesa pero cae", color: NEUTRO.gris },
  { key: "riesgo", label: "En riesgo", desc: "cae y pesa poco", color: GASTO.base },
] as const;

export type CuadranteKey = (typeof CUADRANTES)[number]["key"];

export interface QuadrantPoint {
  label: string;
  /** Eje X: volumen (ingresos del mes, en €). */
  x: number;
  /** Eje Y: crecimiento vs. mes anterior, en PUNTOS porcentuales. */
  y: number;
}

const COLOR_BY_KEY: Record<CuadranteKey, string> = Object.fromEntries(
  CUADRANTES.map((c) => [c.key, c.color])
) as Record<CuadranteKey, string>;

/** Clasifica un punto según en qué lado de los dos ejes de corte cae. */
export function clasificar(
  p: { x: number; y: number },
  cortesX: number
): CuadranteKey {
  const pesa = p.x >= cortesX;
  const crece = p.y >= 0;
  if (pesa && crece) return "estrella";
  if (!pesa && crece) return "promesa";
  if (pesa && !crece) return "maduro";
  return "riesgo";
}

/**
 * Dispersión volumen × crecimiento con los dos ejes de corte dibujados, para
 * leer de un vistazo qué productos son "estrella".
 *
 * El corte vertical es la MEDIANA de los volúmenes, no la media: con un catálogo
 * donde un producto se lleva la mitad de los ingresos, la media deja a casi todo
 * el catálogo del lado "pesa poco" y el cuadrante pierde sentido.
 *
 * Los puntos no se etiquetan sobre el gráfico (con 10 productos los textos se
 * pisan): la identidad la dan el tooltip y las fichas de debajo, que el llamador
 * pinta a partir de la misma clasificación.
 */
export function QuadrantChart({
  data,
  height = 320,
  xFormatter,
  yFormatter,
  xLabel,
  yLabel,
}: {
  data: QuadrantPoint[];
  height?: number;
  xFormatter?: (v: number) => string;
  yFormatter?: (v: number) => string;
  xLabel?: string;
  yLabel?: string;
}) {
  if (data.length === 0) return <EmptyState />;

  const cortesX = medianaX(data);
  const puntos = data.map((p) => ({ ...p, cuadrante: clasificar(p, cortesX) }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 16 }}>
        <CartesianGrid stroke="var(--drc-line)" />
        <XAxis
          type="number"
          dataKey="x"
          name={xLabel ?? "Volumen"}
          tick={{ fontSize: 11, fill: "var(--drc-ink-soft)" }}
          axisLine={{ stroke: "var(--drc-line)" }}
          tickLine={false}
          tickFormatter={(v) => (xFormatter ? xFormatter(v) : String(v))}
        />
        <YAxis
          type="number"
          dataKey="y"
          name={yLabel ?? "Crecimiento"}
          tick={{ fontSize: 11, fill: "var(--drc-ink-soft)" }}
          axisLine={false}
          tickLine={false}
          width={56}
          tickFormatter={(v) => (yFormatter ? yFormatter(v) : String(v))}
        />
        <ZAxis range={[110, 110]} />
        {/* Ejes de corte: crecimiento 0 y mediana de volumen. */}
        <ReferenceLine y={0} stroke="var(--drc-ink-soft)" strokeDasharray="4 4" />
        <ReferenceLine
          x={cortesX}
          stroke="var(--drc-ink-soft)"
          strokeDasharray="4 4"
        />
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid var(--drc-line)",
          }}
          formatter={
            ((v: number, name: string) =>
              name === "y"
                ? [yFormatter ? yFormatter(v) : v, yLabel ?? "Crecimiento"]
                : [xFormatter ? xFormatter(v) : v, xLabel ?? "Volumen"]) as never
          }
          labelFormatter={() => ""}
          itemSorter={(item) => (item.dataKey === "x" ? 0 : 1)}
        />
        <Scatter
          data={puntos}
          stroke="var(--drc-card)"
          strokeWidth={2}
          isAnimationActive={false}
        >
          {puntos.map((p) => (
            <Cell key={p.label} fill={COLOR_BY_KEY[p.cuadrante]} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/** Mediana de los volúmenes: el corte vertical del cuadrante. */
export function medianaX(data: { x: number }[]): number {
  if (data.length === 0) return 0;
  const xs = data.map((p) => p.x).sort((a, b) => a - b);
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 0 ? (xs[mid - 1] + xs[mid]) / 2 : xs[mid];
}
