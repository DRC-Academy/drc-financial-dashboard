import { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  right,
  filter,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  right?: ReactNode;
  /** Filtro de rango de fechas global de la página (se muestra en su propia fila). */
  filter?: ReactNode;
}) {
  return (
    <div className="border-b border-drc-line pb-6 mb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs tracking-[0.2em] uppercase text-drc-ink-soft">
            <span className="tabular text-drc-green">{eyebrow}</span>
            <span className="h-px w-6 bg-drc-line" />
            <span>DRC Academy</span>
          </div>
          <h2 className="mt-2 text-2xl sm:text-3xl font-semibold text-drc-ink">
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-sm text-drc-ink-soft max-w-xl">
              {description}
            </p>
          )}
        </div>
        {right && <div>{right}</div>}
      </div>
      {filter && (
        <div className="mt-4 flex flex-wrap justify-start gap-2 sm:justify-end">
          {filter}
        </div>
      )}
    </div>
  );
}
