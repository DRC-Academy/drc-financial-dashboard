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
 */
export function useLiveData<T>(
  url: string,
  intervalMs = 60_000
): UseLiveDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const inFlight = useRef(false);

  const fetchOnce = useCallback(async () => {
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
    const id = setInterval(fetchOnce, intervalMs);
    return () => clearInterval(id);
  }, [fetchOnce, intervalMs]);

  return { data, loading, error, fetchedAt, refresh: fetchOnce };
}
