"use client";

import { useEffect, useState } from "react";

function timeAgo(fetchedAt: number | null): string {
  if (!fetchedAt) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - fetchedAt) / 1000));
  if (seconds < 5) return "hace un instante";
  if (seconds < 60) return `hace ${seconds}s`;
  const mins = Math.round(seconds / 60);
  return `hace ${mins} min`;
}

export function LiveIndicator({
  fetchedAt,
  error,
}: {
  fetchedAt: number | null;
  error?: string | null;
}) {
  const [, force] = useState(0);

  // Re-render cada 5s para que el "hace Xs" no quede pegado
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={
          "relative inline-flex h-2 w-2 rounded-full " +
          (error ? "bg-drc-red" : "bg-drc-green")
        }
      >
        {!error && (
          <span className="absolute inset-0 rounded-full bg-drc-green animate-ping opacity-60" />
        )}
      </span>
      <span className="text-drc-ink-soft">
        {error ? "Sin conexión con Sheets" : `En vivo · actualizado ${timeAgo(fetchedAt)}`}
      </span>
    </div>
  );
}
