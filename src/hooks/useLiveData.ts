"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface LiveResponse<T> {
  ok: boolean;
  data: T | null;
  error?: string;
  fetchedAt: number;
}

interface UseLiveDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
  refresh: () => void;
}

/**
 * Intervalos de polling según qué tan rápido cambia la fuente. Cada polling es
 * una invocación de función en Vercel, así que el intervalo es lo que se paga:
 * se elige por lo que tarda el dato en moverse, no por "lo más fresco posible".
 *
 *   · POLL_SHEETS         → hojas mensuales/semanales (DB_KPI, KPI Semanal, KPI
 *                           Producto, cohortes, cancelaciones, cupones). Se
 *                           cargan a mano y cambian pocas veces al día.
 *   · POLL_SHEETS_DIARIO  → "KPI Diario": también manual, pero es la hoja que
 *                           se mira para seguir el día en curso.
 *   · POLL_DRC_GESTION    → DRC Gestión (suscripciones, profesores): datos que
 *                           sí se mueven solos durante el día.
 *
 * Como al volver a la pestaña se pide el dato al instante (ver abajo), un
 * intervalo largo no deja nunca un número viejo a la vista al cambiar de tab.
 */
export const POLL_SHEETS = 300_000;
export const POLL_SHEETS_DIARIO = 180_000;
export const POLL_DRC_GESTION = 120_000;

/**
 * Hace polling de un endpoint interno (que a su vez lee de Google Sheets o de
 * DRC Gestión, con cache corta del lado del servidor) para simular "tiempo
 * real" sin bombardear las fuentes. Por defecto refresca cada 60s; las páginas
 * pasan uno de los intervalos de arriba.
 *
 * Con la pestaña en segundo plano NO hay polling: nadie está mirando, y una
 * pestaña olvidada seguía generando invocaciones en Vercel las 24 horas. Al
 * volver a estar visible se pide el dato en el momento y se reanuda el
 * intervalo.
 *
 * `url` acepta null para el caso de "todavía no sé qué pedir" (un filtro que
 * depende de datos que aún no llegaron): con null no se hace ninguna petición,
 * ni la primera ni el polling, en vez de pedir una URL a medio armar.
 */
export function useLiveData<T>(
  url: string | null,
  intervalMs = 60_000
): UseLiveDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const inFlight = useRef(false);

  const fetchOnce = useCallback(async () => {
    if (!url) return;
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(url, { cache: "no-store" });
      const json: LiveResponse<T> = await res.json();
      if (json.ok) {
        setData(json.data);
        setError(null);
      } else {
        setError(json.error ?? "No se pudieron cargar los datos");
      }
      setFetchedAt(json.fetchedAt ?? Date.now());
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [url]);

  useEffect(() => {
    // La primera carga va siempre, aunque la pestaña se haya abierto en segundo
    // plano: así al mirarla ya hay algo pintado.
    fetchOnce();
    if (!url) return;

    let id: ReturnType<typeof setInterval> | null = null;
    const arrancar = () => {
      if (id === null) id = setInterval(fetchOnce, intervalMs);
    };
    const parar = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        parar();
      } else {
        // Al volver, el dato puede tener varios intervalos de atraso: se pide
        // ya en vez de esperar al próximo tick.
        fetchOnce();
        arrancar();
      }
    };

    if (!document.hidden) arrancar();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      parar();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchOnce, intervalMs, url]);

  return {
    data,
    // Sin URL no se está esperando nada, así que no es "cargando": se deriva
    // acá en vez de apagar el flag desde el efecto (un setState síncrono dentro
    // del efecto encadena renders, y el linter de React lo marca).
    loading: url ? loading : false,
    error,
    fetchedAt,
    refresh: fetchOnce,
  };
}
