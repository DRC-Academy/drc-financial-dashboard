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
 * Hace polling de un endpoint interno (que a su vez lee de Google Sheets
 * con cache corta del lado del servidor) para simular "tiempo real" sin
 * bombardear la API de Sheets. Por defecto refresca cada 60s, igual al TTL
 * del cache de servidor.
 *
 * `url` acepta null para el caso de "todavía no sé qué pedir": la sección de
 * profesores necesita el mes elegido en el desplegable, que no existe hasta que
 * carga el Sheet. Con null no se hace ninguna petición (ni la primera ni el
 * polling) en vez de pedir una URL a medio armar.
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
    fetchOnce();
    if (!url) return;
    const id = setInterval(fetchOnce, intervalMs);
    return () => clearInterval(id);
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
