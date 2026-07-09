export function EmptyState({ label = "Sin datos" }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[120px] w-full flex-col items-center justify-center rounded-lg border border-dashed border-drc-line bg-white/40 px-4 py-6 text-center">
      <span className="tabular text-lg text-drc-ink-soft">—</span>
      <span className="mt-1 text-xs text-drc-ink-soft">{label}</span>
    </div>
  );
}
