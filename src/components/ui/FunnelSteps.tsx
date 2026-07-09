import { EmptyState } from "./EmptyState";

export interface FunnelStep {
  label: string;
  value: number | null;
}

/**
 * Funnel horizontal de 2 pasos (Leads -> Ventas), con el ancho de cada
 * barra proporcional al valor y la tasa de conversión entre pasos.
 */
export function FunnelSteps({ steps }: { steps: FunnelStep[] }) {
  const values = steps.map((s) => s.value).filter((v): v is number => v !== null);
  if (values.length === 0) return <EmptyState />;

  const max = Math.max(...values);

  return (
    <div className="space-y-3">
      {steps.map((step, i) => {
        const pct = step.value !== null && max > 0 ? (step.value / max) * 100 : 0;
        const prev = i > 0 ? steps[i - 1].value : null;
        const conversion =
          prev && step.value !== null && prev > 0
            ? ((step.value / prev) * 100).toFixed(1)
            : null;

        return (
          <div key={step.label}>
            <div className="flex items-baseline justify-between text-xs mb-1">
              <span className="text-drc-ink-soft">{step.label}</span>
              <span className="tabular font-medium text-drc-ink">
                {step.value !== null ? step.value.toLocaleString("es-ES") : "—"}
              </span>
            </div>
            <div className="h-8 rounded-md bg-drc-bg overflow-hidden border border-drc-line">
              <div
                className="h-full rounded-md"
                style={{
                  width: `${Math.max(pct, step.value ? 4 : 0)}%`,
                  background:
                    i === 0
                      ? "linear-gradient(90deg, var(--drc-green), #3fbb59)"
                      : "linear-gradient(90deg, var(--drc-yellow), #ffd94d)",
                }}
              />
            </div>
            {conversion && (
              <div className="mt-1 text-[11px] text-drc-ink-soft">
                {conversion}% de conversión desde el paso anterior
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
